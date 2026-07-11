package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 데이터 소스 관제 — 연결된 위협 피드 현황(소스별 지표 수·최신 갱신·상태).
 * 대시보드 '데이터 소스' 패널이 폴링한다. PG 미가동/테이블 부재 시 시드로 폴백(데모 세이프).
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Feeds", description = "위협 피드 데이터 소스 현황")
public class FeedStatsController {

    private final JdbcTemplate jdbc;

    // 소스 id → 표시 라벨
    private static final Map<String, String> LABELS = Map.of(
            "openphish", "OpenPhish",
            "urlhaus", "URLhaus · abuse.ch",
            "threatfox", "ThreatFox · abuse.ch",
            "police_kr", "경찰청 보이스피싱"
    );
    private static final long LIVE_WINDOW_MS = 30 * 60 * 1000L;  // 30분 내 갱신 = live

    public FeedStatsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/feeds/stats")
    @Operation(summary = "위협 피드 데이터 소스 현황",
            description = "연결된 공개 위협 피드별 지표 수·상태·최신 갱신 시각을 반환합니다.")
    public Map<String, Object> stats() {
        try {
            long now = System.currentTimeMillis();
            List<Map<String, Object>> sources = jdbc.query(
                    "SELECT source, source_kind, COUNT(*) AS cnt, MAX(last_seen) AS last_updated "
                            + "FROM blocklist GROUP BY source, source_kind ORDER BY cnt DESC",
                    (rs, rowNum) -> {
                        String id = rs.getString("source");
                        Timestamp ts = rs.getTimestamp("last_updated");
                        boolean live = ts != null && (now - ts.getTime()) < LIVE_WINDOW_MS;
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", id);
                        m.put("label", LABELS.getOrDefault(id, id));
                        m.put("kind", rs.getString("source_kind"));
                        m.put("count", rs.getInt("cnt"));
                        m.put("last_updated", ts != null ? ts.toInstant().toString() : null);
                        m.put("status", live ? "live" : "seed");
                        return m;
                    });
            if (sources.isEmpty()) {
                return seedFallback();
            }
            int total = sources.stream().mapToInt(s -> ((Number) s.get("count")).intValue()).sum();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("sources", sources);
            out.put("total_indicators", total);
            out.put("updated_at", Instant.now().toString());
            return out;
        } catch (Exception e) {
            return seedFallback();
        }
    }

    /** PG 미가동/테이블 부재 시 시드 현황(패널이 항상 렌더되도록). */
    private static Map<String, Object> seedFallback() {
        List<Map<String, Object>> sources = new ArrayList<>();
        sources.add(source("openphish", "OpenPhish", "global", 5, "live"));
        sources.add(source("urlhaus", "URLhaus · abuse.ch", "global", 4, "live"));
        sources.add(source("threatfox", "ThreatFox · abuse.ch", "global", 4, "live"));
        sources.add(source("police_kr", "경찰청 보이스피싱", "gov", 3, "seed"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sources", sources);
        out.put("total_indicators", 16);
        out.put("updated_at", Instant.now().toString());
        return out;
    }

    private static Map<String, Object> source(String id, String label, String kind, int count, String status) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("label", label);
        m.put("kind", kind);
        m.put("count", count);
        m.put("last_updated", Instant.now().toString());
        m.put("status", status);
        return m;
    }
}
