"""Celery 비동기 워커 — 크롤링·스코어링·그래프 적재·이력 저장을 백그라운드로.

- scan_target:      대화형 스캔(콘솔 입력) — 레이트리밋 없음(킬샷 즉답).
- crawl_discovered: 자율 발견 크롤(피드/백필) — 레이트리밋+타임리밋으로 예의 있게 대량 처리.
- ingest_feeds:     공개 위협 피드 주기 수집 → 새 URL 을 발견 크롤 큐로 흘려보냄.
- backfill_crawl:   기존 IOC 백로그를 주기적으로 조금씩 크롤(누적 보강).
"""
from __future__ import annotations

import logging
import os

from celery import Celery

from .crawler import crawl_and_enrich, score_enrichment
from .feeds.ingest import ingest_all
from .graph import upsert_scan
from .pg import persist_scan

log = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# 위협 피드 수집 주기(초). 기본 5분.
FEED_INTERVAL = float(os.getenv("FEED_INGEST_INTERVAL", "300"))
# 기존 IOC 백필 크롤 주기(초). 기본 60초 — 백로그를 계속 조금씩 소진.
BACKFILL_INTERVAL = float(os.getenv("BACKFILL_INTERVAL", "60"))

celery_app = Celery("scamgraph", broker=REDIS_URL, backend=REDIS_URL)

# 내장 beat 스케줄 — 별도 프로세스 없이 워커에서 주기 실행(celery worker -B).
celery_app.conf.beat_schedule = {
    "ingest-threat-feeds": {
        "task": "ingest_feeds",
        "schedule": FEED_INTERVAL,
    },
    # 기존 IOC 백로그를 주기적으로 크롤해 그래프/이력에 누적 보강.
    "backfill-existing-iocs": {
        "task": "backfill_crawl",
        "schedule": BACKFILL_INTERVAL,
    },
}


def _run_crawl(target: str) -> dict:
    """크롤 공통 파이프라인 — 대화형(scan_target)·자율발견(crawl_discovered) 공유.

    1) 네트워크 수집 + 수집 신호 스코어링
    2) Neo4j 그래프 적재(인프라 pivot 포함) — 위험 지표가 관계망 노드로 누적
    3) Postgres 스캔 이력 저장
    4) 크롤 완료 표시(중복/재크롤 제어)
    각 단계는 개별 try/except — 하나가 죽어도 워커는 죽지 않는다(데모 세이프).
    """
    result = crawl_and_enrich(target)
    score_enrichment(result)

    try:
        upsert_scan(result)
        result["graph"] = "upserted"
    except Exception as e:  # noqa: BLE001
        result["graph_error"] = str(e)

    try:
        persist_scan(result)
        result["persisted"] = True
    except Exception as e:  # noqa: BLE001
        result["pg_error"] = str(e)

    # 크롤 완료 표시 — 같은 대상을 타이트 루프로 재크롤하지 않도록 상태 갱신.
    try:
        from .crawl_state import mark_crawled

        mark_crawled(
            result.get("target", target),
            result.get("grade", "safe"),
            int(result.get("risk_score", 0)),
        )
    except Exception as e:  # noqa: BLE001
        result["state_error"] = str(e)

    return result


@celery_app.task(name="scan_target")
def scan_target(target: str) -> dict:
    """대화형 스캔 — 콘솔 입력. 레이트리밋 없이 즉시 처리(킬샷 데모)."""
    return _run_crawl(target)


@celery_app.task(
    name="crawl_discovered",
    rate_limit="40/m",     # 발견 크롤 예의 — 아웃바운드 요청 속도 상한(크롤러 차단 방지)
    time_limit=45,         # 하드 타임아웃 — whois 등 무한 지연 방지
    soft_time_limit=40,
)
def crawl_discovered(target: str) -> dict:
    """자율 발견 크롤 — 피드/백필이 큐에 넣은 대상. 레이트/타임 제한으로 대량 안전 처리."""
    return _run_crawl(target)


@celery_app.task(name="ingest_feeds")
def ingest_feeds() -> dict:
    """공개 위협 피드(OpenPhish·URLhaus·ThreatFox·경찰청)를 수집·적재 → 새 URL 발견 크롤."""
    return ingest_all()


@celery_app.task(name="backfill_crawl")
def backfill_crawl() -> dict:
    """기존 IOC 백로그에서 다음 배치를 골라 발견 크롤 큐로 보낸다."""
    from .discovery import dispatch_backfill

    return dispatch_backfill()
