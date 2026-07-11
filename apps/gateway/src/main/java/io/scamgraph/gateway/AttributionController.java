package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 사기 조직 귀속(Attribution) — 엔티티가 속한 조직의 전체 인프라를 복원한다.
 * 정부·통신사가 사일로별(전화 / 계좌 / URL)로 보는 것을, 도메인·전화·계좌·IP를
 * 하나의 조직으로 통합해 보여주는 것이 ScamGraph 의 핵심 차별점.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Attribution", description = "사기 조직 귀속 — 교차 인프라 통합")
public class AttributionController {

    // 그래프를 구성한 신호의 출처(다출처 통합을 눈에 보이게)
    private static final List<String> SOURCES =
            List.of("규칙엔진", "커뮤니티신고", "공개데이터(WHOIS·DNS)");

    // 진짜 "공유 인프라" pivot 만: IP·계좌·전화 (Host 는 도메인과 1:1이라 제외)
    private static final Set<String> PIVOT_TYPES = Set.of("IP", "Account", "Phone");

    private final GraphSource graphSource;

    public AttributionController(GraphSource graphSource) {
        this.graphSource = graphSource;
    }

    @GetMapping("/attribution")
    @Operation(summary = "사기 조직 귀속",
            description = "엔티티가 속한 사기 조직의 전체 인프라(도메인·전화·계좌·IP)를 복원하고 공유 pivot을 제시합니다.")
    @SuppressWarnings("unchecked")
    public Map<String, Object> attribution(@RequestParam String value) {
        Map<String, Object> graph = graphSource.current();
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) graph.get("nodes");
        List<Map<String, Object>> edges = (List<Map<String, Object>>) graph.get("edges");

        Map<String, Map<String, Object>> byId = new HashMap<>();
        for (Map<String, Object> n : nodes) {
            byId.put((String) n.get("id"), n);
        }

        Map<String, Set<String>> adj = new HashMap<>();
        Map<String, Integer> degree = new HashMap<>();
        for (Map<String, Object> e : edges) {
            String s = (String) e.get("source");
            String t = (String) e.get("target");
            adj.computeIfAbsent(s, k -> new HashSet<>()).add(t);
            adj.computeIfAbsent(t, k -> new HashSet<>()).add(s);
            degree.merge(s, 1, Integer::sum);
            degree.merge(t, 1, Integer::sum);
        }

        if (!byId.containsKey(value)) {
            return notAttributed(value);
        }

        String campaignId = bfsFindCampaign(value, adj, byId);
        if (campaignId == null) {
            return notAttributed(value);
        }

        Set<String> org = bfsReachable(campaignId, adj);

        List<String> domains = new ArrayList<>();
        List<String> phones = new ArrayList<>();
        List<String> accounts = new ArrayList<>();
        List<String> ips = new ArrayList<>();
        for (String id : org) {
            Map<String, Object> n = byId.get(id);
            if (n == null) continue;
            String type = (String) n.get("type");
            String label = (String) n.get("label");
            switch (type) {
                case "Target" -> domains.add(label);
                case "Phone" -> phones.add(label);
                case "Account" -> accounts.add(label);
                case "IP" -> ips.add(label);
                default -> { /* Campaign/Host/Report 는 breakdown 에서 제외 */ }
            }
        }

        List<Map<String, Object>> pivots = new ArrayList<>();
        for (String id : org) {
            Map<String, Object> n = byId.get(id);
            if (n == null) continue;
            String type = (String) n.get("type");
            if (PIVOT_TYPES.contains(type) && degree.getOrDefault(id, 0) >= 2) {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("type", type);
                p.put("value", n.get("label"));
                p.put("sharedWith", adj.getOrDefault(id, Set.of()).size());
                pivots.add(p);
            }
        }
        pivots.sort((a, b) -> ((Integer) b.get("sharedWith")) - ((Integer) a.get("sharedWith")));

        String orgName = (String) byId.get(campaignId).get("label");
        Map<String, Object> entities = new LinkedHashMap<>();
        entities.put("domains", domains);
        entities.put("phones", phones);
        entities.put("accounts", accounts);
        entities.put("ips", ips);

        String summary = String.format(
                "'%s' 은(는) 사기 조직 '%s' 소속 — 도메인 %d · 전화 %d · 계좌 %d · IP %d 를 공유하는 단일 인프라입니다.",
                value, orgName, domains.size(), phones.size(), accounts.size(), ips.size());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("value", value);
        out.put("organization", orgName);
        out.put("entities", entities);
        out.put("pivots", pivots);
        out.put("sources", SOURCES);
        out.put("summary", summary);
        return out;
    }

    private static Map<String, Object> notAttributed(String value) {
        Map<String, Object> entities = new LinkedHashMap<>();
        entities.put("domains", List.of());
        entities.put("phones", List.of());
        entities.put("accounts", List.of());
        entities.put("ips", List.of());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("value", value);
        out.put("organization", null);
        out.put("entities", entities);
        out.put("pivots", List.of());
        out.put("sources", SOURCES);
        out.put("summary", "알려진 사기 조직과 공유하는 인프라가 없습니다 (독립 엔티티).");
        return out;
    }

    /** 시작 노드에서 가장 가까운 Campaign 을 찾는다. */
    private static String bfsFindCampaign(String start, Map<String, Set<String>> adj,
                                          Map<String, Map<String, Object>> byId) {
        Map<String, Object> startNode = byId.get(start);
        if (startNode != null && "Campaign".equals(startNode.get("type"))) {
            return start;
        }
        Deque<String> queue = new ArrayDeque<>();
        Set<String> seen = new HashSet<>();
        queue.add(start);
        seen.add(start);
        while (!queue.isEmpty()) {
            String cur = queue.poll();
            Map<String, Object> n = byId.get(cur);
            if (n != null && "Campaign".equals(n.get("type"))) {
                return cur;
            }
            for (String nb : adj.getOrDefault(cur, Set.of())) {
                if (seen.add(nb)) {
                    queue.add(nb);
                }
            }
        }
        return null;
    }

    /** Campaign 에서 도달 가능한 전체 조직(공유 인프라로 연결된 다른 캠페인 포함). */
    private static Set<String> bfsReachable(String start, Map<String, Set<String>> adj) {
        Deque<String> queue = new ArrayDeque<>();
        Set<String> seen = new HashSet<>();
        queue.add(start);
        seen.add(start);
        while (!queue.isEmpty()) {
            String cur = queue.poll();
            for (String nb : adj.getOrDefault(cur, Set.of())) {
                if (seen.add(nb)) {
                    queue.add(nb);
                }
            }
        }
        return seen;
    }
}
