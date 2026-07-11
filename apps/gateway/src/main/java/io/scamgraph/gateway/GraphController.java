package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 사기 인프라 관계 그래프 API.
 * 게이트웨이가 Neo4j(워커가 적재한 실데이터 + 시드)를 직접 읽는다.
 * Neo4j 가 비어있거나 다운이면 seed.cypher 기반 시드 그래프로 폴백한다(데모 세이프).
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Graph", description = "사기 조직 인프라 관계망 그래프 API")
public class GraphController {

    private final Neo4jGraphReader reader;
    private final List<Map<String, Object>> seedNodes = buildSeedNodes();
    private final List<Map<String, Object>> seedEdges = buildSeedEdges();

    public GraphController(Neo4jGraphReader reader) {
        this.reader = reader;
    }

    @GetMapping("/graph")
    @Operation(summary = "사기 인프라 관계 그래프 조회",
            description = "Neo4j 의 실데이터(워커 적재 + 시드)를 반환합니다. 비어있거나 미가동 시 시드 그래프로 폴백합니다.")
    public Object graph(@RequestParam(defaultValue = "500") int limit) {
        Map<String, Object> live = liveGraphOrNull(limit);
        return live != null ? live : seedGraph();
    }

    @GetMapping("/graph/expand")
    @Operation(summary = "노드 이웃 확장",
            description = "지정한 값의 노드와 직접 연결된 노드/관계를 반환합니다. 실데이터 우선, 없으면 시드에서 추립니다.")
    public Object expand(@RequestParam String value) {
        Map<String, Object> live = liveGraphOrNull(500);
        Map<String, Object> graph = live != null ? live : seedGraph();
        return filterNeighbors(graph, value);
    }

    /** Neo4j 에서 읽되, 비어있거나 오류면 null 을 반환해 상위에서 시드로 폴백하게 한다. */
    private Map<String, Object> liveGraphOrNull(int limit) {
        try {
            Map<String, Object> g = reader.readGraph(limit);
            List<?> nodes = (List<?>) g.get("nodes");
            if (nodes != null && !nodes.isEmpty()) {
                return g;
            }
        } catch (Exception ignored) {
            // Neo4j 미가동 → 시드 폴백
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> filterNeighbors(Map<String, Object> graph, String value) {
        List<Map<String, Object>> allNodes = (List<Map<String, Object>>) graph.get("nodes");
        List<Map<String, Object>> allEdges = (List<Map<String, Object>>) graph.get("edges");

        boolean exists = allNodes.stream().anyMatch(n -> value.equals(n.get("id")));
        if (!exists) {
            return graph; // 값을 못 찾으면 전체 그래프
        }

        List<Map<String, Object>> edges = allEdges.stream()
                .filter(e -> value.equals(e.get("source")) || value.equals(e.get("target")))
                .toList();
        Set<String> ids = new HashSet<>();
        ids.add(value);
        for (Map<String, Object> e : edges) {
            ids.add((String) e.get("source"));
            ids.add((String) e.get("target"));
        }
        List<Map<String, Object>> nodes = allNodes.stream()
                .filter(n -> ids.contains(n.get("id")))
                .toList();
        return Map.of("nodes", nodes, "edges", edges);
    }

    private Map<String, Object> seedGraph() {
        return Map.of("nodes", seedNodes, "edges", seedEdges);
    }

    // --- 시드 데이터 (infra/neo4j/seed.cypher 미러) ---

    private static Map<String, Object> node(String id, String label, String type, String grade, Integer riskScore) {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("id", id);
        n.put("label", label);
        n.put("type", type);
        n.put("grade", grade);
        n.put("risk_score", riskScore);
        return n;
    }

    private static Map<String, Object> edge(String source, String target, String type) {
        return Map.of("source", source, "target", target, "type", type);
    }

    private static List<Map<String, Object>> buildSeedNodes() {
        // Host 는 Target 과 같은 사람 읽기 이름을 갖기에 id 충돌을 피하려 "host:" 접두사 사용
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

    private static List<Map<String, Object>> buildSeedEdges() {
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
}
