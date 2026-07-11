package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 커뮤니티 사기 신고 API.
 * 목록/모더레이션은 Postgres 를 직접 읽고, 접수(POST /report)는 엔진으로 위임한다.
 * DB 가 비었거나 다운이면 init.sql 기반 시드 신고로 폴백한다(데모 세이프).
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Report", description = "커뮤니티 사기 신고 API")
public class ReportController {

    private final RestClient engine;
    private final JdbcTemplate jdbc;

    public ReportController(RestClient.Builder builder, JdbcTemplate jdbc,
                            @Value("${engine.url}") String engineUrl) {
        this.engine = builder.baseUrl(engineUrl).build();
        this.jdbc = jdbc;
    }

    @GetMapping("/reports")
    @Operation(summary = "신고 목록 조회",
            description = "Postgres 의 신고 목록을 반환합니다. DB 미가동 시 시드 신고로 폴백합니다.")
    public Object reports(@RequestParam(defaultValue = "50") int limit) {
        try {
            List<Map<String, Object>> rows = jdbc.query(
                    "SELECT id, target, kind, note, status, votes, created_at "
                            + "FROM reports ORDER BY created_at DESC LIMIT ?",
                    (rs, i) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", rs.getLong("id"));
                        m.put("target", rs.getString("target"));
                        m.put("kind", rs.getString("kind"));
                        m.put("note", rs.getString("note"));
                        m.put("status", rs.getString("status"));
                        m.put("votes", rs.getInt("votes"));
                        var created = rs.getTimestamp("created_at");
                        m.put("ts", created != null ? created.toInstant().toString() : null);
                        return m;
                    },
                    limit);
            if (!rows.isEmpty()) {
                return rows;
            }
        } catch (Exception ignored) {
            // DB 미가동 → 시드 폴백
        }
        return seedReports();
    }

    @PostMapping("/report")
    @Operation(summary = "사기 신고 접수",
            description = "대상·유형·메모로 신고를 접수합니다. 엔진 미가동 시 큐잉 응답으로 폴백합니다.")
    public Object report(@RequestBody ReportRequest req) {
        try {
            return engine.post()
                    .uri("/report")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "target", req.target() == null ? "" : req.target(),
                            "kind", req.kind() == null ? "" : req.kind(),
                            "note", req.note() == null ? "" : req.note()
                    ))
                    .retrieve()
                    .body(Object.class);
        } catch (Exception e) {
            return Map.of(
                    "status", "queued",
                    "target", req.target() == null ? "" : req.target()
            );
        }
    }

    @PostMapping("/reports/{id}/moderate")
    @Operation(summary = "신고 모더레이션",
            description = "관리자가 신고를 확인/반려 처리합니다. (Postgres UPDATE)")
    public Object moderate(@PathVariable long id, @RequestBody ModerateRequest req) {
        String status = req.status() == null ? "confirmed" : req.status();
        try {
            jdbc.update("UPDATE reports SET status = ? WHERE id = ?", status, id);
        } catch (Exception ignored) {
            // DB 미가동이어도 데모용 응답은 돌려준다
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("status", status);
        return m;
    }

    private List<Map<String, Object>> seedReports() {
        String ts = Instant.now().toString();
        return List.of(
                seedReport(1, "cj-delivery-check.top", "url", "택배 미수령 사칭 문자", "confirmed", 42, ts),
                seedReport(2, "kbstat-secure.click", "url", "KB 보안 인증 사칭", "confirmed", 37, ts),
                seedReport(3, "070-4123-9981", "phone", "자동응답 보이스피싱", "confirmed", 18, ts)
        );
    }

    private static Map<String, Object> seedReport(long id, String target, String kind,
                                                  String note, String status, int votes, String ts) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("target", target);
        m.put("kind", kind);
        m.put("note", note);
        m.put("status", status);
        m.put("votes", votes);
        m.put("ts", ts);
        return m;
    }

    public record ReportRequest(String target, String kind, String note) {}

    public record ModerateRequest(String status) {}
}
