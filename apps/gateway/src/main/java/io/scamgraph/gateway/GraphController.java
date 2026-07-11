package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 사기 인프라 관계 그래프 API. 프론트가 호출 → 엔진으로 위임.
 * 엔진이 죽어도 데모가 돌도록, 예외 시 seed.cypher 기반 시드 그래프를 반환한다.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Graph", description = "사기 조직 인프라 관계망 그래프 API")
public class GraphController {

    private final RestClient engine;
    private final List<Map<String, Object>> seedNodes = buildSeedNodes();
    private final List<Map<String, Object>> seedEdges = buildSeedEdges();

    public GraphController(RestClient.Builder builder, @Value("${engine.url}") String engineUrl) {
        this.engine = builder.baseUrl(engineUrl).build();
    }

    @GetMapping("/graph")
    @Operation(summary = "사기 인프라 관계 그래프 조회",
            description = "캠페인·대상·호스트·IP·전화·계좌·신고 노드와 관계를 반환합니다. 엔진 미가동 시 시드 그래프로 폴백합니다.")
    public Object graph(@RequestParam(defaultValue = "500") int limit) {
        try {
            return engine.get()
                    .uri("/graph?limit={limit}", limit)
                    .retrieve()
                    .body(Object.class);
        } catch (Exception e) {
            // 데모 세이프: 엔진이 죽어도 시드 그래프 반환
            return seedGraph();
        }
    }

    @GetMapping("/graph/expand")
    @Operation(summary = "노드 이웃 확장",
            description = "지정한 값의 노드와 직접 연결된 노드/관계를 반환합니다. 엔진 미가동 시 시드 그래프를 필터링해 폴백합니다.")
    public Object expand(@RequestParam String value) {
        try {
            return engine.get()
                    .uri("/graph/expand?value={value}", value)
                    .retrieve()
                    .body(Object.class);
        } catch (Exception e) {
            // 데모 세이프: 시드 그래프에서 해당 노드 이웃만 추려서 반환
            return expandSeed(value);
        }
    }

    private Map<String, Object> seedGraph() {
        return Map.of("nodes", seedNodes, "edges", seedEdges);
    }

    private Map<String, Object> expandSeed(String value) {
        boolean exists = seedNodes.stream().anyMatch(n -> value.equals(n.get("id")));
        if (!exists) {
            // 값을 못 찾으면 전체 시드 그래프
            return seedGraph();
        }
        List<Map<String, Object>> edges = seedEdges.stream()
                .filter(e -> value.equals(e.get("source")) || value.equals(e.get("target")))
                .toList();
        Set<String> ids = new HashSet<>();
        ids.add(value);
        for (Map<String, Object> e : edges) {
            ids.add((String) e.get("source"));
            ids.add((String) e.get("target"));
        }
        List<Map<String, Object>> nodes = seedNodes.stream()
                .filter(n -> ids.contains(n.get("id")))
                .toList();
        return Map.of("nodes", nodes, "edges", edges);
    }

    // --- 시드 데이터 (infra/neo4j/seed.cypher 미러) ---

    private static Map<String, Object> node(String id, String label, String type, String grade, Integer riskScore) {
        // grade/risk_score 가 null 일 수 있어 Map.of 대신 LinkedHashMap 사용
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
                // 캠페인
                node("택배사칭-A", "택배사칭-A", "Campaign", null, null),
                node("은행피싱-B", "은행피싱-B", "Campaign", null, null),
                // 대상(Target)
                node("cj-delivery-check.top", "cj-delivery-check.top", "Target", "danger", 92),
                node("cj-delivery-track.xyz", "cj-delivery-track.xyz", "Target", "danger", 88),
                node("kbstat-secure.click", "kbstat-secure.click", "Target", "danger", 95),
                node("shinhan-otp.xyz", "shinhan-otp.xyz", "Target", "danger", 90),
                // 호스트(Host)
                node("host:cj-delivery-check.top", "cj-delivery-check.top", "Host", null, null),
                node("host:cj-delivery-track.xyz", "cj-delivery-track.xyz", "Host", null, null),
                node("host:kbstat-secure.click", "kbstat-secure.click", "Host", null, null),
                node("host:shinhan-otp.xyz", "shinhan-otp.xyz", "Host", null, null),
                // 공유 IP — 두 조직을 잇는 핵심 단서
                node("203.0.113.44", "203.0.113.44", "IP", null, null),
                // 전화(Phone)
                node("070-4123-9981", "070-4123-9981", "Phone", null, null),
                node("070-8842-1120", "070-8842-1120", "Phone", null, null),
                // 계좌(Account)
                node("352-9981-2210-11", "352-9981-2210-11 (농협)", "Account", null, null),
                node("110-441-882201", "110-441-882201 (신한)", "Account", null, null),
                // 시민 신고(Report)
                node("report:1", "택배 문자 클릭 유도", "Report", null, null),
                node("report:2", "OTP 입력 요구", "Report", null, null)
        );
    }

    private static List<Map<String, Object>> buildSeedEdges() {
        return List.of(
                // 택배사칭-A
                edge("택배사칭-A", "cj-delivery-check.top", "USES"),
                edge("택배사칭-A", "cj-delivery-track.xyz", "USES"),
                edge("cj-delivery-check.top", "host:cj-delivery-check.top", "RESOLVES_TO"),
                edge("cj-delivery-track.xyz", "host:cj-delivery-track.xyz", "RESOLVES_TO"),
                edge("host:cj-delivery-check.top", "203.0.113.44", "HOSTED_ON"),
                edge("host:cj-delivery-track.xyz", "203.0.113.44", "HOSTED_ON"),
                edge("택배사칭-A", "070-4123-9981", "CONTACT"),
                edge("택배사칭-A", "352-9981-2210-11", "PAYOUT"),
                // 은행피싱-B (A와 동일 IP 공유로 연결)
                edge("은행피싱-B", "kbstat-secure.click", "USES"),
                edge("은행피싱-B", "shinhan-otp.xyz", "USES"),
                edge("kbstat-secure.click", "host:kbstat-secure.click", "RESOLVES_TO"),
                edge("shinhan-otp.xyz", "host:shinhan-otp.xyz", "RESOLVES_TO"),
                edge("host:kbstat-secure.click", "203.0.113.44", "HOSTED_ON"),
                edge("host:shinhan-otp.xyz", "203.0.113.44", "HOSTED_ON"),
                edge("은행피싱-B", "070-8842-1120", "CONTACT"),
                edge("은행피싱-B", "110-441-882201", "PAYOUT"),
                // 시민 신고
                edge("report:1", "cj-delivery-check.top", "REPORTS"),
                edge("report:2", "kbstat-secure.click", "REPORTS")
        );
    }
}
