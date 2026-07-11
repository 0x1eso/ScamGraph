"""규칙 엔진(app.crawler) 불변식 테스트 — 네트워크 없이 결정론적으로 동작.

점수는 규칙 가중치가 조정되면 흔들리므로 정확한 숫자에 의존하지 않는다.
대신 안정적인 *불변식*(등급 경계, 화이트리스트 오탐 방지, 분류, 편집거리,
점수 범위, 수집 신호가 점수를 *높인다*는 방향성)을 검증한다.
"""
import pytest

from app.crawler import (
    _grade,
    _has_confusable,
    _host_of,
    _is_allowlisted,
    _levenshtein,
    _registrable,
    classify_target,
    quick_assess,
    score_enrichment,
)


def _rules(target: str) -> set[str]:
    return {r["rule"] for r in quick_assess(target)["reasons"]}

VALID_GRADES = {"safe", "caution", "warning", "danger"}


# ---------------------------------------------------------------------------
# quick_assess — 화이트리스트(오탐 방지)
# ---------------------------------------------------------------------------
def test_allowlisted_root_domain_is_safe_with_verified_reason():
    result = quick_assess("naver.com")
    assert result["grade"] == "safe"
    assert result["risk_score"] == 0
    assert any(r["rule"] == "verified_domain" for r in result["reasons"])


def test_allowlisted_subdomain_is_safe_no_false_positive():
    # 정상 브랜드의 하위 도메인은 규칙(브랜드명 포함)에 걸려도 안전이어야 한다.
    result = quick_assess("support.google.com")
    assert result["grade"] == "safe"
    assert any(r["rule"] == "verified_domain" for r in result["reasons"])


@pytest.mark.parametrize(
    "domain",
    ["naver.com", "support.google.com", "www.kbstar.com", "login.shinhan.com"],
)
def test_allowlisted_variants_never_flagged(domain):
    assert quick_assess(domain)["grade"] == "safe"


# ---------------------------------------------------------------------------
# quick_assess — 악성 URL 판정 (danger)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "domain",
    [
        "shinhan-otp.xyz",           # 브랜드 사칭 + OTP 키워드 + 위험 TLD
        "naver-secure-login.top",    # 브랜드 사칭 + 피싱 키워드 + 위험 TLD (화이트리스트 아님)
    ],
)
def test_malicious_typosquat_domains_are_danger(domain):
    result = quick_assess(domain)
    assert result["grade"] == "danger"
    assert result["risk_score"] >= 70


def test_typosquat_is_not_allowlisted():
    # naver 사칭 도메인은 절대 화이트리스트로 안전 처리되면 안 된다.
    result = quick_assess("naver-secure-login.top")
    assert not any(r["rule"] == "verified_domain" for r in result["reasons"])


# ---------------------------------------------------------------------------
# classify_target — 입력 분류
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "target,expected",
    [
        ("naver.com", "url"),
        ("http://example-shop.top/login", "url"),
        ("010-1234-5678", "phone"),      # 11자리
        ("02-123-4567", "phone"),        # 9자리
        ("123-456-789012", "account"),   # 12자리
        ("1234567890123456", "account"), # 16자리
    ],
)
def test_classify_target(target, expected):
    assert classify_target(target) == expected


# ---------------------------------------------------------------------------
# _levenshtein — 편집 거리 (타이포스쿼팅 근거)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "a,b,expected",
    [
        ("kbstat", "kbstar", 1),
        ("a", "a", 0),
        ("", "", 0),
        ("", "abc", 3),
        ("abc", "", 3),
        ("kitten", "sitting", 3),
        ("naver", "naver", 0),
    ],
)
def test_levenshtein(a, b, expected):
    assert _levenshtein(a, b) == expected


def test_levenshtein_symmetric():
    assert _levenshtein("kbstar", "kbstat") == _levenshtein("kbstat", "kbstar")


# ---------------------------------------------------------------------------
# _is_allowlisted / _host_of
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "host,expected",
    [
        ("naver.com", True),
        ("support.google.com", True),   # 하위 도메인도 화이트리스트
        ("naver-secure-login.top", False),
        ("evil-naver.com.attacker.io", False),  # 접미사 위장은 통과 못함
        ("", False),
    ],
)
def test_is_allowlisted(host, expected):
    assert _is_allowlisted(host) is expected


