package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 통합 안전 판정 — 모든 접점(브라우저 확장·PWA·모바일 앱)이 호출하는 단일 엔드포인트.
 * 규칙 판정(엔진) + 조직 귀속(그래프) + 실행 권고를 한 번에 반환한다.
 * 접점 클라이언트는 이 엔드포인트 하나만 알면 된다 = "공용 두뇌, 얇은 클라이언트".
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Check", description = "통합 안전 판정 (모든 클라이언트 공용)")
public class CheckController {

    private final RestClient engine;
    private final GraphSource graphSource;
    private final JdbcTemplate jdbc;

    public CheckController(RestClient.Builder builder, GraphSource graphSource, JdbcTemplate jdbc,
                           @Value("${engine.url}") String engineUrl) {
        this.engine = builder.baseUrl(engineUrl).build();
        this.graphSource = graphSource;
        this.jdbc = jdbc;
    }

    @GetMapping("/check")
    @Operation(summary = "통합 안전 판정",
            description = "URL·전화·계좌를 판정하고, 알려진 사기 조직 귀속과 실행 권고를 함께 반환합니다.")
    @SuppressWarnings("unchecked")
    public Map<String, Object> check(@RequestParam String value) {
        // 입력 검증 — 비정상적으로 긴 입력 방어
        if (value == null || value.length() > 2048) {
            Map<String, Object> bad = new LinkedHashMap<>();
            bad.put("value", "");
            bad.put("kind", "url");
            bad.put("grade", "unknown");
            bad.put("risk_score", null);
            bad.put("reasons", List.of());
            bad.put("organization", null);
            bad.put("community_reports", 0);
            bad.put("recommendation", "입력이 올바르지 않습니다.");
            return bad;
        }
        String kind = "url";
        String grade = "unknown";
        Integer riskScore = null;
        List<Object> reasons = new ArrayList<>();

        // 1) 규칙 판정 (엔진)
        try {
            Map<String, Object> scan = engine.post()
                    .uri("/scan")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("target", value))
                    .retrieve()
                    .body(Map.class);
            if (scan != null) {
                kind = str(scan.get("kind"), "url");
                grade = str(scan.get("grade"), "unknown");
                if (scan.get("risk_score") instanceof Number num) {
                    riskScore = num.intValue();
                }
                if (scan.get("reasons") instanceof List<?> list) {
                    reasons = new ArrayList<>(list);
                }
            }
        } catch (Exception ignored) {
            // 엔진 미가동 → 그래프 기반 폴백만
        }

        // 2) 조직 귀속 (그래프)
        String organization = findOrganization(value);
        if (organization != null && !"danger".equals(grade)) {
            grade = "danger";  // 인프라 연루 = 규칙보다 강한 신호
        }

        // 2b) 커뮤니티 신고 (플라이휠 — 신고가 쌓이면 모두 보호)
        long communityReports = 0;
        try {
            Long c = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM reports WHERE target = ?", Long.class, value);
            communityReports = c != null ? c : 0;
        } catch (Exception ignored) {
        }
        if (communityReports >= 3) {
            grade = "danger";
        } else if (communityReports >= 1
                && ("safe".equals(grade) || "unknown".equals(grade) || "caution".equals(grade))) {
            grade = "warning";
        }

