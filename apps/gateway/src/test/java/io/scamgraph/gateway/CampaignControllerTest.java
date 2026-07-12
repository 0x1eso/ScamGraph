package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * CampaignController 단위 테스트 — 사건 파일(조직 복원) BFS·공유 pivot·결정적 사건번호를
 * 고정 그래프(시드/커스텀)에서 검증한다. GraphSource 는 익명 서브클래스로 주입.
 */
class CampaignControllerTest {

    private static GraphSource fixed(Map<String, Object> g) {
        return new GraphSource(null) {
            @Override
            public Map<String, Object> current() {
                return g;
            }
        };
    }

    private static CampaignController controllerFor(Map<String, Object> g) {
        return new CampaignController(fixed(g));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> inventory(Map<String, Object> out) {
        return (Map<String, Object>) out.get("inventory");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> pivots(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("pivots");
    }

    @SuppressWarnings("unchecked")
    private static List<String> invList(Map<String, Object> out, String key) {
        return (List<String>) inventory(out).get(key);
    }

    // ── 시드 그래프 기반: 공유 IP 로 두 캠페인이 하나의 조직으로 복원된다 ──────────

    @Test
    @DisplayName("시드: 공유 IP 로 두 캠페인이 하나의 조직(엔티티 9개)으로 복원")
    void seedResolvesFullOrganization() {
        Map<String, Object> out = controllerFor(SeedGraph.graph()).campaign("cj-delivery-check.top");

        assertEquals(Boolean.TRUE, out.get("found"));
        assertEquals("danger", out.get("risk_grade"));
        // 도메인4 + 전화2 + 계좌2 + IP1
        assertEquals(9, out.get("entity_count"));
        assertTrue(invList(out, "ips").contains("203.0.113.44"));
        assertEquals(4, invList(out, "domains").size());
        assertTrue(String.valueOf(out.get("campaign_id")).startsWith("SG-"));
    }

    @Test
    @DisplayName("시드: 최상위 pivot 은 4개 호스트를 잇는 공유 IP")
    void seedTopPivotIsSharedIp() {
        Map<String, Object> out = controllerFor(SeedGraph.graph()).campaign("shinhan-otp.xyz");

        List<Map<String, Object>> pv = pivots(out);
        assertFalse(pv.isEmpty(), "shared-IP pivot must be present");
        Map<String, Object> top = pv.get(0);
        assertEquals("shared_ip", top.get("type"));
        assertEquals("203.0.113.44", top.get("value"));
        assertEquals(4, ((List<?>) top.get("connects")).size());
    }

    @Test
    @DisplayName("시드: 같은 조직 내 어느 엔티티에서 열어도 사건번호(campaign_id)가 동일")
    void seedCampaignIdIsStableAcrossEntities() {
        CampaignController c = controllerFor(SeedGraph.graph());
        Object idFromDomain = c.campaign("cj-delivery-check.top").get("campaign_id");
        Object idFromAccount = c.campaign("110-441-882201").get("campaign_id");
        Object idFromPhone = c.campaign("070-8842-1120").get("campaign_id");
        assertEquals(idFromDomain, idFromAccount);
        assertEquals(idFromDomain, idFromPhone);
    }

    @Test
    @DisplayName("시드: URL(스킴/경로 포함)도 호스트 정규화로 같은 조직에 귀속")
    void seedUrlIsNormalizedToHost() {
        Map<String, Object> out = controllerFor(SeedGraph.graph())
                .campaign("https://cj-delivery-check.top/track?id=1");
        assertEquals(Boolean.TRUE, out.get("found"));
        assertEquals(9, out.get("entity_count"));
    }

    // ── 폴백/미귀속 경로 ───────────────────────────────────────────────

    @Test
    @DisplayName("빈 그래프 → 데모 조직 폴백(항상 렌더, found=true)")
    void emptyGraphFallsBackToDemoOrg() {
        Map<String, Object> out = controllerFor(Map.of("nodes", List.of(), "edges", List.of()))
                .campaign("anything");
        assertEquals(Boolean.TRUE, out.get("found"));
        assertEquals("토스 사칭 클러스터", out.get("label"));
        assertEquals(6, out.get("entity_count"));
        assertEquals("shared_ip", pivots(out).get(0).get("type"));
    }

    @Test
    @DisplayName("빈/공백 입력 → 데모 조직 폴백")
    void blankInputFallsBackToDemoOrg() {
        Map<String, Object> out = controllerFor(SeedGraph.graph()).campaign("   ");
        assertEquals(Boolean.TRUE, out.get("found"));
        assertEquals("토스 사칭 클러스터", out.get("label"));
    }

    @Test
    @DisplayName("그래프에 없는 값 → 미귀속(found=false, 독립 엔티티)")
    void unknownValueNotAttributed() {
        Map<String, Object> out = controllerFor(SeedGraph.graph()).campaign("zzzz-nomatch-entity");
        assertEquals(Boolean.FALSE, out.get("found"));
        assertEquals(0, out.get("entity_count"));
        assertTrue(pivots(out).isEmpty());
        assertEquals("", out.get("campaign_id"));
    }

    @Test
    @DisplayName("연결 없는 단일 엔티티(엔티티<2 · pivot 없음) → 미귀속")
    void isolatedSingleEntityNotAttributed() {
        Map<String, Object> onlyOne = Map.of(
                "nodes", List.of(SeedGraph.node("solo-domain.example", "solo-domain.example",
                        "Target", "danger", 80)),
                "edges", List.of());
        Map<String, Object> out = controllerFor(onlyOne).campaign("solo-domain.example");
        assertEquals(Boolean.FALSE, out.get("found"));
    }
}
