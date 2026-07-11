package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 알림 구독(watchlist) · 위협 알림 피드 API.
 * 관심 도메인/번호/계좌/브랜드를 감시 등록하고, 새 위협이 잡히면 알림으로 흐른다.
 * DB 가 비었거나 다운이면 시드 알림/워치리스트로 폴백한다(데모 세이프).
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Alert", description = "알림 구독 · 위협 알림 피드 API")
public class AlertController {

    private static final int MAX_SUBSCRIBER = 256;
    private static final int MAX_TARGET = 512;
    private static final int MAX_KIND = 32;
    private static final int MAX_CHANNEL = 32;
    private static final int MAX_LIMIT = 100;

    private final JdbcTemplate jdbc;

    public AlertController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping("/subscribe")
    @Operation(summary = "알림 구독 등록",
            description = "관심 대상(도메인·번호·계좌·브랜드)을 워치리스트에 등록합니다. "
                    + "동일 구독은 중복 없이(ON CONFLICT) 처리됩니다.")
    public Object subscribe(@RequestBody SubscribeRequest req) {
        String subscriber = cap(req.subscriber(), MAX_SUBSCRIBER);
        String target = cap(req.target(), MAX_TARGET);
        String kind = blank(req.kind()) ? "brand" : cap(req.kind(), MAX_KIND);
        String channel = blank(req.channel()) ? "web" : cap(req.channel(), MAX_CHANNEL);

        // 입력 검증 — 필수값 방어 (500 대신 명시적 오류 응답)
        if (blank(subscriber) || blank(target)) {
            Map<String, Object> bad = new LinkedHashMap<>();
            bad.put("ok", false);
            bad.put("error", "subscriber 와 target 은 필수입니다.");
            return bad;
        }

        ensureSubscriptionsTable();

        Long id = null;
        try {
            // ON CONFLICT DO NOTHING + RETURNING: 신규면 id 반환, 중복이면 빈 결과
            List<Long> ids = jdbc.query(
                    "INSERT INTO subscriptions (subscriber, target, kind, channel) VALUES (?, ?, ?, ?) "
                            + "ON CONFLICT (subscriber, target) DO NOTHING RETURNING id",
                    (rs, i) -> rs.getLong("id"), subscriber, target, kind, channel);
            if (!ids.isEmpty()) {
                id = ids.get(0);
            } else {
                // 이미 구독 중 → 기존 id 조회
                List<Long> existing = jdbc.query(
                        "SELECT id FROM subscriptions WHERE subscriber = ? AND target = ?",
                        (rs, i) -> rs.getLong("id"), subscriber, target);
                if (!existing.isEmpty()) {
                    id = existing.get(0);
                }
            }
        } catch (Exception ignored) {
            // DB 미가동 → id 없이도 접수 응답은 돌려준다(데모 세이프)
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        out.put("subscriber", subscriber);
        out.put("target", target);
        out.put("kind", kind);
        out.put("channel", channel);
        return out;
    }

    @GetMapping("/alerts")
    @Operation(summary = "위협 알림 목록",
            description = "최근 발생한 위협 알림을 반환합니다. DB 미가동/무데이터 시 시드 알림으로 폴백합니다.")
    public Object alerts(@RequestParam(defaultValue = "20") int limit) {
        int lim = clampLimit(limit);
        try {
            List<Map<String, Object>> rows = jdbc.query(
                    "SELECT target, kind, headline, detail, created_at "
                            + "FROM alerts ORDER BY created_at DESC LIMIT ?",
                    (rs, i) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("target", rs.getString("target"));
                        m.put("kind", rs.getString("kind"));
                        m.put("headline", rs.getString("headline"));
                        m.put("detail", rs.getString("detail"));
                        var created = rs.getTimestamp("created_at");
                        m.put("created_at", created != null ? created.toInstant().toString() : null);
                        return m;
                    },
                    lim);
            if (!rows.isEmpty()) {
                return rows;
            }
        } catch (Exception ignored) {
            // alerts 미가동 → 시드 폴백
        }
        return seedAlerts(lim);
    }

