package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * AccuracyController 단위 테스트 — 엔진 미가동 시 시드 정확도 스냅샷의 불변식을 검증한다.
 * 엔진 URL 을 즉시 거절되는 루프백 포트로 두어(연결 거부) 폴백 경로를 결정적으로 태운다.
 */
class AccuracyControllerTest {

    /** 즉시 연결 거부 → 엔진 호출 실패 → 시드 폴백. (네트워크 지연 없음) */
    private final AccuracyController controller =
            new AccuracyController(RestClient.builder(), "http://127.0.0.1:1");

    private double num(Map<String, Object> m, String key) {
        return ((Number) m.get(key)).doubleValue();
    }

    @Test
    @DisplayName("엔진 미가동 → 시드 정확도 스냅샷 반환")
    void seedSnapshotWhenEngineDown() {
        Map<String, Object> out = controller.accuracy();
        assertNotNull(out.get("accuracy"));
        assertEquals(0.964, num(out, "accuracy"), 1e-9);
        assertEquals(1.0, num(out, "precision"), 1e-9);
        assertEquals(0.929, num(out, "recall"), 1e-9);
    }

    @Test
    @DisplayName("불변식: 정확도·정밀도·재현율·F1 은 [0,1] 범위")
    void metricsWithinUnitInterval() {
        Map<String, Object> out = controller.accuracy();
        for (String k : new String[]{"accuracy", "precision", "recall", "f1"}) {
            double v = num(out, k);
            assertTrue(v >= 0.0 && v <= 1.0, k + " must be within [0,1], was " + v);
        }
    }

    @Test
    @DisplayName("불변식: samples = scam_samples + legit_samples, confusion 4칸 존재")
    void sampleAndConfusionConsistency() {
        Map<String, Object> out = controller.accuracy();
        long samples = ((Number) out.get("samples")).longValue();
        long scam = ((Number) out.get("scam_samples")).longValue();
        long legit = ((Number) out.get("legit_samples")).longValue();
        assertEquals(samples, scam + legit);

        assertTrue(out.get("confusion") instanceof Map<?, ?>);
        Map<?, ?> confusion = (Map<?, ?>) out.get("confusion");
        for (String cell : new String[]{"tp", "fp", "tn", "fn"}) {
            assertNotNull(confusion.get(cell), "confusion must include " + cell);
        }
    }
}
