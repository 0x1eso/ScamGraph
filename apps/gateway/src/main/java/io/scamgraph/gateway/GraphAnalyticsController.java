package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 관계망 분석(Graph Analytics) — 순수 Java 그래프 알고리즘으로 사기 인프라의 <b>구조</b>를 드러낸다.
 * AI 없이, 외부 라이브러리 없이, 게이트웨이가 이미 읽고 있는 {@link GraphSource} 위에서 계산한다.
 * <p>
 * 네 가지 신호를 낸다:
 * <ul>
 *   <li><b>연결 컴포넌트</b> — 인프라로 이어진 하나의 조직(캠페인) 단위.</li>
 *   <li><b>연결 중심성(degree)</b> — 가장 많은 엔티티를 직접 물고 있는 허브.</li>
 *   <li><b>매개 중심성(betweenness, Brandes)</b> — <i>여러 조직을 잇는 다리</i>가 되는 공유 인프라.
 *       "이 IP 하나가 두 조직을 연결한다"를 정량적으로 집어낸다.</li>
 *   <li><b>단절점(articulation point)</b> — 제거 시 조직이 쪼개지는 급소.
 *       "차단하면 조직이 분리되는 핵심 인프라"의 근거.</li>
 * </ul>
 * <p>
 * 그래프는 무방향으로 취급한다({@link CampaignController} 와 동일). 모든 계산은 try/catch 로 감싸
 * 실패해도 500 대신 빈 구조를 돌려준다(데모 세이프).
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "GraphAnalytics", description = "관계망 구조 분석 — 조직 클러스터·허브·다리·급소")
public class GraphAnalyticsController {

    private static final Logger log = LoggerFactory.getLogger(GraphAnalyticsController.class);

    /** 상위 목록 크기(중심성 랭킹). */
    private static final int TOP_N = 10;
    /** 컴포넌트로 인정할 최소 크기(고립 노드는 조직이 아님). */
    private static final int MIN_COMPONENT_SIZE = 2;
    /** 응답에 담을 컴포넌트 개수 상한. 초과 시 로그. */
    private static final int MAX_COMPONENTS = 50;
    /** 컴포넌트별 멤버 라벨 상한. 초과 시 로그. */
    private static final int MAX_MEMBERS = 40;
    /** 단절점 목록 상한. 초과 시 로그. */
    private static final int MAX_ARTICULATION = 60;
    /** Brandes 는 O(V·E) — 비정상적으로 큰 그래프에서는 건너뛴다(리더가 500 으로 이미 제한). */
    private static final int MAX_BETWEENNESS_NODES = 2000;

    private final GraphSource graphSource;

    public GraphAnalyticsController(GraphSource graphSource) {
        this.graphSource = graphSource;
    }

    @GetMapping("/graph/analytics")
    @Operation(summary = "관계망 구조 분석",
            description = "현재 관계망(Neo4j 실데이터 우선, 폴백 시드)에서 연결 컴포넌트(조직), "
                    + "연결·매개 중심성(허브·다리), 단절점(차단 급소)을 순수 Java 로 계산해 반환합니다.")
    public Map<String, Object> analytics() {
        try {
            return compute();
        } catch (Exception e) {
            // 어떤 예외에도 화면/API 는 살아있어야 한다 — 빈 구조로 폴백.
            log.warn("graph analytics 실패 → 빈 구조 폴백", e);
            return emptyResult();
        }
    }

    // ── 본체 ─────────────────────────────────────────────────────────
    @SuppressWarnings("unchecked")
    private Map<String, Object> compute() {
        Map<String, Object> graph = graphSource.current();
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) graph.get("nodes");
        List<Map<String, Object>> edges = (List<Map<String, Object>>) graph.get("edges");
        if (nodes == null || nodes.isEmpty()) {
            return emptyResult();
        }
        if (edges == null) {
            edges = List.of();
        }

        // 1) 노드 인덱싱(0..n-1) — 알고리즘은 정수 인덱스로 다뤄 결정적이고 빠르다.
        Map<String, Integer> idToIndex = new LinkedHashMap<>();
        List<String> idList = new ArrayList<>();
        List<String> labelList = new ArrayList<>();
        List<String> typeList = new ArrayList<>();
        for (Map<String, Object> node : nodes) {
            String id = (String) node.get("id");
            if (id == null || idToIndex.containsKey(id)) {
                continue;  // null·중복 id 방어.
            }
            idToIndex.put(id, idList.size());
            idList.add(id);
            Object label = node.get("label");
            labelList.add(label != null ? label.toString() : id);
            Object type = node.get("type");
            typeList.add(type != null ? type.toString() : "Unknown");
        }
        int n = idList.size();
        String[] ids = idList.toArray(new String[0]);
        String[] labels = labelList.toArray(new String[0]);
        String[] types = typeList.toArray(new String[0]);

