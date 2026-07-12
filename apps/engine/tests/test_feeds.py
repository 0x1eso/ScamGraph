"""위협 피드 수집(TIP) 단위 테스트 — 네트워크 없이 결정적으로 검증.

httpx 를 차단해 모든 어댑터가 시드로 폴백하는 데모 세이프 경로를 검증한다.
"""
from __future__ import annotations

from collections import Counter

import httpx
import pytest

from app.feeds.abusech import ThreatFoxSource, URLhausSource
from app.feeds.base import Indicator, host_of
from app.feeds.brands import looks_like_impersonation, matched_brand
from app.feeds.crt_sh import CrtShSource
from app.feeds.ingest import GRAPH_CAP, SOURCES, collect
from app.feeds.openphish import OpenPhishSource
from app.feeds.phishtank import PhishTankSource
from app.feeds.police_kr import PoliceKrSource
from app.feeds.seed import SEED
from app.feeds.urlscan import UrlScanSource

_ALL_SOURCES = {
    "openphish", "urlhaus", "threatfox", "police_kr",
    "crt_sh", "urlscan", "phishtank",
}


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """모든 테스트에서 네트워크 호출을 차단 → 어댑터는 시드로 폴백."""
    def _raise(*args, **kwargs):
        raise RuntimeError("network disabled in tests")

    monkeypatch.setattr(httpx, "get", _raise)
    monkeypatch.setattr(httpx, "post", _raise)


def test_host_of_normalizes():
    assert host_of("http://evil.com/login") == "evil.com"
    assert host_of("https://user@evil.com:8080/x") == "evil.com"
    assert host_of("EVIL.COM") == "evil.com"
    assert host_of("") == ""


@pytest.mark.parametrize("sid", sorted(_ALL_SOURCES))
def test_seed_wellformed(sid):
    items = SEED[sid]
    assert items, f"{sid} 시드가 비어있음"
    for ind in items:
        assert isinstance(ind, Indicator)
        assert ind.value
        assert ind.source == sid


def test_openphish_falls_back_to_seed_offline():
    assert OpenPhishSource().fetch() == SEED["openphish"]


def test_abusech_falls_back_to_seed():
    # 키 없음 또는 네트워크 차단 → 시드
    assert URLhausSource().fetch() == SEED["urlhaus"]
    assert ThreatFoxSource().fetch() == SEED["threatfox"]


def test_police_kr_is_gov_source():
    items = PoliceKrSource().fetch()
    assert items
    assert all(i.source_kind == "gov" for i in items)


def test_crt_sh_falls_back_to_seed_offline():
    assert CrtShSource().fetch() == SEED["crt_sh"]


def test_urlscan_falls_back_to_seed_offline():
    assert UrlScanSource().fetch() == SEED["urlscan"]


def test_phishtank_falls_back_to_seed_without_key():
    # 앱 키가 없으면(테스트 환경) 네트워크 없이 시드로 폴백.
    assert PhishTankSource().fetch() == SEED["phishtank"]


def test_brand_impersonation_detection():
    # 브랜드 + 의심 토큰 → 사칭, 공식 도메인 → 제외.
    assert looks_like_impersonation("toss-secure-cert.top") == "toss"
    assert matched_brand("naver-mail-secure.top") == "naver"
    assert matched_brand("toss.im") is None
    assert matched_brand("www.shinhan.com") is None
    assert looks_like_impersonation("example.org") is None


def test_collect_covers_all_sources_and_dedups():
    items = collect()
    got = {i.source for i in items}
    assert _ALL_SOURCES <= got
    keys = [(i.value, i.source) for i in items]
    assert len(keys) == len(set(keys)), "collect() 는 (value, source) 로 중복 제거해야 함"


def test_shared_ip_cluster_exists():
    """교차 인프라 귀속 킬샷 재현 — 서로 다른 도메인이 같은 IP 를 공유."""
    ips = [i.ip for i in collect() if i.ip and i.kind == "domain"]
    counts = Counter(ips)
    assert any(v >= 2 for v in counts.values()), "공유 IP 클러스터가 최소 하나는 있어야 함"


def test_ingest_config():
    assert GRAPH_CAP > 0
    assert len(SOURCES) == 7


# ---------------------------------------------------------------------------
# brands — 사칭 판정(공식 도메인 제외 · CT 엄격 필터)
# ---------------------------------------------------------------------------
def test_matched_brand_excludes_official_domains():
    assert matched_brand("toss.im") is None
    assert matched_brand("kakaopay.com") is None            # 공식 도메인
    assert matched_brand("kakao-account-safe.live") == "kakao"
    assert matched_brand("plainsite.com") is None           # 브랜드 없음


def test_looks_like_impersonation_requires_suspicious_token():
    # CT 는 정상 인증서가 방대하므로 브랜드 + 의심 토큰이 함께일 때만 신호.
    assert looks_like_impersonation("naver-blog.com") is None
    assert looks_like_impersonation("naver-login.com") == "naver"


# ---------------------------------------------------------------------------
# ingest_all — 수집→적재 오케스트레이션(싱크는 가짜로 대체, 실제 DB 무접촉)
# ---------------------------------------------------------------------------
def test_ingest_all_offline_orchestrates(monkeypatch):
    import app.graph as graph
    import app.pg as pg

    seen: dict = {}

    def _fake_block(indicators):
        seen["pg"] = len(indicators)
        return {"upserted": len(indicators)}

    def _fake_graph(indicators):
        seen["graph"] = len(indicators)
        return {"nodes": len(indicators)}

    monkeypatch.setattr(pg, "upsert_blocklist", _fake_block)
    monkeypatch.setattr(graph, "upsert_feed_indicators", _fake_graph)

    from app.feeds.ingest import ingest_all

    out = ingest_all()
    assert out["total"] > 0
    assert out["pg"] == {"upserted": out["total"]}          # 블록리스트는 전량
    assert out["graph"]["nodes"] <= GRAPH_CAP               # 그래프는 상한 적용
    assert _ALL_SOURCES <= set(out["per_source"])
    assert sum(out["per_source"].values()) == out["total"]


def test_ingest_all_survives_sink_failure(monkeypatch):
    import app.graph as graph
    import app.pg as pg

    def _raise(*a, **k):
        raise RuntimeError("sink down")

    monkeypatch.setattr(pg, "upsert_blocklist", _raise)
    monkeypatch.setattr(graph, "upsert_feed_indicators", _raise)

    from app.feeds.ingest import ingest_all

    out = ingest_all()
    assert "error" in out["pg"]
    assert "error" in out["graph"]
    assert out["total"] > 0                                 # 수집 자체는 성공(데모 세이프)
