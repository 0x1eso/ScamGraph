package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * GuidanceController 단위 테스트 — Spring 컨텍스트를 띄우지 않는 순수 POJO 테스트.
 * 정확한 문구가 아니라 사후 대응 가이드의 *불변식*(헤드라인 존재, 단계가 비어있지 않고
 * 각 단계에 제목이 있음, 유형별 핵심 신고 채널 포함)을 검증한다.
 */
class GuidanceControllerTest {

    private final GuidanceController controller = new GuidanceController();

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> steps(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("steps");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> hotlines(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("hotlines");
    }

    /** 단계 전체(제목·설명·액션)를 하나의 문자열로 평탄화 — 채널 언급 검사에 사용. */
    private static String flatten(List<Map<String, Object>> steps) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> s : steps) {
            sb.append(s.getOrDefault("title", "")).append(' ');
            sb.append(s.getOrDefault("detail", "")).append(' ');
            Object action = s.get("action");
            if (action instanceof Map<?, ?> a) {
                sb.append(a.get("label")).append(' ');
                sb.append(a.get("href")).append(' ');
            }
        }
        return sb.toString();
    }

    private static void assertEveryStepHasTitle(List<Map<String, Object>> steps) {
        assertFalse(steps.isEmpty(), "steps must be non-empty");
        for (Map<String, Object> s : steps) {
            Object title = s.get("title");
            assertNotNull(title, "each step must have a title");
            assertFalse(title.toString().isBlank(), "step title must not be blank");
        }
    }

    @Test
    @DisplayName("phone/danger: 헤드라인·단계·긴급 핫라인(112, 1332) 포함")
    void phoneDanger() {
        Map<String, Object> out = controller.guidance("phone", "danger");

        assertNotNull(out.get("headline"));
        assertFalse(out.get("headline").toString().isBlank());
        assertEquals(Boolean.TRUE, out.get("urgent"));

        assertEveryStepHasTitle(steps(out));

        List<String> contacts = hotlines(out).stream()
                .map(h -> String.valueOf(h.get("contact")))
                .toList();
        assertTrue(contacts.contains("tel:112"), "hotlines must include 경찰 112");
        assertTrue(contacts.contains("tel:1332"), "hotlines must include 금융감독원 1332");
    }

    @Test
    @DisplayName("url/danger: 단계가 KISA/118 피싱 신고 채널을 언급")
    void urlDanger() {
        Map<String, Object> out = controller.guidance("url", "danger");

        assertNotNull(out.get("headline"));
        List<Map<String, Object>> steps = steps(out);
        assertEveryStepHasTitle(steps);

        String flat = flatten(steps);
        assertTrue(flat.contains("KISA"), "url guidance should mention KISA");
        assertTrue(flat.contains("118"), "url guidance should mention 118");
    }

    @Test
    @DisplayName("account/warning: 단계가 비어있지 않고 urgent=true")
    void accountWarning() {
        Map<String, Object> out = controller.guidance("account", "warning");

        assertEveryStepHasTitle(steps(out));
        assertEquals(Boolean.TRUE, out.get("urgent"));
        // 경고 등급에서도 지급정지(1332) 채널은 항상 노출되어야 한다.
        List<String> contacts = hotlines(out).stream()
                .map(h -> String.valueOf(h.get("contact")))
                .toList();
        assertTrue(contacts.contains("tel:1332"));
    }

    @Test
    @DisplayName("safe 등급은 urgent=false")
    void safeNotUrgent() {
        Map<String, Object> out = controller.guidance("url", "safe");
        assertEquals(Boolean.FALSE, out.get("urgent"));
        assertNotNull(out.get("headline"));
    }
}
