package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * GraphAnalyticsController 단위 테스트 — 순수 Java 그래프 알고리즘(연결 컴포넌트·연결/매개 중심성·
 * 단절점)을 손으로 계산 가능한 소형 픽스처에서 하드하게 검증한다. GraphSource 는 익명 서브클래스로
 * 고정 그래프를 주입한다(Neo4j·Spring 컨텍스트 불필요).
 *
 * 알고리즘이 미묘하므로(반복형 Tarjan 단절점, Brandes 매개 중심성) 경로·사이클·별·다리·분리 그래프를
 * 각각 세워 기대값을 명시한다.
 */
class GraphAnalyticsControllerTest {

    // ── 픽스처 빌더 ────────────────────────────────────────────────────
    private static Map<String, Object> node(String id) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("label", id);
        m.put("type", "Node");
        m.put("grade", null);
        m.put("risk_score", null);
        return m;
    }

    private static Map<String, Object> edge(String s, String t) {
        return Map.of("source", s, "target", t, "type", "LINK");
    }

    /** 무방향 간선 목록(각 "a-b")과 노드 id 로 그래프 맵을 만든다. */
    private static Map<String, Object> graph(List<String> ids, String... undirectedEdges) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (String id : ids) {
            nodes.add(node(id));
        }
        List<Map<String, Object>> edges = new ArrayList<>();
        for (String e : undirectedEdges) {
            String[] p = e.split("-", 2);
            edges.add(edge(p[0], p[1]));
        }
        return Map.of("nodes", nodes, "edges", edges);
    }

    private static GraphAnalyticsController controllerFor(Map<String, Object> g) {
        GraphSource source = new GraphSource(null) {
            @Override
            public Map<String, Object> current() {
                return g;
            }
        };
        return new GraphAnalyticsController(source);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> listOf(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }

    /** 특정 결과 리스트에서 "label" 값 집합을 뽑는다(단절점·중심성 검사용). */
    private static Set<String> labels(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> String.valueOf(r.get("label"))).collect(Collectors.toSet());
    }

    // ── 테스트 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("빈 그래프 → 빈 구조(데모 세이프, 500 없음)")
    void emptyGraph() {
        Map<String, Object> out = controllerFor(Map.of("nodes", List.of(), "edges", List.of())).analytics();
        assertTrue(listOf(out, "components").isEmpty());
        assertTrue(listOf(out, "top_degree").isEmpty());
        assertTrue(listOf(out, "top_betweenness").isEmpty());
        assertTrue(listOf(out, "articulation_points").isEmpty());
        assertEquals(0, out.get("node_count"));
        assertEquals(0, out.get("edge_count"));
    }

    @Test
    @DisplayName("경로 그래프 0-1-2-3 → 단절점은 내부 노드 {1,2}, 끝점 아님")
    void pathArticulationPoints() {
        Map<String, Object> out = controllerFor(
                graph(List.of("0", "1", "2", "3"), "0-1", "1-2", "2-3")).analytics();

        Set<String> cuts = labels(listOf(out, "articulation_points"));
        assertEquals(Set.of("1", "2"), cuts, "path interior nodes are articulation points");

        assertEquals(4, out.get("node_count"));
        assertEquals(3, out.get("edge_count"));
    }

    @Test
    @DisplayName("경로 그래프 0-1-2 → 매개 중심성은 가운데 노드 1 이 최상(=1.0)")
    void pathBetweenness() {
        Map<String, Object> out = controllerFor(
                graph(List.of("0", "1", "2"), "0-1", "1-2")).analytics();

        List<Map<String, Object>> bc = listOf(out, "top_betweenness");
        assertFalse(bc.isEmpty(), "path must have a bridging node");
        Map<String, Object> top = bc.get(0);
        assertEquals("1", top.get("label"));
        assertEquals(1.0, ((Number) top.get("betweenness")).doubleValue(), 1e-9);
    }

    @Test
    @DisplayName("사이클 0-1-2-0 → 단절점 없음, 매개 중심성 전부 0")
    void cycleHasNoArticulation() {
        Map<String, Object> out = controllerFor(
                graph(List.of("0", "1", "2"), "0-1", "1-2", "2-0")).analytics();

        assertTrue(listOf(out, "articulation_points").isEmpty(), "a cycle has no cut vertex");
        assertTrue(listOf(out, "top_betweenness").isEmpty(), "no node lies between others in a triangle");
    }

    @Test
    @DisplayName("별 그래프 → 중심이 단절점·최고 차수·최고 매개 중심성")
    void starGraph() {
        Map<String, Object> out = controllerFor(
                graph(List.of("c", "a", "b", "d"), "c-a", "c-b", "c-d")).analytics();

        // 단절점 = 중심 c 하나
        assertEquals(Set.of("c"), labels(listOf(out, "articulation_points")));

        // 최고 차수 = c(3)
        Map<String, Object> topDeg = listOf(out, "top_degree").get(0);
        assertEquals("c", topDeg.get("label"));
        assertEquals(3, topDeg.get("degree"));

        // 최고 매개 중심성 = c
        Map<String, Object> topBc = listOf(out, "top_betweenness").get(0);
        assertEquals("c", topBc.get("label"));
    }

    @Test
    @DisplayName("두 삼각형을 다리로 이은 그래프 → 다리 양끝이 단절점이자 매개 중심성 최상위")
    void bridgeBetweenTwoTriangles() {
        // 삼각형1 {a,b,c}, 삼각형2 {d,e,f}, 다리 c-d
        Map<String, Object> out = controllerFor(graph(
                List.of("a", "b", "c", "d", "e", "f"),
                "a-b", "b-c", "c-a",     // triangle 1
                "d-e", "e-f", "f-d",     // triangle 2
                "c-d")).analytics();     // bridge

        assertEquals(Set.of("c", "d"), labels(listOf(out, "articulation_points")),
                "only the two bridge endpoints split the graph");

        // 매개 중심성 상위 2개는 c, d (두 조직을 잇는 다리)
        Set<String> topTwoBc = labels(listOf(out, "top_betweenness").subList(0, 2));
        assertEquals(Set.of("c", "d"), topTwoBc);

        // 하나의 연결 컴포넌트(크기 6)
        List<Map<String, Object>> comps = listOf(out, "components");
        assertEquals(1, comps.size());
        assertEquals(6, comps.get(0).get("size"));
    }

    @Test
    @DisplayName("분리된 두 컴포넌트 + 고립 노드 → 컴포넌트 2개(고립 노드 제외)")
    void disconnectedComponentsExcludeIsolated() {
        // 컴포넌트1: a-b-c, 컴포넌트2: x-y, 고립: z
        Map<String, Object> out = controllerFor(graph(
                List.of("a", "b", "c", "x", "y", "z"),
                "a-b", "b-c", "x-y")).analytics();

        List<Map<String, Object>> comps = listOf(out, "components");
        assertEquals(2, comps.size(), "isolated node z (size 1) is not a component");
        // 큰 컴포넌트 먼저 정렬됨
        assertEquals(3, comps.get(0).get("size"));
        assertEquals(2, comps.get(1).get("size"));

        assertEquals(6, out.get("node_count"));
        assertEquals(3, out.get("edge_count"));
    }

    @Test
    @DisplayName("자기루프·미지 끝점·중복 간선은 무시(방어적 인접 리스트)")
    void adjacencyIgnoresSelfLoopsAndUnknownEndpoints() {
        Map<String, Object> out = controllerFor(graph(
                List.of("a", "b"),
                "a-a",        // 자기루프 → 무시
                "a-b",        // 유효
                "a-b",        // 중복 → dedup
                "a-ghost")    // 미지 끝점 → 무시
        ).analytics();

        // a-b 만 유효 → 컴포넌트 1개(크기 2), 단절점 없음
        List<Map<String, Object>> comps = listOf(out, "components");
        assertEquals(1, comps.size());
        assertEquals(2, comps.get(0).get("size"));
        assertTrue(listOf(out, "articulation_points").isEmpty());

        // 각 노드 차수 1 (중복/자기루프가 부풀리지 않음)
        for (Map<String, Object> d : listOf(out, "top_degree")) {
            assertEquals(1, d.get("degree"));
        }
    }

    @Test
    @DisplayName("컴포넌트 id 는 멤버 라벨 집합에서 결정적으로 유도된다(CMP- 접두)")
    void componentIdIsDeterministic() {
        Map<String, Object> g = graph(List.of("a", "b", "c"), "a-b", "b-c");
        String id1 = String.valueOf(listOf(controllerFor(g).analytics(), "components").get(0).get("id"));
        String id2 = String.valueOf(listOf(controllerFor(g).analytics(), "components").get(0).get("id"));
        assertEquals(id1, id2);
        assertTrue(id1.startsWith("CMP-"), "component id must carry CMP- prefix, got: " + id1);
    }
}
