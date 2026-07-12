package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 사기 인프라 관계 그래프 API.
 * 게이트웨이가 Neo4j(워커가 적재한 실데이터 + 시드)를 직접 읽는다.
 * Neo4j 가 비어있거나 다운이면 seed.cypher 기반 시드 그래프로 폴백한다(데모 세이프).
 * 시드 데이터는 {@link SeedGraph} 한 곳에서만 정의한다(중복 제거) — Neo4j 폴백과 동일 소스.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Graph", description = "사기 조직 인프라 관계망 그래프 API")
public class GraphController {

    private final Neo4jGraphReader reader;
    private final List<Map<String, Object>> seedNodes = SeedGraph.nodes();
    private final List<Map<String, Object>> seedEdges = SeedGraph.edges();

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
}
