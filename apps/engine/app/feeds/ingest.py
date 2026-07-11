"""위협 피드 수집 오케스트레이션 — 모든 소스를 폴 → PG 블록리스트 + Neo4j 적재.

각 소스는 개별로 try/except 하여 하나가 죽어도 나머지는 계속된다(데모 세이프).
"""
from __future__ import annotations

from .abusech import ThreatFoxSource, URLhausSource
from .base import Indicator
from .openphish import OpenPhishSource
from .police_kr import PoliceKrSource

SOURCES = [OpenPhishSource(), URLhausSource(), ThreatFoxSource(), PoliceKrSource()]

# 그래프 가독성 상한 — 관계망에 올릴 지표 수(블록리스트는 전량 저장).
GRAPH_CAP = 28


def collect() -> list[Indicator]:
    """모든 소스에서 지표를 모아 (value, source) 기준으로 중복 제거."""
    out: list[Indicator] = []
    seen: set[tuple[str, str]] = set()
    for src in SOURCES:
        try:
            items = src.fetch()
        except Exception:  # noqa: BLE001 — 한 소스 실패가 전체를 막지 않는다
            items = []
        for ind in items:
            key = (ind.value, ind.source)
            if ind.value and key not in seen:
                seen.add(key)
                out.append(ind)
    return out


def ingest_all() -> dict:
    """수집 → Postgres 블록리스트 upsert + Neo4j 관계망 적재. 결과 요약 반환."""
    from ..graph import upsert_feed_indicators
    from ..pg import upsert_blocklist

    indicators = collect()

    try:
        pg_result = upsert_blocklist(indicators)
    except Exception as e:  # noqa: BLE001
        pg_result = {"error": str(e)}

    # 그래프 상한 선택 — IP 보유 지표(공유 시 클러스터 형성)를 우선해, 라이브 피드가
    # 지표를 많이 반환해도 '교차 인프라 귀속' 클러스터가 항상 관계망에 나타나게 한다.
    graph_subset = sorted(indicators, key=lambda ind: 0 if ind.ip else 1)[:GRAPH_CAP]
    try:
        graph_result = upsert_feed_indicators(graph_subset)
    except Exception as e:  # noqa: BLE001
        graph_result = {"error": str(e)}

    per_source: dict[str, int] = {}
    for ind in indicators:
        per_source[ind.source] = per_source.get(ind.source, 0) + 1

    return {
        "total": len(indicators),
        "per_source": per_source,
        "pg": pg_result,
        "graph": graph_result,
    }
