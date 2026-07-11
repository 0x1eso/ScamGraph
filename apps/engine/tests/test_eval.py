"""정확도 회귀 가드 — 규칙 변경이 판정 성능을 떨어뜨리면 실패한다."""
from __future__ import annotations

from app.crawler import _has_confusable, quick_assess
from app.eval.evaluate import evaluate


def test_accuracy_regression():
    m = evaluate()
    assert m["samples"] >= 60, m
    assert m["accuracy"] >= 0.90, m
    assert m["precision"] >= 0.90, m   # 오탐 낮게 유지
    assert m["recall"] >= 0.85, m


def test_no_false_positive_on_legit():
    # 정상 도메인은 사기로 오판하지 않아야 한다(precision 방어).
    m = evaluate()
    assert m["confusion"]["fp"] == 0, m["confusion"]


def test_homoglyph_detected():
    # 키릴 'а'(U+0430)로 위장한 도메인은 homoglyph 로 잡힌다.
    assert _has_confusable("nаver.com")
    res = quick_assess("nаver.com")
    rules = {r["rule"] for r in res["reasons"]}
    assert "homoglyph" in rules
    assert res["grade"] in {"caution", "warning", "danger"}


def test_brand_embedded_impersonation():
    # 브랜드명이 토큰에 임베드된 경우도 사칭으로 잡힌다(tosspay ⊃ toss).
    res = quick_assess("tosspay-help.info")
    rules = {r["rule"] for r in res["reasons"]}
    assert "brand_impersonation" in rules