        // 2c) 외부 위협 피드 대조 (OpenPhish·URLhaus·ThreatFox·경찰청 — 전 세계/국가 피드)
        //     설명 가능성 강화: 어느 피드에 언제 등재됐는지 근거로 남긴다.
        Set<String> feedSources = new LinkedHashSet<>();
        try {
            String host = hostOf(value);
            List<Map<String, Object>> hits = jdbc.query(
                    "SELECT source, source_kind, detail, first_seen FROM blocklist "
                            + "WHERE value = ? OR value = ? LIMIT 5",
                    (rs, rowNum) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("source", rs.getString("source"));
                        m.put("source_kind", rs.getString("source_kind"));
                        m.put("detail", rs.getString("detail"));
                        m.put("first_seen", String.valueOf(rs.getObject("first_seen")));
                        return m;
                    }, value, host);
            for (Map<String, Object> hit : hits) {
                Map<String, Object> reason = new LinkedHashMap<>();
                reason.put("rule", "external_feed_hit");
                reason.put("weight", 40);
                reason.put("detail", hit.get("detail"));
                reason.put("source", hit.get("source"));
                reason.put("first_seen", hit.get("first_seen"));
                reasons.add(reason);
                feedSources.add(String.valueOf(hit.get("source")));
            }
            if (!hits.isEmpty()) {
                grade = "danger";  // 실제 위협 피드 등재 = 규칙보다 강한 신호
            }
        } catch (Exception ignored) {
            // blocklist 미가동 → 피드 대조 없이 진행 (demo-safe)
        }

        // 3) 실행 권고
        String recommendation = recommend(kind, grade, organization);
        if (communityReports > 0) {
            recommendation = "👥 커뮤니티 " + communityReports + "건 신고됨. " + recommendation;
        }
        if (!feedSources.isEmpty()) {
            recommendation = "📡 위협 피드 등재(" + String.join(", ", feedSources) + "). " + recommendation;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("value", value);
        out.put("kind", kind);
        out.put("grade", grade);
        out.put("risk_score", riskScore);
        out.put("reasons", reasons);
        out.put("organization", organization);
        out.put("community_reports", communityReports);
        out.put("feed_sources", new ArrayList<>(feedSources));
        out.put("recommendation", recommendation);
        return out;
    }

    /** 그래프에서 value 가 속한 최근접 Campaign(조직) 이름. 없으면 null. */
    @SuppressWarnings("unchecked")
    private String findOrganization(String value) {
        try {
            Map<String, Object> graph = graphSource.current();
            List<Map<String, Object>> nodes = (List<Map<String, Object>>) graph.get("nodes");
            List<Map<String, Object>> edges = (List<Map<String, Object>>) graph.get("edges");

            Map<String, Map<String, Object>> byId = new HashMap<>();
            for (Map<String, Object> n : nodes) {
                byId.put((String) n.get("id"), n);
            }
            // URL 이면 호스트로 정규화해 그래프 노드와 매칭
            String startId = byId.containsKey(value) ? value : hostOf(value);
            if (!byId.containsKey(startId)) {
                return null;
            }

            Map<String, Set<String>> adj = new HashMap<>();
            for (Map<String, Object> e : edges) {
                String s = (String) e.get("source");
                String t = (String) e.get("target");
                adj.computeIfAbsent(s, k -> new HashSet<>()).add(t);
                adj.computeIfAbsent(t, k -> new HashSet<>()).add(s);
            }

            Map<String, Object> startNode = byId.get(startId);
            if (startNode != null && "Campaign".equals(startNode.get("type"))) {
                return (String) startNode.get("label");
            }

            Deque<String> queue = new ArrayDeque<>();
            Set<String> seen = new HashSet<>();
            queue.add(startId);
            seen.add(startId);
            while (!queue.isEmpty()) {
                String cur = queue.poll();
                Map<String, Object> n = byId.get(cur);
                if (n != null && "Campaign".equals(n.get("type"))) {
                    return (String) n.get("label");
                }
                for (String nb : adj.getOrDefault(cur, Set.of())) {
                    if (seen.add(nb)) {
                        queue.add(nb);
                    }
                }
            }
        } catch (Exception ignored) {
            // 그래프 미가동 → 귀속 없음
        }
        return null;
    }

    private static String recommend(String kind, String grade, String org) {
        String orgNote = org != null ? " (알려진 사기 조직 '" + org + "' 인프라)" : "";
        String action = switch (kind) {
            case "phone" -> "전화를 받지 말고 응답·송금하지 마세요";
            case "account" -> "이 계좌로 절대 송금하지 마세요";
            default -> "링크를 누르지 말고 개인정보·인증번호를 입력하지 마세요";
        };
        return switch (grade) {
            case "danger" -> "🚨 위험 — " + action + orgNote + ".";
            case "warning" -> "⚠️ 주의 — 확인 전 " + action + ".";
            case "caution" -> "의심 신호가 있습니다 — 조심하세요" + orgNote + ".";
            case "safe" -> "특이 위험 신호는 없습니다. 다만 항상 주의하세요.";
            default -> "판정 정보가 부족합니다" + orgNote + " — 조심하세요.";
        };
    }

    private static String str(Object o, String dflt) {
        return o == null ? dflt : String.valueOf(o);
    }

    /** URL 이면 호스트만 추출(그래프 노드 id 와 매칭). 그 외엔 원본 소문자. */
    private static String hostOf(String value) {
        String v = value == null ? "" : value.trim();
        int scheme = v.indexOf("://");
        if (scheme >= 0) v = v.substring(scheme + 3);
        int at = v.indexOf('@');
        if (at >= 0) v = v.substring(at + 1);
        int slash = v.indexOf('/');
        if (slash >= 0) v = v.substring(0, slash);
        int colon = v.indexOf(':');
        if (colon >= 0) v = v.substring(0, colon);
        return v.toLowerCase();
    }
}
