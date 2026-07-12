"""Postgres 저장 로직 단위 테스트 — 가짜 psycopg2 로 실제 DB 없이 검증."""
from __future__ import annotations

import json
import sys

import pytest

import app.pg as pg
from app.feeds.base import Indicator


class _FakeCursor:
    def __init__(self, log):
        self._log = log

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self._log.append((" ".join(sql.split()), params))


class _FakeConn:
    def __init__(self, log):
        self._log = log
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return _FakeCursor(self._log)

    def close(self):
        self.closed = True


class _FakePsycopg2:
    def __init__(self):
        self.log: list = []
        self.conns: list = []

    def connect(self, dsn, **kw):
        conn = _FakeConn(self.log)
        self.conns.append(conn)
        return conn


@pytest.fixture
def fake_pg(monkeypatch):
    fake = _FakePsycopg2()
    monkeypatch.setitem(sys.modules, "psycopg2", fake)
    return fake


def test_persist_scan_inserts_row_with_coerced_types(fake_pg):
    result = {
        "target": "evil.top", "kind": "url", "risk_score": 88, "grade": "danger",
        "reasons": [{"rule": "suspicious_tld", "weight": 22}],
    }
    pg.persist_scan(result)
    sql, params = fake_pg.log[-1]
    assert "INSERT INTO scans" in sql
    assert params[0] == "evil.top"
    assert params[1] == "url"
    assert params[2] == 88 and isinstance(params[2], int)
    assert params[3] == "danger"
    assert json.loads(params[4])[0]["rule"] == "suspicious_tld"
    assert fake_pg.conns[-1].closed is True


def test_persist_scan_applies_defaults_and_int_coercion(fake_pg):
    pg.persist_scan({"risk_score": "5"})   # 문자열 점수도 int 로 강제, 나머지는 기본값.
    _, params = fake_pg.log[-1]
    assert params[0] == "" and params[1] == "url" and params[3] == "safe"
    assert params[2] == 5 and isinstance(params[2], int)


def test_upsert_blocklist_creates_table_index_and_upserts(fake_pg):
    indicators = [
        Indicator("evil-a.top", "domain", "urlhaus", detail="x"),
        Indicator("6.6.6.6", "ip", "threatfox", detail="y"),
    ]
    out = pg.upsert_blocklist(indicators)
    assert out == {"upserted": 2}
    joined = " || ".join(s for s, _ in fake_pg.log)
    assert "CREATE TABLE IF NOT EXISTS blocklist" in joined
    assert "CREATE INDEX IF NOT EXISTS idx_blocklist_value" in joined
    assert joined.count("INSERT INTO blocklist") == 2
    assert fake_pg.conns[-1].closed is True
