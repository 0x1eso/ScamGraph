"""Celery 비동기 워커 — 크롤링·스코어링·그래프 적재·이력 저장을 백그라운드로."""
from __future__ import annotations

import os

from celery import Celery

from .crawler import crawl_and_enrich, score_enrichment
from .feeds.ingest import ingest_all
from .graph import upsert_scan
from .pg import persist_scan

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# 위협 피드 수집 주기(초). 기본 5분.
FEED_INTERVAL = float(os.getenv("FEED_INGEST_INTERVAL", "300"))

celery_app = Celery("scamgraph", broker=REDIS_URL, backend=REDIS_URL)

# 내장 beat 스케줄 — 별도 프로세스 없이 워커에서 주기 수집(celery worker -B).
celery_app.conf.beat_schedule = {
    "ingest-threat-feeds": {
        "task": "ingest_feeds",
        "schedule": FEED_INTERVAL,
    },
}


@celery_app.task(name="scan_target")
def scan_target(target: str) -> dict:
    # 1) 수집 + 수집 신호 반영(도메인 나이·리다이렉트·인증정보 폼·TLS)
    result = crawl_and_enrich(target)
    score_enrichment(result)

    # 2) 그래프 적재 (인프라 pivot 포함)
    try:
        upsert_scan(result)
        result["graph"] = "upserted"
    except Exception as e:  # noqa: BLE001
        result["graph_error"] = str(e)

    # 3) 스캔 이력 저장 (Postgres) — 관리자 분석용
    try:
        persist_scan(result)
        result["persisted"] = True
    except Exception as e:  # noqa: BLE001
        result["pg_error"] = str(e)

    return result


@celery_app.task(name="ingest_feeds")
def ingest_feeds() -> dict:
    """공개 위협 피드(OpenPhish·URLhaus·ThreatFox·경찰청)를 수집·적재."""
    return ingest_all()
