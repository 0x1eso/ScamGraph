package io.scamgraph.gateway;

import org.neo4j.driver.Driver;
import org.neo4j.driver.Session;
import org.neo4j.driver.types.Node;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Neo4j에서 사기 인프라 관계망(워커가 적재한 실데이터 + 시드)을 읽어
 * 프론트 계약 {nodes, edges} 로 매핑한다.
 * Host 는 Target 과 이름이 겹치므로 id 에 "host:" 접두어를 붙인다(계약 일치).
 */
@Component
public class Neo4jGraphReader {

    private final Driver driver;

    public Neo4jGraphReader(Driver driver) {
        this.driver = driver;
    }

    /** 전체 그래프. Neo4j 가 비었거나 오류면 nodes 가 빈 리스트인 결과를 반환한다. */
    public Map<String, Object> readGraph(int limit) {
        Map<String, Map<String, Object>> nodes = new LinkedHashMap<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        try (Session session = driver.session()) {
            session.run("MATCH (n) RETURN n LIMIT $limit", Map.of("limit", limit))
                    .forEachRemaining(rec -> {
                        Map<String, Object> mapped = mapNode(rec.get("n").asNode());
                        nodes.put((String) mapped.get("id"), mapped);
                    });

            session.run("MATCH (a)-[r]->(b) RETURN a, type(r) AS t, b LIMIT $limit",
                            Map.of("limit", (long) limit * 4))
                    .forEachRemaining(rec -> {
                        String source = nodeId(rec.get("a").asNode());
                        String target = nodeId(rec.get("b").asNode());
                        edges.add(Map.of("source", source, "target", target,
                                "type", rec.get("t").asString()));
                    });
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("nodes", new ArrayList<>(nodes.values()));
        out.put("edges", edges);
        return out;
    }

    private static Map<String, Object> mapNode(Node n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", nodeId(n));
        m.put("label", nodeLabel(n));
        m.put("type", nodeType(n));
        m.put("grade", prop(n, "grade"));
        m.put("risk_score",
                n.containsKey("risk_score") && !n.get("risk_score").isNull()
                        ? n.get("risk_score").asInt() : null);
        return m;
    }

    private static String prop(Node n, String key) {
        return n.containsKey(key) && !n.get(key).isNull() ? n.get(key).asString() : null;
    }

    private static Set<String> labels(Node n) {
        Set<String> set = new HashSet<>();
        n.labels().forEach(set::add);
        return set;
    }

    static String nodeType(Node n) {
        Iterator<String> it = n.labels().iterator();
        return it.hasNext() ? it.next() : "Node";
    }

    static String nodeId(Node n) {
        Set<String> l = labels(n);
        if (l.contains("Host")) return "host:" + prop(n, "name");
        if (l.contains("Campaign")) return prop(n, "name");
        if (l.contains("Target")) return prop(n, "value");
        if (l.contains("IP")) return prop(n, "addr");
        if (l.contains("Phone")) return prop(n, "number");
        if (l.contains("Account")) return prop(n, "number");
        if (l.contains("Registrant")) return "reg:" + prop(n, "name");
        if (l.contains("Cert")) return "cert:" + prop(n, "fingerprint");
        if (l.contains("Report")) return "report:" + n.elementId();
        return n.elementId();
    }

    static String nodeLabel(Node n) {
        Set<String> l = labels(n);
        if (l.contains("Campaign")) return prop(n, "name");
        if (l.contains("Target")) return prop(n, "value");
        if (l.contains("Host")) return prop(n, "name");
        if (l.contains("IP")) return prop(n, "addr");
        if (l.contains("Phone")) return prop(n, "number");
        if (l.contains("Account")) return prop(n, "number");
        if (l.contains("Registrant")) return prop(n, "name");
        if (l.contains("Cert")) {
            String fp = prop(n, "fingerprint");
            return fp != null ? "cert:" + fp : "cert";
        }
        if (l.contains("Report")) {
            String note = prop(n, "note");
            return note != null ? note : "신고";
        }
        return nodeId(n);
    }
}
