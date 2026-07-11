"""ScamGraph 분석 엔진 API (FastAPI)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .crawler import quick_assess

app = FastAPI(
    title="ScamGraph Engine",
    version="0.1.0",
    description="사기·피싱 위협 스캔 엔진 — 규칙 기반(설명 가능) 분석 + 비동기 크롤링/그래프 적재",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
