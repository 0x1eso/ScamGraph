package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * SeedGraph 단위 테스트 — 시드 관계망의 구조적 불변식을 검증한다.
 * 공유 인프라(하나의 IP에 여러 피싱 호스트가 물려 있다는 귀속 신호)와
 * 노드 id 유일성(Host는 "host:" 접두사로 Target과 충돌하지 않음)이 핵심.
 */
class SeedGraphTest {

    @Test
    @DisplayName("nodes()와 edges()는 비어있지 않다")
    void graphIsNonEmpty() {
        assertFalse(SeedGraph.nodes().isEmpty(), "nodes must be non-empty");
        assertFalse(SeedGraph.edges().isEmpty(), "edges must be non-empty");
    }

    @Test
    @DisplayName("공유 IP 203.0.113.44 노드가 존재한다 (귀속 pivot)")
    void sharedIpNodeExists() {
        boolean hasSharedIp = SeedGraph.nodes().stream()
                .anyMatch(n -> "203.0.113.44".equals(n.get("id"))
                        && "IP".equals(n.get("type")));
        assertTrue(hasSharedIp, "shared IP node 203.0.113.44 (type IP) must exist");
    }

    @Test
    @DisplayName("노드 id는 유일하다 — Host는 host: 접두사로 Target과 충돌하지 않음")
    void nodeIdsAreUnique() {
        List<Map<String, Object>> nodes = SeedGraph.nodes();
        Set<Object> ids = new HashSet<>();
        for (Map<String, Object> n : nodes) {
            Object id = n.get("id");
            assertTrue(ids.add(id), "duplicate node id: " + id);
        }
        assertEquals(nodes.size(), ids.size());

        // Host 노드는 반드시 "host:" 접두사를 가져 동명의 Target과 구분된다.
        boolean hasHostPrefixed = nodes.stream()
                .filter(n -> "Host".equals(n.get("type")))
                .allMatch(n -> String.valueOf(n.get("id")).startsWith("host:"));
        assertTrue(hasHostPrefixed, "every Host node id must start with 'host:'");
    }

    @Test
    @DisplayName("여러 피싱 호스트가 공유 IP로 수렴한다 (HOSTED_ON)")
    void multipleHostsResolveToSharedIp() {
        long hostedOnSharedIp = SeedGraph.edges().stream()
                .filter(e -> "HOSTED_ON".equals(e.get("type")))
                .filter(e -> "203.0.113.44".equals(e.get("target")))
                .count();
        assertTrue(hostedOnSharedIp >= 2,
                "shared IP must aggregate multiple hosts, found " + hostedOnSharedIp);
    }

    @Test
    @DisplayName("edge의 source/target은 실재하는 노드 id를 가리킨다")
    void edgesReferenceExistingNodes() {
        Set<Object> nodeIds = new HashSet<>();
        for (Map<String, Object> n : SeedGraph.nodes()) {
            nodeIds.add(n.get("id"));
        }
        for (Map<String, Object> e : SeedGraph.edges()) {
            assertTrue(nodeIds.contains(e.get("source")),
                    "edge source not in nodes: " + e.get("source"));
            assertTrue(nodeIds.contains(e.get("target")),
                    "edge target not in nodes: " + e.get("target"));
        }
    }
}
