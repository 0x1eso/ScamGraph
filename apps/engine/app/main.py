"""ScamGraph 분석 엔진 API (FastAPI)."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .crawler import quick_assess
from .metrics import setup_metrics


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 부팅 직후 위협 피드 수집 1회 트리거(베스트 에포트). 이후엔 워커 내장 beat 가 주기 갱신.
    try:
        from .worker import ingest_feeds
        ingest_feeds.delay()
    except Exception:  # noqa: BLE001 — 브로커 없어도 API 는 즉시 기동 (demo-safe)
        pass
    yield


app = FastAPI(
    title="ScamGraph Engine",
    version="0.1.0",
    description="사기·피싱 위협 스캔 엔진 — 규칙 기반(설명 가능) 분석 + 비동기 크롤링/그래프 적재",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 관측성 — 요청 카운트/스캔 지연 메트릭 미들웨어 + /metrics 노출(프로메테우스 스크레이프)
setup_metrics(app)


class ScanRequest(BaseModel):
    target: str


@app.get("/health")
def health():
    return {"service": "engine", "status": "up"}


@app.post("/scan")
def scan(req: ScanRequest):
    """즉시 규칙 평가(quick_assess)를 반환하고, 비동기 크롤링을 트리거."""
    preliminary = quick_assess(req.target)

    job_id = None
    try:
        from .worker import scan_target
        task = scan_target.delay(req.target)
        job_id = task.id
    except Exception as e:  # noqa: BLE001 — 브로커 없어도 즉시 결과는 반환 (demo-safe)
        preliminary["async_error"] = str(e)

    return {"target": req.target, "job_id": job_id, **preliminary}


_accuracy_cache: dict | None = None


@app.get("/accuracy")
def accuracy():
    """규칙 엔진 판정 정확도(라벨셋 기반 precision/recall/F1). 최초 1회 계산 후 캐시."""
    global _accuracy_cache
    if _accuracy_cache is None:
        from .eval.evaluate import evaluate
        metrics = evaluate()
        metrics.pop("misses", None)  # 응답 간결화(오분류 목록 제외)
        _accuracy_cache = metrics
    return _accuracy_cache
