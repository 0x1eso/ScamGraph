package io.scamgraph.gateway;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 관계망 데이터 소스: Neo4j 실데이터 우선, 비었거나 오류면 시드 그래프로 폴백.
 * 여러 엔드포인트(/graph·/attribution·/check·/feed)가 매 요청 호출하므로
 * 짧은 TTL 캐시로 Neo4j 부하를 줄인다(성능 하드닝).
 */
@Component
public class GraphSource {

    private static final long TTL_MS = 8000;

    private final Neo4jGraphReader reader;
    private volatile Map<String, Object> cache;
    private volatile long cachedAt;

    public GraphSource(Neo4jGraphReader reader) {
        this.reader = reader;
    }

    public Map<String, Object> current() {
        long now = System.currentTimeMillis();
        Map<String, Object> cached = cache;
        if (cached != null && now - cachedAt < TTL_MS) {
            return cached;
        }
        Map<String, Object> fresh = load();
        cache = fresh;
        cachedAt = now;
        return fresh;
    }

    private Map<String, Object> load() {
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
