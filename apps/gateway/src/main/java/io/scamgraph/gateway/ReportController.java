package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.neo4j.driver.Driver;
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
    private final Driver neo4j;
    private final ReportDefense defense;

    public ReportController(RestClient.Builder builder, JdbcTemplate jdbc, Driver neo4j,
                            ReportDefense defense, @Value("${engine.url}") String engineUrl) {
        this.engine = builder.baseUrl(engineUrl).build();
        this.jdbc = jdbc;
        this.neo4j = neo4j;
        this.defense = defense;
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
    @Operation(summary = "사기 신고 접수 (플라이휠 · poisoning 방어)",
            description = "신고자 익명 해시·dedup·burst·독립성·allowlist 방어를 거친 뒤, 새 독립 신고만 "
                    + "Postgres/Neo4j 그래프에 반영합니다. 한 행위자가 반복해도 대상을 부풀릴 수 없습니다. "
                    + "정상 도메인 신고는 status='review' 로 접수만 되고 자동 승격되지 않습니다.")
    public Object report(@RequestBody ReportRequest req, HttpServletRequest http) {
        String target = req.target() == null ? "" : req.target().trim();
        String kind = (req.kind() == null || req.kind().isBlank()) ? "url" : req.kind();
        String note = req.note() == null ? "" : req.note();

        // 0) poisoning 방어 — 신고자 익명 해시 + dedup/rate-limit/독립성/allowlist 평가.
        //    승격 정책(docs/abuse-defense.md §3): 신고 1건=저장만 / 독립 다수="다수 신고" 신호 /
        //    blocklist 승격=강한 기술신호 + 운영자 dual-approval(신고 접수 경로에서 자동 승격 없음).
        String reporterHash = defense.reporterHash(http);
        ReportDefense.Verdict verdict = defense.evaluate(target, reporterHash);

        // 1) 판정에 영향을 주는 반영(reports 테이블 + Neo4j)은 '새 독립 신고자 & 비-allowlist' 일 때만.
        //    CheckController 의 커뮤니티 카운트가 reports 를 읽으므로, dedup 을 통과한 독립 신고만
        //    여기 쌓인다 → 원시 행수 = 독립 신고자 수 → 한 명이 반복해도 대상을 부풀릴 수 없다.
        if (verdict.escalateToGraph()) {
            // 1a) Postgres 저장 (커뮤니티 신고)
            try {
                jdbc.update(
                        "INSERT INTO reports (target, kind, note, status, votes) VALUES (?, ?, ?, 'pending', 1)",
                        target, kind, note);
            } catch (Exception ignored) {
            }

            // 1b) Neo4j 그래프에 커뮤니티 위협으로 반영 (킬샷 데모의 관계망 확산)
            try {
                String cypher = switch (kind) {
                    case "phone" -> "MERGE (n:Phone {number:$t}) "
                            + "SET n.community_reports = coalesce(n.community_reports,0)+1, n.source='community'";
                    case "account" -> "MERGE (n:Account {number:$t}) "
                            + "SET n.community_reports = coalesce(n.community_reports,0)+1, n.source='community'";
                    default -> "MERGE (n:Target {value:$t}) "
                            + "SET n.community_reports = coalesce(n.community_reports,0)+1, "
                            + "n.source='community', n.grade = coalesce(n.grade,'warning')";
                };
                try (var session = neo4j.session()) {
                    session.run(cypher, Map.of("t", target));
                }
            } catch (Exception ignored) {
            }
        }
        // allowlist 대상(정상 사업자) 및 dedup/throttle 된 신고는 reports/Neo4j 에 반영되지 않는다.

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", verdict.status());              // reported | review | duplicate | throttled
        out.put("target", target);
        out.put("reports", verdict.independentCount());    // 프론트 호환: 독립 신고자 수(원시 행수 아님)
        out.put("independent_reports", verdict.independentCount());
        out.put("escalation", verdict.escalation());       // stored | multi_report | review_queue
        out.put("flagged_for_review", verdict.allowlisted());
        if (verdict.signal() != null) {
            out.put("signal", verdict.signal());           // "다수 신고"
        }
        return out;
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
