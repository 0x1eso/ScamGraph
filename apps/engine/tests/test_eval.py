"""정확도 회귀 가드 — 규칙 변경이 판정 성능을 떨어뜨리면 실패한다."""
from __future__ import annotations

from app.crawler import _has_confusable, quick_assess
from app.eval.evaluate import evaluate

# 즉시 규칙(quick_assess)만으로 반드시 높은 재현율을 내야 하는 사기 카테고리.
# 'subtle'(어휘/구조 신호 없음)은 정직한 미탐이므로 제외한다.
HIGH_RECALL_CATEGORIES = {
    "impersonation", "typosquat", "homoglyph",
    "smishing", "shortener", "structural", "phone",
}


def test_accuracy_regression():
    m = evaluate()
    assert m["samples"] >= 150, m
    assert m["accuracy"] >= 0.93, m
    assert m["precision"] >= 0.95, m   # 오탐 낮게 유지(신뢰의 핵심)
    assert m["recall"] >= 0.88, m
    assert m["f1"] >= 0.92, m


def test_dataset_is_balanced():
    m = evaluate()
    # scam/legit 균형(어느 한쪽이 60% 넘지 않게) — 정확도 수치가 의미 있으려면 필요.
    scam, legit = m["scam_samples"], m["legit_samples"]
    assert min(scam, legit) / (scam + legit) >= 0.4, (scam, legit)


def test_no_false_positive_on_legit():
    # 정상 도메인은 사기로 오판하지 않아야 한다(precision 방어).
    m = evaluate()
    assert m["confusion"]["fp"] == 0, m["misses"]


def test_high_recall_categories_are_caught():
    # subtle 을 제외한 사기 카테고리는 즉시 규칙만으로 사실상 전부 잡혀야 한다.
    m = evaluate()
    for cat, stat in m["by_category"].items():
        if cat in HIGH_RECALL_CATEGORIES:
            rate = stat["correct"] / stat["total"]
            assert rate >= 0.9, (cat, stat)


def test_allowlist_and_clean_never_flagged():
    # 화이트리스트/클린 정상 도메인은 100% 정상으로 판정되어야 한다.
    m = evaluate()
    for cat in ("allowlist", "clean"):
        stat = m["by_category"][cat]
        assert stat["correct"] == stat["total"], (cat, stat)


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