def test_host_of_extracts_hostname():
    assert _host_of("naver.com") == "naver.com"
    assert _host_of("https://support.google.com/path") == "support.google.com"
    assert _host_of("HTTP://Example.COM") == "example.com"


# ---------------------------------------------------------------------------
# quick_assess — 반환 계약(불변식): 점수 범위 · 등급 집합
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "target",
    [
        "naver.com",
        "support.google.com",
        "shinhan-otp.xyz",
        "naver-secure-login.top",
        "cj-delivery-check.top",
        "http://192.168.0.1/login",
        "example-shop.top",
        "010-1234-5678",
        "070-1234-5678",
        "0082-10-1234-5678",
        "123-456-789012",
        "https://a.b.c.d.e.example.com/verify",
    ],
)
def test_quick_assess_contract(target):
    result = quick_assess(target)
    assert set(result.keys()) >= {"kind", "risk_score", "grade", "reasons"}
    assert 0 <= result["risk_score"] <= 100
    assert result["grade"] in VALID_GRADES
    assert isinstance(result["reasons"], list)


def test_grade_boundaries_match_score():
    # _grade 경계가 문서화된 임계값(70/35/15)과 일치하는지 확인.
    assert _grade(0) == "safe"
    assert _grade(14) == "safe"
    assert _grade(15) == "caution"
    assert _grade(34) == "caution"
    assert _grade(35) == "warning"
    assert _grade(69) == "warning"
    assert _grade(70) == "danger"
    assert _grade(100) == "danger"


# ---------------------------------------------------------------------------
# score_enrichment — 수집 신호가 점수를 *높이고* 근거를 추가한다
# ---------------------------------------------------------------------------
def test_score_enrichment_credential_and_otp_form_raise_risk():
    result = quick_assess("example-shop.top")
    before = result["risk_score"]
    assert before < 100  # 상한에 걸려 있으면 증가를 관찰할 수 없으므로 전제 확인

    # 네트워크 없이 수집 결과를 손으로 구성 (crawl_and_enrich 미사용).
    result["enrichment"] = {"content": {"has_password_input": True, "has_otp": True}}
    scored = score_enrichment(result)

    assert scored["risk_score"] > before
    assert scored["risk_score"] <= 100
    assert scored["grade"] in VALID_GRADES
    rules = {r["rule"] for r in scored["reasons"]}
    assert "credential_form" in rules
    assert "otp_form" in rules


def test_score_enrichment_no_signals_leaves_score_unchanged():
    result = quick_assess("example-shop.top")
    before = result["risk_score"]
    result["enrichment"] = {}  # 수집 신호 없음
    scored = score_enrichment(result)
    assert scored["risk_score"] == before


def test_score_enrichment_is_capped_at_100():
    result = quick_assess("shinhan-otp.xyz")  # 이미 danger, 고점수
    result["enrichment"] = {
        "content": {"has_password_input": True, "has_otp": True, "external_form": True},
        "redirects": ["a", "b", "c"],
        "tls": {"error": "cert_verify_failed"},
    }
    scored = score_enrichment(result)
    assert scored["risk_score"] <= 100
    assert scored["grade"] == "danger"


# ---------------------------------------------------------------------------
# _registrable — tldextract 기반 정확한 eTLD+1 (멀티파트 TLD)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "host,expected_domain,expected_suffix",
    [
        ("naver.com", "naver", "com"),
        ("ibk.co.kr", "ibk", "co.kr"),
        ("police.go.kr", "police", "go.kr"),
        ("shinhan.com.au", "shinhan", "com.au"),
        ("a.b.example.co.kr", "example", "co.kr"),
        ("account-verify.top", "account-verify", "top"),
    ],
)
def test_registrable_handles_multipart_tld(host, expected_domain, expected_suffix):
    sub, domain, suffix, registered = _registrable(host)
    assert domain == expected_domain
    assert suffix == expected_suffix
    assert registered == f"{expected_domain}.{expected_suffix}"


def test_registrable_subdomain_is_separated():
    sub, domain, suffix, registered = _registrable("a.b.example.co.kr")
    assert sub == "a.b"
    assert registered == "example.co.kr"


