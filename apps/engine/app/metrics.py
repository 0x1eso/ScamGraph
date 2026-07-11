"""Prometheus 메트릭 노출 — 요청 카운트 + 스캔 지연시간.

순수 SW·demo-safe: prometheus_client 만 사용하며 외부 네트워크 호출이 전혀 없다.
main.py 에서 ``setup_metrics(app)`` 로 미들웨어와 ``/metrics`` ASGI 앱을 장착한다.
프로메테우스가 ``GET /metrics`` 를 주기 스크레이프한다.
"""
from __future__ import annotations

import time

from prometheus_client import Counter, Histogram, make_asgi_app

# 경로·메서드·상태코드별 요청 총계. 엔진 라우트가 고정(/health,/scan,/accuracy)이라 카디널리티 안전.
REQUEST_COUNT = Counter(
    "scamgraph_engine_requests_total",
    "엔진 HTTP 요청 총계 (경로·메서드·상태코드별)",
    ["method", "path", "status"],
)

# POST /scan 규칙 평가(quick_assess) 응답 지연시간 분포.
SCAN_LATENCY = Histogram(
    "scamgraph_engine_scan_latency_seconds",
    "POST /scan 규칙 평가 응답 지연시간(초)",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
)


def setup_metrics(app) -> None:
    """FastAPI 앱에 메트릭 미들웨어와 /metrics 엔드포인트를 장착한다."""

    @app.middleware("http")
    async def _track(request, call_next):
        path = request.url.path
        if path == "/metrics":  # 스크레이프 자기집계 제외(노이즈 방지)
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start

        REQUEST_COUNT.labels(
            method=request.method, path=path, status=response.status_code
        ).inc()
        if path == "/scan":
            SCAN_LATENCY.observe(elapsed)
        return response

    # prometheus_client 표준 ASGI 앱을 /metrics 에 마운트
    app.mount("/metrics", make_asgi_app())
