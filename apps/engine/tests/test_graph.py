"""Neo4j 적재 로직 단위 테스트 — 가짜 드라이버/세션으로 실제 Neo4j 없이 검증."""
from __future__ import annotations

import pytest

import app.graph as graph
from app.feeds.base import Indicator


class _FakeSession:
    def __init__(self, log):
        self._log = log

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def run(self, query, **params):
        self._log.append((" ".join(query.split()), params))
        return None


class _FakeDriver:
    def __init__(self, log):
        self._log = log

    def session(self):
        return _FakeSession(self._log)


@pytest.fixture
def calls(monkeypatch):
    log: list = []
    monkeypatch.setattr(graph, "driver", lambda: _FakeDriver(log))
    return log


def _queries(calls) -> str:
    return " || ".join(q for q, _ in calls)


def test_upsert_scan_merges_target_and_all_infra(calls):
    result = {
        "target": "evil.top", "kind": "url", "risk_score": 88, "grade": "danger",
        "enrichment": {
            "host": "evil.top",
            "ips": ["1.2.3.4", "5.6.7.8"],
            "registrant": "ACME LTD",
            "tls": {"fingerprint": "abcd1234"},
        },
    }
    graph.upsert_scan(result)
    q = _queries(calls)
    assert "MERGE (t:Target {value: $target})" in q
    assert "MERGE (h:Host {name: $host})" in q
    assert "MERGE (a:IP {addr: $ip})" in q
    assert "MERGE (r:Registrant {name: $registrant})" in q
    assert "MERGE (c:Cert {fingerprint: $fp})" in q
    # IP 두 개 → HOSTED_ON 관계 두 번.
    assert sum(1 for cq, _ in calls if "HOSTED_ON" in cq) == 2


def test_upsert_scan_minimal_enrichment_only_merges_target(calls):
    graph.upsert_scan({"target": "x.com", "enrichment": {}})
    assert len(calls) == 1
    assert "MERGE (t:Target" in calls[0][0]


def test_upsert_feed_indicators_counts_and_skips_noninfra(calls):
    indicators = [
        Indicator("evil-a.top", "domain", "urlhaus", ip="9.9.9.9"),
        Indicator("evil-b.top", "domain", "openphish"),        # ip 없음
        Indicator("6.6.6.6", "ip", "threatfox", ip="6.6.6.6"),
        Indicator("070-1234-5678", "phone", "police_kr"),      # 그래프 대상 아님
    ]
    out = graph.upsert_feed_indicators(indicators)
    assert out == {"nodes": 3}   # domain 2 + ip 1, phone 제외
    q = _queries(calls)
    assert "MERGE (a:IP {addr: $ip})" in q
    assert "MERGE (t:Target {value: $value})" in q
    assert any("HOSTED_ON" in cq for cq, _ in calls)   # ip 보유 도메인 관계


def test_upsert_feed_indicators_skips_valueless(calls):
    out = graph.upsert_feed_indicators([Indicator("", "domain", "urlhaus")])
    assert out == {"nodes": 0}
    assert calls == []
