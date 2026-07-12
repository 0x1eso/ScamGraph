package io.scamgraph.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 실시간 피드 허브. /ws/feed 로 접속한 모든 클라이언트에 스캔·신고 이벤트를 브로드캐스트.
 *
 * <p>하트비트는 <b>실제 수집된 위협 지표</b>(PG {@code blocklist} — OpenPhish·URLhaus·ThreatFox·
 * PhishTank·crt.sh·urlscan·경찰청 등 공개 피드에서 워커가 적재한 실데이터)를 순환 방송한다.
 * 각 이벤트에는 실제 출처 라벨({@code source})과 근거 문구({@code note})가 붙는다(설명 가능성).
 *
 * <p>데모 세이프: DB가 비었거나 미가동/오류면 기존 시드 5건으로 폴백하고, 스케줄러는
 * 절대 예외로 멈추지 않는다. 다른 빈(예: ScanController)은 broadcast()로 실스캔 이벤트를 주입한다.
 */
@Component
public class FeedHandler extends TextWebSocketHandler {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // 풀 재적재 주기(실데이터가 신선하게 유지되도록) · 한 번에 가져올 최대 지표 수
    private static final long POOL_REFRESH_MS = 30_000;
    private static final int POOL_LIMIT = 150;

    // blocklist.source(피드 id) → 사람이 읽는 출처 라벨. 미정의 소스는 원본 id 그대로 노출.
    private static final Map<String, String> SOURCE_LABELS = Map.of(
            "openphish", "OpenPhish",
            "phishtank", "PhishTank",
            "crt_sh", "crt.sh",
            "urlhaus", "URLhaus · abuse.ch",
            "threatfox", "ThreatFox · abuse.ch",
            "urlscan", "urlscan.io",
            "police_kr", "경찰청"
    );

    private final JdbcTemplate jdbc;

    // 스레드 세이프 세션 집합 (동시 접속/해제 안전)
    private final CopyOnWriteArraySet<WebSocketSession> sessions = new CopyOnWriteArraySet<>();

    // DB 미가동/공백 시 폴백할 시드 더미 이벤트(피드가 절대 비지 않도록)
    private final List<Map<String, Object>> seeds = List.of(
            feedEvent("report", "cj-delivery-check.top", "url", "danger", "택배 미수령 사칭 문자", "OpenPhish"),
            feedEvent("scan", "kbstat-secure.click", "url", "danger", null, null),
            feedEvent("report", "070-4123-9981", "phone", "warning", "자동응답 보이스피싱", "경찰청"),
            feedEvent("scan", "shinhan-otp.xyz", "url", "danger", null, null),
            feedEvent("report", "kb-security-login.xyz", "url", "warning", "KB 로그인 사칭", "OpenPhish")
    );

    // 실제 수집 지표 풀(blocklist 매핑 결과). null = 아직 미적재 → 시드 폴백.
    // 성공적인 재적재 시에만 원자적으로 교체(일시적 DB 오류가 기존 풀을 지우지 않도록 volatile 참조 스왑).
    private volatile List<Map<String, Object>> realPool;

    private final AtomicInteger poolIndex = new AtomicInteger(0);
    private final AtomicInteger seedIndex = new AtomicInteger(0);

