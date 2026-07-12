package io.scamgraph.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * HostUtil.hostOf 단위 테스트 — URL→호스트 정규화 유틸(세 컨트롤러 공용)의 불변식.
 * scheme·userinfo·path·port 를 벗겨 소문자 호스트만 남기고, URL 이 아닌 값(전화/계좌)은
 * 트림·소문자만 적용해 원본을 보존한다.
 */
class HostUtilTest {

    @ParameterizedTest(name = "[{index}] \"{0}\" → \"{1}\"")
    @CsvSource({
            // 원본, 기대 호스트
            "'example.com', 'example.com'",
            "'EXAMPLE.COM', 'example.com'",
            "'http://example.com', 'example.com'",
            "'https://example.com', 'example.com'",
            "'https://example.com/path/to/page', 'example.com'",
            "'https://example.com:8443/path', 'example.com'",
            "'https://example.com:8443', 'example.com'",
            "'https://user@example.com/x', 'example.com'",
            "'https://user:pass@example.com/x', 'example.com'",
            "'  https://Example.COM/Path  ', 'example.com'",
            "'ftp://files.example.org/a', 'files.example.org'",
            "'sub.domain.example.co.kr', 'sub.domain.example.co.kr'",
            "'HTTPS://SUB.NAVER.COM/LOGIN', 'sub.naver.com'",
    })
    @DisplayName("URL 계열 입력은 소문자 호스트만 남긴다")
    void urlLikeInputs(String input, String expected) {
        assertEquals(expected, HostUtil.hostOf(input));
    }

    @Test
    @DisplayName("null 은 빈 문자열로")
    void nullBecomesEmpty() {
        assertEquals("", HostUtil.hostOf(null));
    }

    @Test
    @DisplayName("빈/공백 입력은 트림 후 빈 문자열")
    void blankBecomesEmpty() {
        assertEquals("", HostUtil.hostOf(""));
        assertEquals("", HostUtil.hostOf("   "));
    }

    @Test
    @DisplayName("전화번호는 스킴이 없으므로 트림·소문자만 적용해 보존")
    void phoneIsPreserved() {
        assertEquals("070-1234-5678", HostUtil.hostOf("070-1234-5678"));
        assertEquals("070-1234-5678", HostUtil.hostOf("  070-1234-5678 "));
    }

    @Test
    @DisplayName("계좌번호(콜론 없음)는 그대로 보존")
    void accountIsPreserved() {
        assertEquals("110-441-882201", HostUtil.hostOf("110-441-882201"));
    }

    @Test
    @DisplayName("결정적: 같은 입력은 항상 같은 출력")
    void deterministic() {
        String in = "https://User@Secure-TossPay.INFO:443/verify?x=1";
        assertEquals(HostUtil.hostOf(in), HostUtil.hostOf(in));
        assertEquals("secure-tosspay.info", HostUtil.hostOf(in));
    }
}
