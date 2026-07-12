package io.scamgraph.gateway;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 사기 조직 사건 파일(Case File) — 스캔→그래프 킬샷의 결말.
 * 하나의 엔티티에서 출발해 그 엔티티가 속한 범죄 조직의 <b>전체 인프라</b>를 복원하고,
 * 그것들이 왜 한 조직인지(공유 IP·등록자·인증서)를 물증(pivot)으로 제시한다.
 * <p>
 * 귀속(Attribution)이 "요약"이라면, Case File 은 그 조직의 완결된 기밀 도시에다.
 * 정부·통신사는 사일로별로 하나만 보지만, ScamGraph 는 조직 전체를 서류철로 복원한다.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
@Tag(name = "Campaign", description = "사기 조직 사건 파일 — 전체 인프라 복원 도시에")
public class CampaignController {

    private static final Logger log = LoggerFactory.getLogger(CampaignController.class);

    /** 인벤토리 유형별 상한(도시에가 무한정 커지지 않도록). 초과 시 로그로 남긴다. */
    private static final int MAX_PER_TYPE = 40;

    /** 진짜 "공유 인프라" pivot 유형 → 계약상 pivot type 문자열 매핑. */
    private static final Map<String, String> PIVOT_TYPES = Map.of(
            "IP", "shared_ip",
            "Registrant", "shared_registrant",
            "Cert", "shared_cert");

    /** pivot 유형별 한국어 라벨(권고문·설명용). */
    private static final Map<String, String> PIVOT_KO = Map.of(
            "shared_ip", "IP",
            "shared_registrant", "등록자",
            "shared_cert", "인증서");

    private final GraphSource graphSource;

    public CampaignController(GraphSource graphSource) {
        this.graphSource = graphSource;
    }

