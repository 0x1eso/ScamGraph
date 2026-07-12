"""메트릭 미들웨어 단위 테스트 — main 임포트 없이 격리된 앱으로 검증(브로커 무접촉)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.metrics import setup_metrics


def _app() -> FastAPI:
    app = FastAPI()
    setup_metrics(app)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    @app.get("/scan")   # 지연시간 히스토그램 경로(메서드 무관, path 로 판별)
    def scan():
        return {"ok": True}

    @app.get("/boom")
    def boom():
        raise RuntimeError("boom")

    return app


def test_metrics_endpoint_exposes_prometheus_text():
    client = TestClient(_app())
    assert client.get("/ping").status_code == 200
    body = client.get("/metrics").text
    assert "scamgraph_engine_requests_total" in body
    assert 'path="/ping"' in body


def test_metrics_self_scrape_is_not_counted():
    client = TestClient(_app())
    client.get("/metrics")
    body = client.get("/metrics").text
    assert 'path="/metrics"' not in body   # 스크레이프 자기집계 제외


def test_scan_latency_histogram_is_observed():
    client = TestClient(_app())
    client.get("/scan")
    body = client.get("/metrics").text
    assert "scamgraph_engine_scan_latency_seconds_count" in body


def test_middleware_does_not_crash_on_route_exception():
    client = TestClient(_app(), raise_server_exceptions=False)
    assert client.get("/boom").status_code == 500
    # 라우트 예외 이후에도 미들웨어/앱은 계속 정상 동작한다.
    assert client.get("/ping").status_code == 200
