package io.scamgraph.gateway;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** 관계망 데이터 소스: Neo4j 실데이터 우선, 비었거나 오류면 시드 그래프로 폴백. */
@Component
public class GraphSource {

    private final Neo4jGraphReader reader;

    public GraphSource(Neo4jGraphReader reader) {
        this.reader = reader;
    }

    public Map<String, Object> current() {
        try {
            Map<String, Object> g = reader.readGraph(500);
            List<?> nodes = (List<?>) g.get("nodes");
            if (nodes != null && !nodes.isEmpty()) {
                return g;
            }
        } catch (Exception ignored) {
            // Neo4j 미가동 → 시드 폴백
        }
        return SeedGraph.graph();
    }
}