    @GetMapping("/subscriptions")
    @Operation(summary = "구독(워치리스트) 조회",
            description = "특정 구독자의 감시 대상 목록을 반환합니다. 무데이터 시 데모 워치리스트로 폴백합니다.")
    public Object subscriptions(@RequestParam(required = false, defaultValue = "") String subscriber) {
        String sub = cap(subscriber, MAX_SUBSCRIBER);
        if (!blank(sub)) {
            try {
                List<Map<String, Object>> rows = jdbc.query(
                        "SELECT id, subscriber, target, kind, channel, created_at "
                                + "FROM subscriptions WHERE subscriber = ? ORDER BY created_at DESC LIMIT 100",
                        (rs, i) -> {
                            Map<String, Object> m = new LinkedHashMap<>();
                            m.put("id", rs.getLong("id"));
                            m.put("subscriber", rs.getString("subscriber"));
                            m.put("target", rs.getString("target"));
                            m.put("kind", rs.getString("kind"));
                            m.put("channel", rs.getString("channel"));
                            var created = rs.getTimestamp("created_at");
                            m.put("created_at", created != null ? created.toInstant().toString() : null);
                            return m;
                        },
                        sub);
                if (!rows.isEmpty()) {
                    return rows;
                }
            } catch (Exception ignored) {
                // subscriptions 미가동 → 데모 폴백
            }
        }
        return seedWatchlist(blank(sub) ? "demo@scamgraph.io" : sub);
    }

    /** 스테일 pgdata 볼륨 대비 — 첫 쓰기 전에 테이블을 방어적으로 생성한다. */
    private void ensureSubscriptionsTable() {
        try {
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS subscriptions (
                        id           BIGSERIAL PRIMARY KEY,
                        subscriber   TEXT        NOT NULL,
                        target       TEXT        NOT NULL,
                        kind         TEXT        NOT NULL,
                        channel      TEXT        NOT NULL DEFAULT 'web',
                        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
                        UNIQUE (subscriber, target)
                    )""");
        } catch (Exception ignored) {
            // 생성 실패해도 이후 INSERT try/catch 가 흡수
        }
    }

    private List<Map<String, Object>> seedAlerts(int limit) {
        List<Map<String, Object>> all = new ArrayList<>();
        all.add(alert("toss-secure-login.xyz", "url",
                "toss 사칭 신규 도메인 등록",
                "브랜드 유사 도메인이 오늘 신규 등록·활성화됨 — OpenPhish 피드 교차 등재", 4));
        all.add(alert("070-8890-1234", "phone",
                "070-8890-1234 신고 급증",
                "최근 1시간 커뮤니티 신고 12건 · 경찰청 보이스피싱 주의 번호와 일치", 26));
        all.add(alert("kbstar-otp.live", "url",
                "KB 사칭 OTP 피싱 사이트 확산",
                "ThreatFox IOC 등재 도메인 — 동일 캠페인 인프라로 3개 호스트 추가 확인", 71));
        all.add(alert("110-2233-4455", "account",
                "대포통장 계좌 연루 확대",
                "환급 사칭 캠페인과 연결된 계좌 — 그래프상 신규 엣지 2건 추가", 143));
        all.add(alert("cj-delivery-check.top", "url",
                "택배 사칭 문자 재유포",
                "휴면 도메인 재활성화 감지 · 확인된 사기 조직 인프라와 동일 IP", 210));
        return all.size() > limit ? all.subList(0, limit) : all;
    }

    private List<Map<String, Object>> seedWatchlist(String subscriber) {
        List<Map<String, Object>> all = new ArrayList<>();
        all.add(watch(subscriber, "toss", "brand", "web"));
        all.add(watch(subscriber, "shinhan.com", "url", "email"));
        all.add(watch(subscriber, "070-8890-1234", "phone", "web"));
        return all;
    }

    private static Map<String, Object> alert(String target, String kind, String headline,
                                             String detail, int minutesAgo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("target", target);
        m.put("kind", kind);
        m.put("headline", headline);
        m.put("detail", detail);
        m.put("created_at", Instant.now().minusSeconds(minutesAgo * 60L).toString());
        return m;
    }

    private static Map<String, Object> watch(String subscriber, String target, String kind, String channel) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("subscriber", subscriber);
        m.put("target", target);
        m.put("kind", kind);
        m.put("channel", channel);
        m.put("created_at", Instant.now().toString());
        return m;
    }

    private static int clampLimit(int limit) {
        if (limit < 1) return 1;
        return Math.min(limit, MAX_LIMIT);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    /** null 안전 + 과도한 길이 방어(캡). */
    private static String cap(String s, int max) {
        if (s == null) return "";
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    public record SubscribeRequest(String subscriber, String target, String kind, String channel) {}
}
