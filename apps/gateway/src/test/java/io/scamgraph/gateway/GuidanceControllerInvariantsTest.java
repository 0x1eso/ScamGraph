package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * GuidanceController 불변식 — 모든 (kind, grade) 조합에서 구조가 무너지지 않음을 매트릭스로 검증한다.
 * 정확한 문구가 아니라 "항상 헤드라인이 있고, 각 단계에 제목이 있으며, 핵심 신고 채널이 노출된다"를 본다.
 */
class GuidanceControllerInvariantsTest {

    private final GuidanceController controller = new GuidanceController();

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> steps(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("steps");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> hotlines(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("hotlines");
    }

    @ParameterizedTest(name = "kind={0}, grade={1}")
    @CsvSource({
            "url, danger", "url, warning", "url, caution", "url, safe",
            "phone, danger", "phone, warning", "phone, caution", "phone, safe",
            "account, danger", "account, warning", "account, caution", "account, safe",
            "sms, danger",   // 알 수 없는 kind → 기본(url) 분기
    })
    @DisplayName("모든 (kind,grade) 조합: 헤드라인·단계·핫라인 구조 불변식 유지")
    void structuralInvariants(String kind, String grade) {
        Map<String, Object> out = controller.guidance(kind, grade);

        assertNotNull(out.get("headline"));
        assertFalse(out.get("headline").toString().isBlank());

        List<Map<String, Object>> steps = steps(out);
        assertFalse(steps.isEmpty(), "steps must never be empty");
        for (Map<String, Object> s : steps) {
            Object title = s.get("title");
            assertNotNull(title);
            assertFalse(title.toString().isBlank());
        }

        // 핵심 신고 채널은 등급/유형과 무관하게 항상 노출(112·1332·118)
        List<String> contacts = hotlines(out).stream()
                .map(h -> String.valueOf(h.get("contact")))
                .toList();
        assertTrue(contacts.contains("tel:112"));
        assertTrue(contacts.contains("tel:1332"));
        assertTrue(contacts.contains("tel:118"));

        // urgent 는 danger/warning 에서만 true
        boolean expectedUrgent = "danger".equals(grade) || "warning".equals(grade);
        assertEquals(expectedUrgent, out.get("urgent"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"url", "phone", "account", "sms"})
    @DisplayName("caution/safe 등급은 urgent=false")
    void nonUrgentGrades(String kind) {
        assertEquals(Boolean.FALSE, controller.guidance(kind, "caution").get("urgent"));
        assertEquals(Boolean.FALSE, controller.guidance(kind, "safe").get("urgent"));
    }
}