# ---------------------------------------------------------------------------
# 혼동문자(homoglyph) 확장 — 키릴/그리스/전각/퓨니코드 + 혼합 스크립트
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "domain",
    [
        "nаver.com",          # 키릴 а
        "gοοgle-verify.com",   # 그리스 ο (혼합 스크립트)
        "ｎaver-login.com",    # 전각 ｎ
        "xn--pple-43d.com",        # 퓨니코드 → аpple
    ],
)
def test_confusable_variants_detected_as_homoglyph(domain):
    assert _has_confusable(domain)
    res = quick_assess(domain)
    assert "homoglyph" in {r["rule"] for r in res["reasons"]}
    assert res["grade"] in {"caution", "warning", "danger"}


def test_homoglyph_of_allowlisted_is_not_safe():
    # 혼동문자로 위장한 정상 도메인은 원본 호스트로 검사하므로 화이트리스트를 통과 못한다.
    res = quick_assess("nаver.com")  # 키릴 а
    assert res["grade"] != "safe"
    assert not any(r["rule"] == "verified_domain" for r in res["reasons"])


def test_ascii_domain_has_no_confusable():
    assert not _has_confusable("naver-secure-login.top")


# ---------------------------------------------------------------------------
# 신규 URL 신호
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "target,rule",
    [
        ("bit.ly/3xR2p", "url_shortener"),
        ("han.gl/aB3xk", "url_shortener"),
        ("buly.kr/xY12z", "url_shortener"),
        ("http://3626568449/login", "obfuscated_ip"),        # decimal IP
        ("http://0x8b.0xdc.0x65.0x2c/x", "obfuscated_ip"),   # hex IP
        ("http://example.com:8081/login", "nonstandard_port"),
        ("http://a.example.com/%252e%252e/x", "double_encoding"),
        ("naver.com.account-verify.top", "brand_subdomain"),
    ],
)
def test_new_url_signals_emit_rule(target, rule):
    assert rule in _rules(target)


def test_brand_subdomain_not_double_counted_with_impersonation():
    # 브랜드가 등록 도메인에 있으면 impersonation, 서브도메인에만 있으면 brand_subdomain —
    # 둘이 동시에 나오지 않는다.
    rules = _rules("naver.com.account-verify.top")
    assert "brand_subdomain" in rules
    assert "brand_impersonation" not in rules


def test_dotted_ip_still_uses_ip_host_rule():
    assert "ip_host" in _rules("http://185.220.101.44/login")


# ---------------------------------------------------------------------------
# 타이포스쿼팅 정밀도 — 짧은 토큰/무관 단어 오탐 방지
# ---------------------------------------------------------------------------
def test_short_token_not_typosquatted():
    # 'han'(3자)은 'hana'(4자)의 타이포로 오탐되면 안 된다(단축 도메인 han.gl).
    assert "typosquatting" not in _rules("han.gl/abc")


def test_unrelated_word_not_typosquatted():
    # 'canva'는 어떤 브랜드의 타이포도 아니다(거리 2 짧은 브랜드 오탐 방지).
    res = quick_assess("canva.com")
    assert res["grade"] == "safe"


# ---------------------------------------------------------------------------
# 국제전화 — 선행 '+' 도 국제 발신으로 잡는다
# ---------------------------------------------------------------------------
def test_intl_phone_plus_prefix_flagged():
    res = quick_assess("+63-2-8888-1234")
    assert "intl_prefix" in {r["rule"] for r in res["reasons"]}
    assert res["grade"] in {"caution", "warning", "danger"}


# ---------------------------------------------------------------------------
# demo-safe: quick_assess 는 네트워크를 절대 호출하지 않는다
# ---------------------------------------------------------------------------
def test_quick_assess_is_network_free(monkeypatch):
    import socket

    def _boom(*args, **kwargs):
        raise AssertionError("quick_assess must not touch the network")

    monkeypatch.setattr(socket, "getaddrinfo", _boom)
    monkeypatch.setattr(socket, "create_connection", _boom)
    for target in ["naver.com", "shinhan-otp.xyz", "nаver.com",
                   "xn--pple-43d.com", "bit.ly/x", "ibk.co.kr"]:
        res = quick_assess(target)
        assert res["grade"] in VALID_GRADES
