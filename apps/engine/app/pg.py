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
