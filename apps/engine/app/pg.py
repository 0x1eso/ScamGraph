"""Postgres 스캔 이력 저장 (best-effort). 관리자 분석/추이 데이터 소스."""
from __future__ import annotations

import json
import os

DSN = os.getenv("DATABASE_URL", "postgresql://scamgraph:scamgraph@postgres:5432/scamgraph")


def persist_scan(result: dict) -> None:
    """스캔 결과를 scans 테이블에 저장. 실패해도 상위에서 무시(데모 세이프)."""
    import psycopg2

    conn = psycopg2.connect(DSN, connect_timeout=3)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scans (target, kind, risk_score, grade, reasons)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    result.get("target", ""),
                    result.get("kind", "url"),
                    int(result.get("risk_score", 0)),
                    result.get("grade", "safe"),
                    json.dumps(result.get("reasons", []), ensure_ascii=False),
                ),
            )
    finally:
        conn.close()


def upsert_blocklist(indicators: list) -> dict:
    """위협 피드 지표를 blocklist 에 upsert. 테이블 없으면 생성(스테일 볼륨 대비, 데모 세이프)."""
    import psycopg2

    conn = psycopg2.connect(DSN, connect_timeout=3)
    upserted = 0
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS blocklist (
                    id          BIGSERIAL PRIMARY KEY,
                    value       TEXT NOT NULL,
                    kind        TEXT NOT NULL,
                    source      TEXT NOT NULL,
                    source_kind TEXT NOT NULL DEFAULT 'global',
                    detail      TEXT,
                    first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
                    last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (value, source)
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_blocklist_value ON blocklist (value)")
            for ind in indicators:
                cur.execute(
                    """
                    INSERT INTO blocklist (value, kind, source, source_kind, detail)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (value, source)
                    DO UPDATE SET last_seen = now(), detail = EXCLUDED.detail
                    """,
                    (ind.value, ind.kind, ind.source, ind.source_kind, ind.detail),
                )
                upserted += 1
    finally:
        conn.close()
    return {"upserted": upserted}
