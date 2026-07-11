package io.scamgraph.gateway;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 시드 관계망 (infra/neo4j/seed.cypher 미러). Neo4j 폴백 · 귀속 · 피드 공용. */
final class SeedGraph {

    private SeedGraph() {}

    static Map<String, Object> node(String id, String label, String type, String grade, Integer risk) {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("id", id);
        n.put("label", label);
        n.put("type", type);
        n.put("grade", grade);
        n.put("risk_score", risk);
        return n;
    }

    static Map<String, Object> edge(String source, String target, String type) {
        return Map.of("source", source, "target", target, "type", type);
    }

    static List<Map<String, Object>> nodes() {
        return List.of(
                node("택배사칭-A", "택배사칭-A", "Campaign", null, null),
                node("은행피싱-B", "은행피싱-B", "Campaign", null, null),
                node("cj-delivery-check.top", "cj-delivery-check.top", "Target", "danger", 92),
                node("cj-delivery-track.xyz", "cj-delivery-track.xyz", "Target", "danger", 88),
                node("kbstat-secure.click", "kbstat-secure.click", "Target", "danger", 95),
                node("shinhan-otp.xyz", "shinhan-otp.xyz", "Target", "danger", 90),
                node("host:cj-delivery-check.top", "cj-delivery-check.top", "Host", null, null),
                node("host:cj-delivery-track.xyz", "cj-delivery-track.xyz", "Host", null, null),
                node("host:kbstat-secure.click", "kbstat-secure.click", "Host", null, null),
                node("host:shinhan-otp.xyz", "shinhan-otp.xyz", "Host", null, null),
                node("203.0.113.44", "203.0.113.44", "IP", null, null),
                node("070-4123-9981", "070-4123-9981", "Phone", null, null),
                node("070-8842-1120", "070-8842-1120", "Phone", null, null),
                node("352-9981-2210-11", "352-9981-2210-11 (농협)", "Account", null, null),
                node("110-441-882201", "110-441-882201 (신한)", "Account", null, null),
                node("report:1", "택배 문자 클릭 유도", "Report", null, null),
                node("report:2", "OTP 입력 요구", "Report", null, null)
        );
    }

    static List<Map<String, Object>> edges() {
        return List.of(
                edge("택배사칭-A", "cj-delivery-check.top", "USES"),
                edge("택배사칭-A", "cj-delivery-track.xyz", "USES"),
                edge("cj-delivery-check.top", "host:cj-delivery-check.top", "RESOLVES_TO"),
                edge("cj-delivery-track.xyz", "host:cj-delivery-track.xyz", "RESOLVES_TO"),
                edge("host:cj-delivery-check.top", "203.0.113.44", "HOSTED_ON"),
                edge("host:cj-delivery-track.xyz", "203.0.113.44", "HOSTED_ON"),
                edge("택배사칭-A", "070-4123-9981", "CONTACT"),
                edge("택배사칭-A", "352-9981-2210-11", "PAYOUT"),
                edge("은행피싱-B", "kbstat-secure.click", "USES"),
                edge("은행피싱-B", "shinhan-otp.xyz", "USES"),
                edge("kbstat-secure.click", "host:kbstat-secure.click", "RESOLVES_TO"),
                edge("shinhan-otp.xyz", "host:shinhan-otp.xyz", "RESOLVES_TO"),
                edge("host:kbstat-secure.click", "203.0.113.44", "HOSTED_ON"),
                edge("host:shinhan-otp.xyz", "203.0.113.44", "HOSTED_ON"),
                edge("은행피싱-B", "070-8842-1120", "CONTACT"),
                edge("은행피싱-B", "110-441-882201", "PAYOUT"),
                edge("report:1", "cj-delivery-check.top", "REPORTS"),
                edge("report:2", "kbstat-secure.click", "REPORTS")
        );
    }

    static Map<String, Object> graph() {
        return Map.of("nodes", nodes(), "edges", edges());
    }
}
