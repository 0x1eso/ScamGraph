"""contracts/rules.json 정본성 검증 — 코드(crawler/signals)와 계약이 일치하는지.

가중치 드리프트를 방지한다(mobile/extension 미러가 잘못된 점수를 계산하는 사고 예방).
contracts/rules.json 은 엔진 컨테이너에 마운트되지 않을 수 있으므로(레포 루트 밖),
파일이 없으면 스킵한다 — 레포 루트에서 실행하거나 contracts/ 를 마운트하면 활성화된다.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app import crawler
from app.signals.confusables import _CONFUSABLE_MAP
from app.signals.url_signals import SHORTENERS


def _load_rules() -> dict:
    for base in Path(__file__).resolve().parents:
        candidate = base / "contracts" / "rules.json"
        if candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    pytest.skip("contracts/rules.json 미마운트 — 레포 루트에서 실행 시 활성")


# crawler.py 가 실제 부여하는 url 규칙 가중치의 정적 스냅샷. 계약과 반드시 일치해야 한다.
_URL_WEIGHTS = {
    "verified_domain": 0, "homograph": 35, "homoglyph": 40, "brand_impersonation": 35,
    "typosquatting": 38, "brand_subdomain": 30, "suspicious_tld": 22, "digit_heavy": 10,
    "hyphen_heavy": 10, "ip_host": 30, "obfuscated_ip": 30, "url_shortener": 20,
    "at_symbol": 25, "double_encoding": 18, "nonstandard_port": 12, "deep_subdomain": 15,
    "long_url": 10, "no_tls": 8,
}


def test_grade_thresholds_match_code():
    th = _load_rules()["grade_thresholds"]
    assert crawler._grade(th["danger"]) == "danger"
    assert crawler._grade(th["warning"]) == "warning"
    assert crawler._grade(th["caution"]) == "caution"
    assert crawler._grade(th["danger"] - 1) == "warning"
    assert crawler._grade(th["caution"] - 1) == "safe"


def test_url_rule_weights_match_code():
    by_id = {r["id"]: r for r in _load_rules()["url_rules"]}
    for rid, weight in _URL_WEIGHTS.items():
        assert by_id[rid]["weight"] == weight, (rid, by_id[rid]["weight"], weight)
    assert by_id["phishing_keywords"]["weight"] == "16~30"


def test_homoglyph_dynamic_weight_documented():
    by_id = {r["id"]: r for r in _load_rules()["url_rules"]}
    hg = by_id["homoglyph"]
    assert hg["weight"] == 40 and hg["weight_targeted"] == 50


def test_list_constants_match_code():
    c = _load_rules()["constants"]
    assert c["known_brands"] == crawler.KNOWN_BRANDS
    assert set(c["suspicious_tlds"]) == crawler.SUSPICIOUS_TLDS
    assert set(c["allowlist"]) == crawler.ALLOWLIST
    assert set(c["phishing_keywords"]) == crawler.PHISH_KEYWORDS
    assert set(c["shorteners"]) == set(SHORTENERS)


def test_confusable_map_matches_code():
    contract_map = {k: v for k, v in _load_rules()["constants"]["confusable_map"].items()
                    if not k.startswith("$")}
    explicit = {k: v for k, v in _CONFUSABLE_MAP.items()
                if not (0xFF01 <= ord(k) <= 0xFF5E)}   # 전각은 range 로 표현
    assert contract_map == explicit
