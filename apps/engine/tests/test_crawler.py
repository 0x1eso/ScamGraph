"""규칙 엔진(app.crawler) 불변식 테스트 — 네트워크 없이 결정론적으로 동작.

점수는 규칙 가중치가 조정되면 흔들리므로 정확한 숫자에 의존하지 않는다.
대신 안정적인 *불변식*(등급 경계, 화이트리스트 오탐 방지, 분류, 편집거리,
점수 범위, 수집 신호가 점수를 *높인다*는 방향성)을 검증한다.
"""
import pytest

from app.crawler import (
    _grade,
    _host_of,
    _is_allowlisted,
    _levenshtein,
    classify_target,
    quick_assess,
    score_enrichment,
)

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
