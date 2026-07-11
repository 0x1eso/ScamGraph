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
 * 정정 이의제기(appeal) API — 오탐/명예훼손 대응 창구.
 * 위험 판정에 이의가 있으면 접수(status='received')하고, 모더레이션 뷰에서 검토한다.
 * 설명 가능성과 대칭을 이루는 "정정 가능성" — 판정은 근거와 함께 반박도 받는다.
 * DB 가 비었거나 다운이면 시드 이의건으로 폴백한다(데모 세이프).
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Appeal", description = "정정 이의제기 API")
public class AppealController {

    private static final int MAX_TARGET = 512;
    private static final int MAX_KIND = 32;
    private static final int MAX_CLAIM = 2000;
    private static final int MAX_CONTACT = 256;
    private static final int MAX_STATUS = 32;

    private final JdbcTemplate jdbc;

    public AppealController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping("/appeal")
    @Operation(summary = "정정 이의제기 접수",
            description = "위험 판정에 대한 이의(오탐·정정 요청)를 접수합니다. 접수 상태는 'received' 로 시작합니다.")
    public Object appeal(@RequestBody AppealRequest req) {
        String target = cap(req.target(), MAX_TARGET);
        String kind = blank(req.kind()) ? "url" : cap(req.kind(), MAX_KIND);
        String claim = cap(req.claim(), MAX_CLAIM);
        String contact = cap(req.contact(), MAX_CONTACT);

        // 입력 검증 — 필수값 방어 (500 대신 명시적 오류 응답)
        if (blank(target) || blank(claim)) {
            Map<String, Object> bad = new LinkedHashMap<>();
            bad.put("ok", false);
            bad.put("error", "target 과 claim 은 필수입니다.");
            return bad;
        }

        ensureAppealsTable();

        Long id = null;
        try {
            List<Long> ids = jdbc.query(
                    "INSERT INTO appeals (target, kind, claim, contact, status) "
                            + "VALUES (?, ?, ?, ?, 'received') RETURNING id",
                    (rs, i) -> rs.getLong("id"),
                    target, kind, claim, blank(contact) ? null : contact);
            if (!ids.isEmpty()) {
                id = ids.get(0);
            }
        } catch (Exception ignored) {
            // DB 미가동 → id 없이도 접수 응답은 돌려준다(데모 세이프)
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        out.put("target", target);
        out.put("kind", kind);
        out.put("status", "received");
        return out;
    }

    @GetMapping("/appeals")
    @Operation(summary = "이의제기 목록 (모더레이션)",
            description = "관리자 검토용 이의제기 목록을 반환합니다. status 로 필터할 수 있습니다. "
                    + "DB 미가동/무데이터 시 시드 이의건으로 폴백합니다.")
    public Object appeals(@RequestParam(required = false, defaultValue = "") String status) {
        String st = cap(status, MAX_STATUS);
        try {
            List<Map<String, Object>> rows;
            if (blank(st)) {
                rows = jdbc.query(
                        "SELECT id, target, kind, claim, contact, status, created_at "
                                + "FROM appeals ORDER BY created_at DESC LIMIT 100",
                        this::mapAppeal);
            } else {
                rows = jdbc.query(
                        "SELECT id, target, kind, claim, contact, status, created_at "
                                + "FROM appeals WHERE status = ? ORDER BY created_at DESC LIMIT 100",
                        this::mapAppeal, st);
            }
            if (!rows.isEmpty()) {
                return rows;
            }
        } catch (Exception ignored) {
            // appeals 미가동 → 시드 폴백
        }
        return seedAppeals(st);
    }

    private Map<String, Object> mapAppeal(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getLong("id"));
        m.put("target", rs.getString("target"));
        m.put("kind", rs.getString("kind"));
        m.put("claim", rs.getString("claim"));
        m.put("contact", rs.getString("contact"));
        m.put("status", rs.getString("status"));
        var created = rs.getTimestamp("created_at");
        m.put("created_at", created != null ? created.toInstant().toString() : null);
        return m;
    }

    /** 스테일 pgdata 볼륨 대비 — 첫 쓰기 전에 테이블을 방어적으로 생성한다. */
    private void ensureAppealsTable() {
        try {
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS appeals (
                        id           BIGSERIAL PRIMARY KEY,
                        target       TEXT        NOT NULL,
                        kind         TEXT        NOT NULL,
                        claim        TEXT        NOT NULL,
                        contact      TEXT,
                        status       TEXT        NOT NULL DEFAULT 'received',
                        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
                    )""");
        } catch (Exception ignored) {
            // 생성 실패해도 이후 INSERT try/catch 가 흡수
        }
    }

    private List<Map<String, Object>> seedAppeals(String status) {
        List<Map<String, Object>> all = new ArrayList<>();
        all.add(appeal(9001, "shinhan-benefit.co.kr", "url",
                "당사 정식 이벤트 도메인입니다. 오탐으로 판단되어 정정 요청합니다.",
                "compliance@shinhan-benefit.co.kr", "received", 8));
        all.add(appeal(9002, "010-2211-7788", "phone",
                "번호 도용 피해자입니다. 제 번호가 사칭에 쓰였습니다 — 등재 정정 바랍니다.",
                null, "reviewing", 55));
        all.add(appeal(9003, "delivery-notice.help", "url",
                "폐쇄된 도메인입니다. 위험 등재 해제 요청합니다.",
                "owner@delivery-notice.help", "upheld", 320));
        if (blank(status)) {
            return all;
        }
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> a : all) {
            if (status.equals(a.get("status"))) {
                filtered.add(a);
            }
        }
        return filtered;
    }

    private static Map<String, Object> appeal(long id, String target, String kind, String claim,
                                              String contact, String status, int minutesAgo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("target", target);
        m.put("kind", kind);
        m.put("claim", claim);
        m.put("contact", contact);
        m.put("status", status);
        m.put("created_at", Instant.now().minusSeconds(minutesAgo * 60L).toString());
        return m;
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

    public record AppealRequest(String target, String kind, String claim, String contact) {}
}
