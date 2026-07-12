"""자율 발견 크롤러의 중복·재크롤 제어 상태 (Postgres, best-effort).

크롤 대상(host)마다 last_crawled 타임스탬프를 유지해:
  - 같은 URL 을 타이트 루프로 반복 크롤하지 않고(enqueue 쿨다운),
  - 오래된 지표는 재크롤 주기(RECRAWL_INTERVAL)마다 다시 크롤한다.

모든 함수는 방어적 — DB 가 죽어도 예외를 던지지 않고 빈 결과를 돌려준다(데모 세이프).
"""
from __future__ import annotations

import os

DSN = os.getenv(
    "DATABASE_URL", "postgresql://scamgraph:scamgraph@postgres:5432/scamgraph"
)

# 재크롤 주기(초) — 이 시간이 지난 지표만 다시 크롤 대상이 된다. 기본 6시간.
RECRAWL_INTERVAL_SEC = int(os.getenv("RECRAWL_INTERVAL", "21600"))
# enqueue 쿨다운(초) — 큐에 넣었지만 아직 크롤이 끝나지 않은 대상을 다시 넣지 않는 창. 기본 15분.
ENQUEUE_COOLDOWN_SEC = int(os.getenv("ENQUEUE_COOLDOWN", "900"))

# (재)크롤 대상 자격 판정 — crawl_state 행(c)이 없거나, 오래됐을 때만 대상.
#   1) 상태 행 없음               → 최초 크롤
#   2) 크롤 이력 없음 + 쿨다운 경과 → 큐에 넣었으나 실패/미완, 재시도
#   3) 마지막 크롤이 재크롤 주기 경과 → 갱신 크롤
_ELIGIBLE = (
    "(c.value IS NULL "
    " OR (c.last_crawled IS NULL "
    "     AND c.last_enqueued < now() - make_interval(secs => %s)) "
    " OR (c.last_crawled IS NOT NULL "
    "     AND c.last_crawled < now() - make_interval(secs => %s)))"
)


def _connect():
    import psycopg2

    return psycopg2.connect(DSN, connect_timeout=3)


def _ensure(cur) -> None:
    """crawl_state 테이블 보장(없으면 생성) — 스테일 볼륨/최초 기동 대비."""
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS crawl_state (
            value          TEXT PRIMARY KEY,
            first_enqueued TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_enqueued  TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_crawled   TIMESTAMPTZ,
            last_grade     TEXT,
            last_score     INT,
            crawl_count    INT NOT NULL DEFAULT 0
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_crawl_state_last_crawled "
        "ON crawl_state (last_crawled)"
    )


def claim_targets(values: list[str], limit: int) -> list[str]:
    """주어진 host 목록에서 (재)크롤 자격이 있는 것을 최대 limit 개 원자적으로 선점.

    선점된 값은 last_enqueued 가 now() 로 갱신되어 쿨다운 동안 재선점되지 않는다.
    반환값 = 실제로 크롤 큐에 넣어야 하는 host 목록.
    """
    if not values:
        return []
    try:
        conn = _connect()
    except Exception:  # noqa: BLE001 — DB 불가 시 조용히 빈 목록(데모 세이프)
        return []
    try:
        with conn, conn.cursor() as cur:
            _ensure(cur)
            cur.execute(
                f"""
                WITH cand AS (
                    SELECT v AS value
                    FROM unnest(%s::text[]) AS v
                    LEFT JOIN crawl_state c ON c.value = v
                    WHERE {_ELIGIBLE}
                    LIMIT %s
                )
                INSERT INTO crawl_state (value, first_enqueued, last_enqueued)
                SELECT value, now(), now() FROM cand
                ON CONFLICT (value) DO UPDATE SET last_enqueued = now()
                RETURNING value
                """,
                (list(values), ENQUEUE_COOLDOWN_SEC, RECRAWL_INTERVAL_SEC, limit),
            )
            return [r[0] for r in cur.fetchall()]
    except Exception:  # noqa: BLE001
        return []
    finally:
        conn.close()


def claim_backfill(limit: int) -> list[str]:
    """기존 블록리스트 IOC(도메인/URL) 중 미크롤/오래된 것을 최대 limit 개 선점.

    blocklist 를 백로그로 삼아 (재)크롤 자격이 있는 host 를 원자적으로 선점·반환한다.
    """
    try:
        conn = _connect()
    except Exception:  # noqa: BLE001
        return []
    try:
        with conn, conn.cursor() as cur:
            _ensure(cur)
            cur.execute(
                f"""
                WITH cand AS (
                    SELECT DISTINCT b.value
                    FROM blocklist b
                    LEFT JOIN crawl_state c ON c.value = b.value
                    WHERE b.kind IN ('url', 'domain')
                      AND {_ELIGIBLE}
                    LIMIT %s
                )
                INSERT INTO crawl_state (value, first_enqueued, last_enqueued)
                SELECT value, now(), now() FROM cand
                ON CONFLICT (value) DO UPDATE SET last_enqueued = now()
                RETURNING value
                """,
                (ENQUEUE_COOLDOWN_SEC, RECRAWL_INTERVAL_SEC, limit),
            )
            return [r[0] for r in cur.fetchall()]
    except Exception:  # noqa: BLE001 — blocklist 미존재 등은 조용히 스킵
        return []
    finally:
        conn.close()


def mark_crawled(value: str, grade: str, score: int) -> None:
    """크롤 완료 표시 — last_crawled 갱신 + 최근 판정/점수 기록(중복 제어의 핵심)."""
    if not value:
        return
    try:
        conn = _connect()
    except Exception:  # noqa: BLE001
        return
    try:
        with conn, conn.cursor() as cur:
            _ensure(cur)
            cur.execute(
                """
                INSERT INTO crawl_state
                    (value, first_enqueued, last_enqueued, last_crawled,
                     last_grade, last_score, crawl_count)
                VALUES (%s, now(), now(), now(), %s, %s, 1)
                ON CONFLICT (value) DO UPDATE SET
                    last_crawled = now(),
                    last_grade   = EXCLUDED.last_grade,
                    last_score   = EXCLUDED.last_score,
                    crawl_count  = crawl_state.crawl_count + 1
                """,
                (value, grade, int(score)),
            )
    except Exception:  # noqa: BLE001
        return
    finally:
        conn.close()


def stats() -> dict:
    """발견 크롤러 누적 현황(검증·모니터링용). 실패 시 error 키."""
    try:
        conn = _connect()
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}
    try:
        with conn, conn.cursor() as cur:
            _ensure(cur)
            cur.execute(
                """
                SELECT
                    count(*)                                        AS tracked,
                    count(*) FILTER (WHERE last_crawled IS NOT NULL) AS crawled,
                    count(*) FILTER (WHERE last_grade = 'danger')    AS danger,
                    count(*) FILTER (WHERE last_grade = 'warning')   AS warning,
                    coalesce(sum(crawl_count), 0)                    AS total_crawls
                FROM crawl_state
                """
            )
            row = cur.fetchone()
            return {
                "tracked": row[0],
                "crawled": row[1],
                "danger": row[2],
                "warning": row[3],
                "total_crawls": int(row[4]),
            }
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}
    finally:
        conn.close()