    public FeedHandler(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    /**
     * 이벤트를 JSON으로 직렬화해 열려 있는 모든 세션에 전송.
     * 다른 빈(예: ScanController)이 실이벤트를 주입할 수 있도록 public.
     */
    public void broadcast(Object event) {
        final String json;
        try {
            json = MAPPER.writeValueAsString(event);
        } catch (Exception e) {
            // 직렬화 실패 시 피드는 계속 살아 있어야 하므로 조용히 스킵
            return;
        }
        TextMessage message = new TextMessage(json);
        for (WebSocketSession session : sessions) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(message);
                }
            } catch (Exception e) {
                // 죽은 세션 하나가 루프 전체를 깨지 않도록 격리
            }
        }
    }

    // 4초마다 실제 수집 지표를 하나씩 순환 방송 → 피드는 항상 '진짜' 데이터로 살아 있음.
    // 풀이 비었거나 아직 미적재면 시드로 폴백(데모 세이프).
    @Scheduled(fixedRate = 4000)
    private void heartbeat() {
        Map<String, Object> template;
        List<Map<String, Object>> pool = realPool;
        if (pool != null && !pool.isEmpty()) {
            int idx = Math.floorMod(poolIndex.getAndIncrement(), pool.size());
            template = pool.get(idx);
        } else {
            int idx = Math.floorMod(seedIndex.getAndIncrement(), seeds.size());
            template = seeds.get(idx);
        }
        Map<String, Object> event = new LinkedHashMap<>(template);
        event.put("ts", System.currentTimeMillis());
        broadcast(event);
    }

    // 주기적으로 blocklist(실수집 지표)를 다시 읽어 풀을 갱신한다. 실패해도 기존 풀 유지.
    @Scheduled(fixedRate = POOL_REFRESH_MS)
    private void refreshPool() {
        try {
            List<Map<String, Object>> loaded = loadRealPool();
            if (!loaded.isEmpty()) {
                // 매 재적재마다 순서를 섞어 피드가 더 살아 있는 것처럼 보이게(반복 주기 분산)
                List<Map<String, Object>> shuffled = new ArrayList<>(loaded);
                Collections.shuffle(shuffled);
                realPool = List.copyOf(shuffled);
            }
            // 빈 결과(테이블 공백)면 기존 풀/시드 폴백을 그대로 둔다 — 절대 피드를 죽이지 않음.
        } catch (Exception ignored) {
            // PG 미가동/오류 → 기존 풀(또는 시드) 유지
        }
    }

    /** PG blocklist 에서 최근 수집 지표를 읽어 피드 이벤트 형태로 매핑. 실패/공백이면 빈 리스트. */
    private List<Map<String, Object>> loadRealPool() {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT value, kind, source, source_kind, detail "
                        + "FROM blocklist ORDER BY last_seen DESC, value LIMIT " + POOL_LIMIT,
                (rs, i) -> feedEvent(
                        "report",
                        rs.getString("value"),
                        mapKind(rs.getString("kind")),
                        mapGrade(rs.getString("source_kind")),
                        rs.getString("detail"),
                        sourceLabel(rs.getString("source"))
                ));
        return rows;
    }

    // blocklist.kind(url|domain|ip|phone|account) → 프론트 계약 kind.
    // 도메인·IP 는 프론트가 라벨을 가진 URL 지표로 접어 표시(빈 종류 칩 방지).
    private static String mapKind(String kind) {
        if (kind == null) {
            return "url";
        }
        return switch (kind) {
            case "phone" -> "phone";
            case "account" -> "account";
            default -> "url"; // url · domain · ip · 기타 → url
        };
    }

    // 출처 성격(global|gov)으로 등급 근사: 정부 신고 번호는 warning, 공개 악성 피드는 danger.
    private static String mapGrade(String sourceKind) {
        return "gov".equals(sourceKind) ? "warning" : "danger";
    }

    private static String sourceLabel(String source) {
        if (source == null) {
            return null;
        }
        return SOURCE_LABELS.getOrDefault(source, source);
    }

    // 정해진 JSON 키 순서를 유지하는 피드 이벤트 템플릿 빌더(ts 는 방송 직전에 채운다).
    // origin="feed" 로 외부 위협 피드 유입임을 표시하고, 알려진 경우 source 라벨을 붙인다.
    private static Map<String, Object> feedEvent(String type, String target, String kind,
                                                 String grade, String note, String source) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", type);
        event.put("target", target);
        event.put("kind", kind);
        event.put("grade", grade);
        event.put("risk_score", null); // 피드 지표는 개별 점수를 싣지 않음(근거는 note/source 로 설명)
        event.put("note", note);
        event.put("origin", "feed");
        if (source != null) {
            event.put("source", source);
        }
        return event;
    }
}
