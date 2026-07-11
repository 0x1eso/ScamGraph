package io.scamgraph.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 실시간 피드 허브. /ws/feed 로 접속한 모든 클라이언트에 스캔·신고 이벤트를 브로드캐스트.
 * 데모 세이프: 주기적 더미 이벤트로 피드가 비지 않게 유지하고, 다른 빈이 broadcast()로 실이벤트 주입.
 */
@Component
public class FeedHandler extends TextWebSocketHandler {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // 스레드 세이프 세션 집합 (동시 접속/해제 안전)
    private final CopyOnWriteArraySet<WebSocketSession> sessions = new CopyOnWriteArraySet<>();

    // 하트비트가 순회할 시드 더미 이벤트
    private final List<Map<String, Object>> seeds = List.of(
            event("report", "cj-delivery-check.top", "url", "danger", 92, "택배 미수령 사칭 문자"),
            event("scan", "kbstat-secure.click", "url", "danger", 95, null),
            event("report", "070-4123-9981", "phone", "warning", 20, "자동응답 보이스피싱"),
            event("scan", "shinhan-otp.xyz", "url", "danger", 90, null),
            event("report", "kb-security-login.xyz", "url", "warning", 38, "KB 로그인 사칭")
    );

    private final AtomicInteger seedIndex = new AtomicInteger(0);

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

    // 4초마다 시드 더미 이벤트를 순환 브로드캐스트 → 피드 항상 활성
    @Scheduled(fixedRate = 4000)
    private void heartbeat() {
        int idx = Math.floorMod(seedIndex.getAndIncrement(), seeds.size());
        Map<String, Object> seed = seeds.get(idx);
        Map<String, Object> event = new LinkedHashMap<>(seed);
        event.put("ts", System.currentTimeMillis());
        broadcast(event);
    }

    // 정해진 JSON 키 순서를 유지하는 이벤트 맵 빌더
    private static Map<String, Object> event(String type, String target, String kind,
                                             String grade, Integer riskScore, String note) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", type);
        event.put("target", target);
        event.put("kind", kind);
        event.put("grade", grade);
        event.put("risk_score", riskScore);
        event.put("note", note);
        event.put("ts", System.currentTimeMillis());
        return event;
    }
}