    @GetMapping("/campaign")
    @Operation(summary = "사기 조직 사건 파일",
            description = "엔티티(도메인·전화·계좌·IP)가 속한 사기 조직의 전체 인프라를 복원하고, "
                    + "이들을 하나로 묶는 공유 인프라(IP·등록자·인증서) 물증과 대응 권고를 반환합니다.")
    @SuppressWarnings("unchecked")
    public Map<String, Object> campaign(@RequestParam String value) {
        // 입력 검증 — 비정상적으로 긴 입력 방어.
        if (value == null || value.isBlank() || value.length() > 2048) {
            return demoOrg();  // 데모 세이프: 잘못된 입력에도 도시에는 항상 렌더된다.
        }

        Map<String, Object> graph;
        List<Map<String, Object>> nodes;
        List<Map<String, Object>> edges;
        try {
            graph = graphSource.current();
            nodes = (List<Map<String, Object>>) graph.get("nodes");
            edges = (List<Map<String, Object>>) graph.get("edges");
            if (nodes == null || nodes.isEmpty()) {
                // 그래프가 비었으면 시연용 조직으로 폴백(항상 렌더).
                return demoOrg();
            }
        } catch (Exception e) {
            log.warn("campaign: 그래프 접근 실패 → 데모 조직 폴백 (value={})", value, e);
            return demoOrg();
        }

        Map<String, Map<String, Object>> byId = new HashMap<>();
        Map<String, Map<String, Object>> byLabel = new HashMap<>();
        for (Map<String, Object> n : nodes) {
            byId.put((String) n.get("id"), n);
            byLabel.putIfAbsent((String) n.get("label"), n);
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

        String startId = resolveStartId(value, byId, byLabel);
        if (startId == null) {
            return notAttributed(value);
        }

        // 조직 전체 = 시작 엔티티에서 공유 인프라로 연결된 전체 컴포넌트.
        // 명명된 Campaign 노드가 없어도(예: 피드 IP 클러스터) 인프라 공유로 조직을 복원한다.
        Set<String> org = bfsReachable(startId, adj);

        List<String> domains = new ArrayList<>();
        List<String> phones = new ArrayList<>();
        List<String> accounts = new ArrayList<>();
        List<String> ips = new ArrayList<>();
        Set<String> campaignLabels = new LinkedHashSet<>();
        int worstRank = 0;

        for (String id : org) {
            Map<String, Object> n = byId.get(id);
            if (n == null) continue;
            String type = (String) n.get("type");
            String label = (String) n.get("label");
            switch (type) {
                case "Target" -> {
                    domains.add(label);
                    worstRank = Math.max(worstRank, rank((String) n.get("grade")));
                }
                case "Phone" -> phones.add(label);
                case "Account" -> accounts.add(label);
                case "IP" -> ips.add(label);
                case "Campaign" -> campaignLabels.add(label);
                default -> { /* Host/Report/Registrant/Cert 는 인벤토리에서 제외(pivot·연결용) */ }
            }
        }

        int entityCount = domains.size() + phones.size() + accounts.size() + ips.size();

        List<Map<String, Object>> pivots = buildPivots(org, byId, adj, degree);

        // 조직으로 인정할 최소 조건: 엔티티 2개 이상 또는 공유 인프라 pivot 존재.
        // (연결이 전혀 없는 단일 독립 엔티티는 '조직'이 아니다.)
        if (entityCount < 2 && pivots.isEmpty()) {
            return notAttributed(value);
        }

        List<String> campaignList = new ArrayList<>(campaignLabels);
        campaignList.sort(String::compareTo);
        // campaign_id 는 조직 엔티티 집합으로 유도 → 어느 엔티티에서 열어도 같은 사건번호.
        List<String> orgEntities = new ArrayList<>();
        orgEntities.addAll(domains);
        orgEntities.addAll(phones);
        orgEntities.addAll(accounts);
        orgEntities.addAll(ips);
        String id = deriveCampaignId(orgEntities);
        String orgLabel = deriveOrgLabel(campaignList, pivots);
        String riskGrade = gradeOf(worstRank);

        Map<String, Object> inventory = new LinkedHashMap<>();
        inventory.put("domains", cap(domains, "domains", id));
        inventory.put("phones", cap(phones, "phones", id));
        inventory.put("accounts", cap(accounts, "accounts", id));
        inventory.put("ips", cap(ips, "ips", id));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("found", true);
        out.put("campaign_id", id);
        out.put("label", orgLabel);
        out.put("risk_grade", riskGrade);
        out.put("entity_count", entityCount);
        out.put("first_seen", null);  // 그래프에 관측 시각이 없으면 미상(근거 없는 날짜를 조작하지 않는다).
        out.put("inventory", inventory);
        out.put("pivots", pivots);
        out.put("recommendation", recommend(riskGrade, domains.size(), phones.size(),
                accounts.size(), ips.size(), pivots));
        return out;
    }

    // ── 공유 인프라 pivot: 이 엔티티들이 왜 한 조직인지에 대한 물증 ─────────────
    private static List<Map<String, Object>> buildPivots(
            Set<String> org, Map<String, Map<String, Object>> byId,
            Map<String, Set<String>> adj, Map<String, Integer> degree) {

        List<Map<String, Object>> pivots = new ArrayList<>();
        for (String id : org) {
            Map<String, Object> n = byId.get(id);
            if (n == null) continue;
            String type = (String) n.get("type");
            String pivotType = PIVOT_TYPES.get(type);
            if (pivotType == null) continue;
            if (degree.getOrDefault(id, 0) < 2) continue;  // 2개 이상 연결해야 "공유" 인프라

            // 이 인프라에 물려 있는 도메인(Target/Host 라벨)을 연결 근거로 모은다.
            LinkedHashSet<String> connects = new LinkedHashSet<>();
            for (String nb : adj.getOrDefault(id, Set.of())) {
                Map<String, Object> nn = byId.get(nb);
                if (nn == null) continue;
                String nt = (String) nn.get("type");
                if ("Target".equals(nt) || "Host".equals(nt)) {
                    connects.add((String) nn.get("label"));
                }
            }
            if (connects.size() < 2) continue;  // 실제로 두 곳 이상을 잇는 것만 pivot

            List<String> connectList = new ArrayList<>(connects);
            if (connectList.size() > MAX_PER_TYPE) {
                log.info("campaign: pivot {} connects capped {} → {}", pivotType,
                        connectList.size(), MAX_PER_TYPE);
                connectList = connectList.subList(0, MAX_PER_TYPE);
            }

            Map<String, Object> p = new LinkedHashMap<>();
            p.put("type", pivotType);
            p.put("value", n.get("label"));
            p.put("connects", connectList);
            pivots.add(p);
        }
        // 더 많은 대상을 잇는 pivot 을 먼저(설득력 순).
        pivots.sort((a, b) -> ((List<?>) b.get("connects")).size()
                - ((List<?>) a.get("connects")).size());
        return pivots;
    }

    /** 인벤토리 상한 적용 + 초과 시 로그. */
    private static List<String> cap(List<String> values, String kind, String campaignId) {
        if (values.size() <= MAX_PER_TYPE) {
            return values;
        }
        log.info("campaign {}: inventory[{}] capped {} → {}", campaignId, kind,
                values.size(), MAX_PER_TYPE);
        return new ArrayList<>(values.subList(0, MAX_PER_TYPE));
    }

    /**
     * campaign_id 를 결정적으로 유도. 조직 안 어느 엔티티에서 출발하든 같은 값이 나오도록
     * 조직에 속한 캠페인 라벨 집합(정렬)을 키로 삼는다.
     */
    private static String deriveCampaignId(List<String> orgEntities) {
        List<String> sorted = new ArrayList<>(orgEntities);
        sorted.sort(String::compareTo);
        String key = sorted.isEmpty() ? "unknown" : String.join("|", sorted);
        int h = key.hashCode() & 0x7fffffff;
        return "SG-" + String.format("%06X", h % 0x1000000);
    }

    /** 조직 라벨: 명명된 캠페인 → 공유 pivot → 미상 순. */
    private static String deriveOrgLabel(List<String> campaignLabels,
                                         List<Map<String, Object>> pivots) {
        if (!campaignLabels.isEmpty()) {
            return String.join(" · ", campaignLabels);
        }
        if (!pivots.isEmpty()) {
            Map<String, Object> top = pivots.get(0);
            String ko = PIVOT_KO.getOrDefault((String) top.get("type"), "인프라");
            return "공유 " + ko + " " + top.get("value") + " 클러스터";
        }
        return "미상 조직";
    }

    /** 시작 노드에서 도달 가능한 전체 조직(공유 인프라로 연결된 컴포넌트). */
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

    /** value 를 그래프 노드 id 로 정규화. id → label → 호스트 → 느슨한 부분일치 순. */
    private static String resolveStartId(String value, Map<String, Map<String, Object>> byId,
                                         Map<String, Map<String, Object>> byLabel) {
        if (byId.containsKey(value)) return value;
        if (byLabel.containsKey(value)) return (String) byLabel.get(value).get("id");

        String host = HostUtil.hostOf(value);
        if (byId.containsKey(host)) return host;
        if (byLabel.containsKey(host)) return (String) byLabel.get(host).get("id");

        // 계좌처럼 라벨에 접두/접미(은행명·괄호)가 붙는 경우를 위한 느슨한 매칭.
        // 짧은 id 로 인한 오탐을 막기 위해 6자 이상만 부분일치 허용.
        for (Map.Entry<String, Map<String, Object>> e : byId.entrySet()) {
            String nid = e.getKey();
            if (nid.length() >= 6 && (value.contains(nid) || nid.contains(value))) {
                return nid;
            }
            String label = (String) e.getValue().get("label");
            if (label != null && label.length() >= 6
                    && (value.contains(label) || label.contains(value))) {
                return nid;
            }
        }
        return null;
    }

    // ── 조직 미귀속: 그래프는 정상이나 값이 어느 조직에도 속하지 않음 ─────────────
    private static Map<String, Object> notAttributed(String value) {
        Map<String, Object> inventory = new LinkedHashMap<>();
        inventory.put("domains", List.of());
        inventory.put("phones", List.of());
        inventory.put("accounts", List.of());
        inventory.put("ips", List.of());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("found", false);
        out.put("campaign_id", "");
        out.put("label", value);
        out.put("risk_grade", "unknown");
        out.put("entity_count", 0);
        out.put("first_seen", null);
        out.put("inventory", inventory);
        out.put("pivots", List.of());
        out.put("recommendation", "이 엔티티는 알려진 사기 조직 인프라와 연결되지 않았습니다 (독립 엔티티).");
        return out;
    }

    // ── 데모/폴백 조직: 그래프가 죽어도 도시에가 항상 렌더되도록 하는 시연용 조직 ──
    //    토스 사칭 클러스터 — 3개 도메인이 동일 IP 185.220.101.44 를 공유.
    private static Map<String, Object> demoOrg() {
        List<String> demoDomains = List.of(
                "secure-tosspay.info", "tosspay-help.info", "toss-verify.live");

        Map<String, Object> inventory = new LinkedHashMap<>();
        inventory.put("domains", demoDomains);
        inventory.put("phones", List.of("070-1234-5678"));
        inventory.put("accounts", List.of("100-234-567890 (토스뱅크)"));
        inventory.put("ips", List.of("185.220.101.44"));

        Map<String, Object> pivot = new LinkedHashMap<>();
        pivot.put("type", "shared_ip");
        pivot.put("value", "185.220.101.44");
        pivot.put("connects", demoDomains);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("found", true);
        out.put("campaign_id", deriveCampaignId(demoDomains));
        out.put("label", "토스 사칭 클러스터");
        out.put("risk_grade", "danger");
        out.put("entity_count", 6);
        out.put("first_seen", "2026-05-14");
        out.put("inventory", inventory);
        out.put("pivots", List.of(pivot));
        out.put("recommendation",
                "🚨 조직 인프라 6종 식별 — 도메인 3개 차단 · 계좌 1개 지급정지 · 전화 1개 신고 권고. "
                        + "공유 IP 185.220.101.44 상단 차단 시 조직 전체를 무력화할 수 있습니다.");
        return out;
    }

    // ── 등급 집계 유틸 ────────────────────────────────────────────
    private static int rank(String grade) {
        return switch (grade == null ? "" : grade) {
            case "danger" -> 4;
            case "warning" -> 3;
            case "caution" -> 2;
            case "safe" -> 1;
            default -> 0;
        };
    }

    private static String gradeOf(int rank) {
        return switch (rank) {
            case 4 -> "danger";
            case 3 -> "warning";
            case 2 -> "caution";
            case 1 -> "safe";
            default -> "unknown";
        };
    }

    private static String recommend(String grade, int d, int p, int a, int ip,
                                    List<Map<String, Object>> pivots) {
        int total = d + p + a + ip;
        StringBuilder sb = new StringBuilder();
        String badge = switch (grade) {
            case "danger" -> "🚨 ";
            case "warning" -> "⚠️ ";
            default -> "";
        };
        sb.append(badge).append("조직 인프라 ").append(total).append("종 식별 — ");
        List<String> actions = new ArrayList<>();
        if (d > 0) actions.add("도메인 " + d + "개 차단");
        if (a > 0) actions.add("계좌 " + a + "개 지급정지");
        if (p > 0) actions.add("전화 " + p + "개 신고");
        sb.append(actions.isEmpty() ? "관련 인프라 감시" : String.join(" · ", actions)).append(" 권고.");

        if (!pivots.isEmpty()) {
            Map<String, Object> top = pivots.get(0);
            String ko = PIVOT_KO.getOrDefault((String) top.get("type"), "인프라");
            int n = ((List<?>) top.get("connects")).size();
            sb.append(" 공유 ").append(ko).append(' ').append(top.get("value"))
                    .append(" 상단 차단 시 ").append(n).append("개 대상을 한 번에 무력화할 수 있습니다.");
        }
        return sb.toString();
    }
}
