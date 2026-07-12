package io.scamgraph.gateway;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * ReportDefense 단위 테스트 — DB 없이 검증 가능한 방어 로직(신고자 해시·allowlist·승격 단계·
 * blocklist 자격·DB 다운 폴백)을 순수 POJO 로 검증한다. JdbcTemplate 은 null 로 주입하고,
 * DB 접근이 필요한 경로는 데모 세이프 폴백(happy-path 유지)이 동작함을 확인한다.
 */
class ReportDefenseTest {

    /** jdbc 를 만지지 않는 메서드만 테스트하거나, 만지면 폴백을 확인한다 → null 주입으로 충분. */
    private final ReportDefense defense = new ReportDefense(null);

    @Nested
    @DisplayName("isAllowlisted — 정상 도메인 보호(오탐/경쟁사 공격 방어)")
    class Allowlist {

        @ParameterizedTest
        @ValueSource(strings = {
                "naver.com", "kakao.com", "toss.im", "gov.kr", "police.go.kr",
                "https://www.naver.com/login", "mail.google.com", "sub.kakaobank.com"
        })
        @DisplayName("allowlist 도메인과 그 하위 도메인은 true")
        void allowlisted(String target) {
            assertTrue(defense.isAllowlisted(target), target + " should be allowlisted");
        }

        @ParameterizedTest
        @ValueSource(strings = {
                "naver.com.evil.com",   // 접미 위장 — 하위 도메인이 아님
                "evil-naver.com",       // 접두 위장
                "phishing.xyz",
                "secure-tosspay.info",
                "070-1234-5678",        // 전화(호스트 아님)
                "110-441-882201"        // 계좌
        })
        @DisplayName("위장/무관 도메인·전화·계좌는 false")
        void notAllowlisted(String target) {
            assertFalse(defense.isAllowlisted(target), target + " must NOT be allowlisted");
        }

        @Test
        @DisplayName("빈 호스트는 false")
        void emptyIsFalse() {
            assertFalse(defense.isAllowlisted(""));
            assertFalse(defense.isAllowlisted(null));
        }
    }

    @Nested
    @DisplayName("escalationStage — 승격 단계 라벨(§3.1)")
    class EscalationStage {

        @Test
        @DisplayName("allowlist 는 신고 수와 무관하게 항상 review_queue")
        void allowlistAlwaysReviewQueue() {
            assertEquals("review_queue", defense.escalationStage(0, true));
            assertEquals("review_queue", defense.escalationStage(999, true));
        }

        @Test
        @DisplayName("비-allowlist: 독립 신고 3건 이상이면 multi_report, 미만이면 stored")
        void multiReportThreshold() {
            assertEquals("stored", defense.escalationStage(0, false));
            assertEquals("stored", defense.escalationStage(2, false));
            assertEquals("multi_report", defense.escalationStage(3, false));
            assertEquals("multi_report", defense.escalationStage(50, false));
        }
    }

    @Nested
    @DisplayName("blockEscalationEligible — ⑤ 전체 blocklist 자격(강한 신호 AND 독립 다수)")
    class BlockEscalation {

        @Test
        @DisplayName("독립 3건 이상 그리고 강한 기술신호일 때만 true")
        void eligibleOnlyWithBoth() {
            assertTrue(defense.blockEscalationEligible(3, true));
            assertTrue(defense.blockEscalationEligible(10, true));
            assertFalse(defense.blockEscalationEligible(2, true));   // 신고 부족
            assertFalse(defense.blockEscalationEligible(3, false));  // 신호 없음
            assertFalse(defense.blockEscalationEligible(0, false));
        }
    }

    @Nested
    @DisplayName("reporterHash — 원시 IP 미저장, 결정적 익명 해시")
    class ReporterHash {

        @Test
        @DisplayName("null 요청 → anon 기반 결정적 64-hex 해시")
        void nullRequestDeterministic() {
            String h1 = defense.reporterHash(null);
            String h2 = defense.reporterHash(null);
            assertEquals(h1, h2, "same input must yield same hash");
            assertHex64(h1);
        }

        @Test
        @DisplayName("같은 식별자 → 같은 해시, 다른 식별자 → 다른 해시")
        void distinctIdentitiesDiffer() {
            String a = defense.reporterHash(reqWithFirstIp("1.2.3.4"));
            String a2 = defense.reporterHash(reqWithFirstIp("1.2.3.4"));
            String b = defense.reporterHash(reqWithFirstIp("5.6.7.8"));
            assertEquals(a, a2);
            assertNotEquals(a, b);
            assertHex64(a);
            assertHex64(b);
        }

        @Test
        @DisplayName("원시 IP 문자열이 해시에 그대로 노출되지 않는다")
        void rawIpNotLeaked() {
            String ip = "203.0.113.77";
            String h = defense.reporterHash(reqWithFirstIp(ip));
            assertFalse(h.contains(ip), "raw IP must not appear in the hash");
        }

        private HttpServletRequest reqWithFirstIp(String ip) {
            HttpServletRequest req = mock(HttpServletRequest.class);
            when(req.getHeader("X-Forwarded-First-IP")).thenReturn(ip);
            return req;
        }

        private void assertHex64(String h) {
            assertTrue(h.matches("[0-9a-f]{64}"), "expected 64 lowercase hex chars, got: " + h);
        }
    }

    @Nested
    @DisplayName("evaluate — DB 다운 시 데모 세이프 폴백(happy-path 유지)")
    class EvaluateFallback {

        @Test
        @DisplayName("비-allowlist 대상: 폴백에서도 접수·그래프 반영을 막지 않는다")
        void nonAllowlistFallback() {
            ReportDefense.Verdict v = defense.evaluate("phishing-site.xyz", "hash-abc");
            assertEquals("reported", v.status());
            assertTrue(v.escalateToGraph(), "non-allowlist must still escalate when DB is down");
            assertFalse(v.allowlisted());
            assertEquals(1, v.independentCount());
            assertEquals("stored", v.escalation());
        }

        @Test
        @DisplayName("allowlist 대상: 폴백에서도 자동 승격하지 않고 검토 큐로만")
        void allowlistFallback() {
            ReportDefense.Verdict v = defense.evaluate("naver.com", "hash-abc");
            assertEquals("review", v.status());
            assertFalse(v.escalateToGraph(), "allowlist must never auto-escalate");
            assertTrue(v.allowlisted());
            assertEquals("review_queue", v.escalation());
        }
    }
}
