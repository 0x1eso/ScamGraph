"""자율 발견 크롤러 디스패치 — 새 피드 URL·기존 IOC 를 크롤 큐로 흘려보낸다.

- dispatch_feed_crawls: 피드 수집 직후 이번 사이클의 '새' host 를 크롤 큐에 적재.
- dispatch_backfill:    기존 블록리스트 IOC 중 미크롤/오래된 것을 배치로 크롤(백필).

크롤 자체는 워커의 crawl_discovered(레이트리밋+타임리밋)가 수행한다.
모든 경로는 방어적(try/except) — 큐/DB 가 죽어도 파이프라인은 계속(데모 세이프).
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)

# 피드 사이클당 새 크롤 상한 — 대형 피드 배치가 워커를 덮치지 않게 한다.
FEED_CAP = int(os.getenv("DISCOVERY_FEED_CAP", "40"))
# 백필 사이클당 배치 크기 — 백로그를 조금씩 계속 소진.
BACKFILL_BATCH = int(os.getenv("DISCOVERY_BACKFILL_BATCH", "12"))


def _crawlable_hosts(indicators) -> list[str]:
    """지표 목록에서 크롤 가능한 host(도메인/URL)만 중복 없이 추출. ip/phone/account 제외."""
    from .feeds.base import host_of

    hosts: list[str] = []
    seen: set[str] = set()
    for ind in indicators:
        kind = getattr(ind, "kind", "")
        if kind not in ("url", "domain"):
            continue
        host = host_of(getattr(ind, "value", "") or "")
        if host and host not in seen:
            seen.add(host)
            hosts.append(host)
    return hosts


def _enqueue(targets: list[str], source: str) -> dict:
    """선점된 host 들을 crawl_discovered 큐에 적재. 브로커 불가 시 조용히 스킵."""
    if not targets:
        return {"enqueued": 0, "source": source}
    try:
        from .worker import crawl_discovered
    except Exception as e:  # noqa: BLE001
        return {"enqueued": 0, "source": source, "error": str(e)}

    sent = 0
    for target in targets:
        try:
            crawl_discovered.delay(target)
            sent += 1
        except Exception:  # noqa: BLE001 — 브로커 순간 장애는 다음 사이클에 재시도
            continue
    if sent:
        log.info("[discovery] %s 발견 크롤 %d건 큐 적재", source, sent)
    return {"enqueued": sent, "source": source}


def dispatch_feed_crawls(indicators) -> dict:
    """피드 수집 결과에서 새 host 를 골라 크롤 큐로 보낸다(중복/재크롤 제어 적용)."""
    hosts = _crawlable_hosts(indicators)
    if not hosts:
        return {"candidates": 0, "enqueued": 0}
    try:
        from .crawl_state import claim_targets

        claimed = claim_targets(hosts, FEED_CAP)
    except Exception as e:  # noqa: BLE001
        return {"candidates": len(hosts), "enqueued": 0, "error": str(e)}
    result = _enqueue(claimed, source="feed")
    result["candidates"] = len(hosts)
    return result


def dispatch_backfill(limit: int = BACKFILL_BATCH) -> dict:
    """기존 IOC 백로그에서 다음 배치를 골라 크롤 큐로 보낸다(백필)."""
    try:
        from .crawl_state import claim_backfill

        claimed = claim_backfill(limit)
    except Exception as e:  # noqa: BLE001
        return {"enqueued": 0, "source": "backfill", "error": str(e)}
    return _enqueue(claimed, source="backfill")