        // 2) 무방향 인접 리스트(중복 이웃·자기루프 제거).
        int[][] adj = buildAdjacency(n, edges, idToIndex);
        int[] degree = new int[n];
        for (int i = 0; i < n; i++) {
            degree[i] = adj[i].length;
        }

        // 3) 알고리즘.
        int[] comp = connectedComponents(n, adj);
        double[] betweenness = n <= MAX_BETWEENNESS_NODES ? brandes(n, adj) : null;
        if (betweenness == null) {
            log.info("graph analytics: 노드 {}개 > 상한 {} → betweenness 생략",
                    n, MAX_BETWEENNESS_NODES);
        }
        boolean[] isCut = articulationPoints(n, adj);

        // 4) 응답 조립.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("components", buildComponents(comp, ids, labels, types, degree));
        out.put("top_degree", buildTopDegree(n, ids, labels, types, degree));
        out.put("top_betweenness", buildTopBetweenness(n, ids, labels, betweenness));
        out.put("articulation_points", buildArticulation(n, isCut, ids, labels, types, degree));
        out.put("node_count", nodes.size());
        out.put("edge_count", edges.size());
        return out;
    }

    // ── 인접 리스트 ───────────────────────────────────────────────────
    private static int[][] buildAdjacency(int n, List<Map<String, Object>> edges,
                                          Map<String, Integer> idToIndex) {
        List<LinkedHashSet<Integer>> adjSet = new ArrayList<>(n);
        for (int i = 0; i < n; i++) {
            adjSet.add(new LinkedHashSet<>());
        }
        for (Map<String, Object> e : edges) {
            Integer s = idToIndex.get((String) e.get("source"));
            Integer t = idToIndex.get((String) e.get("target"));
            if (s == null || t == null || s.equals(t)) {
                continue;  // 미지의 끝점·자기루프는 무시.
            }
            adjSet.get(s).add(t);
            adjSet.get(t).add(s);
        }
        int[][] adj = new int[n][];
        for (int i = 0; i < n; i++) {
            LinkedHashSet<Integer> set = adjSet.get(i);
            int[] row = new int[set.size()];
            int k = 0;
            for (int nb : set) {
                row[k++] = nb;
            }
            adj[i] = row;
        }
        return adj;
    }

    // ── 연결 컴포넌트(BFS) ────────────────────────────────────────────
    private static int[] connectedComponents(int n, int[][] adj) {
        int[] comp = new int[n];
        Arrays.fill(comp, -1);
        int c = 0;
        Deque<Integer> queue = new ArrayDeque<>();
        for (int s = 0; s < n; s++) {
            if (comp[s] != -1) {
                continue;
            }
            comp[s] = c;
            queue.add(s);
            while (!queue.isEmpty()) {
                int v = queue.poll();
                for (int w : adj[v]) {
                    if (comp[w] == -1) {
                        comp[w] = c;
                        queue.add(w);
                    }
                }
            }
            c++;
        }
        return comp;
    }

    // ── 매개 중심성: Brandes(무가중치, BFS 기반) ──────────────────────
    //    무방향이므로 각 측지선 쌍이 양쪽에서 두 번 세어져 마지막에 /2.
    private static double[] brandes(int n, int[][] adj) {
        double[] bc = new double[n];
        for (int s = 0; s < n; s++) {
            Deque<Integer> stack = new ArrayDeque<>();
            List<List<Integer>> pred = new ArrayList<>(n);
            for (int i = 0; i < n; i++) {
                pred.add(new ArrayList<>());
            }
            double[] sigma = new double[n];
            sigma[s] = 1.0;
            int[] dist = new int[n];
            Arrays.fill(dist, -1);
            dist[s] = 0;

            Deque<Integer> queue = new ArrayDeque<>();
            queue.add(s);
            while (!queue.isEmpty()) {
                int v = queue.poll();
                stack.push(v);
                for (int w : adj[v]) {
                    if (dist[w] < 0) {
                        dist[w] = dist[v] + 1;
                        queue.add(w);
                    }
                    if (dist[w] == dist[v] + 1) {
                        sigma[w] += sigma[v];
                        pred.get(w).add(v);
                    }
                }
            }

            double[] delta = new double[n];
            while (!stack.isEmpty()) {
                int w = stack.pop();
                for (int v : pred.get(w)) {
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w]);
                }
                if (w != s) {
                    bc[w] += delta[w];
                }
            }
        }
        for (int i = 0; i < n; i++) {
            bc[i] /= 2.0;
        }
        return bc;
    }

    // ── 단절점: Tarjan lowlink(반복형 DFS로 스택오버플로 방지) ─────────
    private static boolean[] articulationPoints(int n, int[][] adj) {
        boolean[] isCut = new boolean[n];
        int[] disc = new int[n];
        Arrays.fill(disc, -1);
        int[] low = new int[n];
        int[] parent = new int[n];
        Arrays.fill(parent, -1);
        int[] childCount = new int[n];
        int[] next = new int[n];  // 각 노드에서 다음에 볼 이웃 인덱스(반복형 상태).
        int timer = 0;

        Deque<Integer> stack = new ArrayDeque<>();
        for (int s = 0; s < n; s++) {
            if (disc[s] != -1) {
                continue;
            }
            disc[s] = low[s] = timer++;
            stack.push(s);
            while (!stack.isEmpty()) {
                int u = stack.peek();
                if (next[u] < adj[u].length) {
                    int v = adj[u][next[u]++];
                    if (disc[v] == -1) {
                        parent[v] = u;
                        childCount[u]++;
                        disc[v] = low[v] = timer++;
                        stack.push(v);
                    } else if (v != parent[u]) {
                        low[u] = Math.min(low[u], disc[v]);  // 백엣지.
                    }
                } else {
                    // u 탐색 종료 → 부모 low 갱신 + 비루트 단절점 판정.
                    stack.pop();
                    int p = parent[u];
                    if (p != -1) {
                        low[p] = Math.min(low[p], low[u]);
                        if (parent[p] != -1 && low[u] >= disc[p]) {
                            isCut[p] = true;
                        }
                    }
                }
            }
            // 루트는 DFS 자식이 2개 이상일 때만 단절점.
            if (childCount[s] > 1) {
                isCut[s] = true;
            }
        }
        return isCut;
    }

    // ── 컴포넌트 조립 ─────────────────────────────────────────────────
    private static List<Map<String, Object>> buildComponents(
            int[] comp, String[] ids, String[] labels, String[] types, int[] degree) {
        int n = ids.length;
        // 컴포넌트 인덱스별 멤버 수집.
        Map<Integer, List<Integer>> groups = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) {
            groups.computeIfAbsent(comp[i], k -> new ArrayList<>()).add(i);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (List<Integer> members : groups.values()) {
            if (members.size() < MIN_COMPONENT_SIZE) {
                continue;
            }
            // 허브(중심성 높은 순)가 앞에 오도록 정렬 — 멤버 목록·top_hub 공용.
            members.sort((a, b) -> {
                int d = degree[b] - degree[a];
                return d != 0 ? d : labels[a].compareTo(labels[b]);
            });
            result.add(buildComponent(members, ids, labels, types, degree));
        }

        // 큰 조직 먼저.
        result.sort((a, b) -> (int) b.get("size") - (int) a.get("size"));
        if (result.size() > MAX_COMPONENTS) {
            log.info("graph analytics: 컴포넌트 {}개 → 상한 {} 로 절단", result.size(), MAX_COMPONENTS);
            result = new ArrayList<>(result.subList(0, MAX_COMPONENTS));
        }
        return result;
    }

    private static Map<String, Object> buildComponent(
            List<Integer> members, String[] ids, String[] labels, String[] types, int[] degree) {
        // node_types 분포(전체 멤버 기준).
        Map<String, Integer> typeCounts = new LinkedHashMap<>();
        List<String> sortedLabels = new ArrayList<>(members.size());
        for (int i : members) {
            typeCounts.merge(types[i], 1, Integer::sum);
            sortedLabels.add(labels[i]);
        }

        // 결정적 id: 멤버 라벨 집합(정렬)의 해시 — 어느 멤버에서 봐도 같은 사건번호.
        sortedLabels.sort(String::compareTo);
        String cid = deriveComponentId(sortedLabels);

        // 멤버 라벨(허브 순) 상한 적용.
        List<String> memberLabels = new ArrayList<>(members.size());
        for (int i : members) {
            memberLabels.add(labels[i]);
        }
        if (memberLabels.size() > MAX_MEMBERS) {
            log.info("graph analytics: 컴포넌트 {} 멤버 {}개 → 상한 {} 로 절단",
                    cid, memberLabels.size(), MAX_MEMBERS);
            memberLabels = new ArrayList<>(memberLabels.subList(0, MAX_MEMBERS));
        }

        int hub = members.get(0);  // 이미 degree 내림차순 정렬됨.
        Map<String, Object> topHub = new LinkedHashMap<>();
        topHub.put("node", ids[hub]);
        topHub.put("label", labels[hub]);
        topHub.put("type", types[hub]);
        topHub.put("degree", degree[hub]);

        Map<String, Object> c = new LinkedHashMap<>();
        c.put("id", cid);
        c.put("size", members.size());
        c.put("members", memberLabels);
        c.put("node_types", sortByCountDesc(typeCounts));
        c.put("top_hub", topHub);
        return c;
    }

    private static Map<String, Object> sortByCountDesc(Map<String, Integer> counts) {
        List<Map.Entry<String, Integer>> entries = new ArrayList<>(counts.entrySet());
        entries.sort((a, b) -> {
            int d = b.getValue() - a.getValue();
            return d != 0 ? d : a.getKey().compareTo(b.getKey());
        });
        Map<String, Object> ordered = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> e : entries) {
            ordered.put(e.getKey(), e.getValue());
        }
        return ordered;
    }

    private static String deriveComponentId(List<String> sortedLabels) {
        String key = sortedLabels.isEmpty() ? "unknown" : String.join("|", sortedLabels);
        int h = key.hashCode() & 0x7fffffff;
        return "CMP-" + String.format("%06X", h % 0x1000000);
    }

    // ── 연결 중심성 상위 ──────────────────────────────────────────────
    private static List<Map<String, Object>> buildTopDegree(
            int n, String[] ids, String[] labels, String[] types, int[] degree) {
        Integer[] order = indicesByDesc(n, i -> (double) degree[i], labels);
        List<Map<String, Object>> out = new ArrayList<>();
        for (int idx = 0; idx < n && out.size() < TOP_N; idx++) {
            int i = order[idx];
            if (degree[i] <= 0) {
                break;  // 고립 노드는 의미 없음(내림차순이므로 이후도 0).
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("node", ids[i]);
            m.put("label", labels[i]);
            m.put("type", types[i]);
            m.put("degree", degree[i]);
            out.add(m);
        }
        return out;
    }

    // ── 매개 중심성 상위 ──────────────────────────────────────────────
    private static List<Map<String, Object>> buildTopBetweenness(
            int n, String[] ids, String[] labels, double[] betweenness) {
        if (betweenness == null) {
            return List.of();
        }
        Integer[] order = indicesByDesc(n, i -> betweenness[i], labels);
        List<Map<String, Object>> out = new ArrayList<>();
        for (int idx = 0; idx < n && out.size() < TOP_N; idx++) {
            int i = order[idx];
            if (betweenness[i] <= 0.0) {
                break;  // 다리 역할이 없는 노드는 제외.
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("node", ids[i]);
            m.put("label", labels[i]);
            m.put("betweenness", round3(betweenness[i]));
            out.add(m);
        }
        return out;
    }

    // ── 단절점 조립 ───────────────────────────────────────────────────
    private static List<Map<String, Object>> buildArticulation(
            int n, boolean[] isCut, String[] ids, String[] labels, String[] types, int[] degree) {
        List<Integer> cuts = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (isCut[i]) {
                cuts.add(i);
            }
        }
        // 영향 큰(연결 많은) 급소 먼저.
        cuts.sort((a, b) -> {
            int d = degree[b] - degree[a];
            return d != 0 ? d : labels[a].compareTo(labels[b]);
        });
        if (cuts.size() > MAX_ARTICULATION) {
            log.info("graph analytics: 단절점 {}개 → 상한 {} 로 절단", cuts.size(), MAX_ARTICULATION);
            cuts = cuts.subList(0, MAX_ARTICULATION);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i : cuts) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("node", ids[i]);
            m.put("label", labels[i]);
            m.put("type", types[i]);
            out.add(m);
        }
        return out;
    }

    // ── 정렬 유틸: 점수 내림차순, 동점은 라벨 오름차순(결정적). ─────────
    private interface Score {
        double of(int i);
    }

    private static Integer[] indicesByDesc(int n, Score score, String[] labels) {
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) {
            order[i] = i;
        }
        Arrays.sort(order, (a, b) -> {
            int d = Double.compare(score.of(b), score.of(a));
            return d != 0 ? d : labels[a].compareTo(labels[b]);
        });
        return order;
    }

    private static double round3(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }

    // ── 폴백: 무엇이 실패해도 화면은 즉시 렌더된다(데모 세이프). ────────
    private static Map<String, Object> emptyResult() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("components", List.of());
        out.put("top_degree", List.of());
        out.put("top_betweenness", List.of());
        out.put("articulation_points", List.of());
        out.put("node_count", 0);
        out.put("edge_count", 0);
        return out;
    }
}
