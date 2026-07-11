"""라벨셋에 대해 quick_assess 의 판정 성능을 산출.

운영점(operating point): grade 가 'caution' 이상(= 점수 15 이상)이면 '위험'으로 예측한다.
'safe' 만 정상으로 본다. 계정은 데이터셋에서 제외(커뮤니티 DB 의존).

전체 precision/recall/F1 과 함께 카테고리별 적중 현황(by_category)을 리포트한다 —
어느 공격 유형이 잘 잡히고 어디서 미탐(FN)이 남는지 정직하게 드러내기 위함.
"""
from __future__ import annotations

from ..crawler import quick_assess
from .dataset import CATEGORIZED

SCAM_GRADES = {"caution", "warning", "danger"}


def evaluate() -> dict:
    tp = fp = tn = fn = 0
    misses: list[dict] = []
    # category -> {"total", "correct", "scam"(bool)}
    by_category: dict[str, dict] = {}

    for value, label, category in CATEGORIZED:
        res = quick_assess(value)
        predicted_scam = res["grade"] in SCAM_GRADES
        actual_scam = label == "scam"
        correct = predicted_scam == actual_scam

        cat = by_category.setdefault(
            category, {"total": 0, "correct": 0, "kind": label}
        )
        cat["total"] += 1
        cat["correct"] += int(correct)

        if predicted_scam and actual_scam:
            tp += 1
        elif predicted_scam and not actual_scam:
            fp += 1
            misses.append({"type": "FP", "value": value, "category": category,
                           "grade": res["grade"]})
        elif not predicted_scam and actual_scam:
            fn += 1
            misses.append({"type": "FN", "value": value, "category": category,
                           "grade": res["grade"]})
        else:
            tn += 1

    total = tp + fp + tn + fn
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    accuracy = (tp + tn) / total if total else 0.0

    return {
        "samples": total,
        "scam_samples": tp + fn,
        "legit_samples": tn + fp,
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "confusion": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "operating_point": "grade>=caution",
        "by_category": by_category,
        "misses": misses,
    }


if __name__ == "__main__":  # pragma: no cover
    import json

    print(json.dumps(evaluate(), ensure_ascii=False, indent=2))
