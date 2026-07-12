"""API 엔드포인트 단위 테스트 — 라우트 함수 직접 호출(네트워크·브로커 무접촉)."""
from __future__ import annotations

import app.main as main
from app.main import ScanRequest


def test_health():
    assert main.health() == {"service": "engine", "status": "up"}


def test_scan_is_demo_safe_when_broker_down(monkeypatch):
    # 브로커가 없어 .delay() 가 실패해도 즉시 규칙 결과는 반환된다(데모 세이프).
    import app.worker as worker

    def _boom(*a, **k):
        raise RuntimeError("no broker")

    monkeypatch.setattr(worker.scan_target, "delay", _boom)
    out = main.scan(ScanRequest(target="shinhan-otp.xyz"))
    assert out["target"] == "shinhan-otp.xyz"
    assert out["job_id"] is None
    assert out["kind"] == "url"
    assert out["grade"] == "danger"
    assert "async_error" in out
    assert isinstance(out["reasons"], list)


def test_scan_returns_job_id_when_broker_up(monkeypatch):
    import app.worker as worker

    class _Task:
        id = "job-123"

    monkeypatch.setattr(worker.scan_target, "delay", lambda target: _Task())
    out = main.scan(ScanRequest(target="naver.com"))
    assert out["job_id"] == "job-123"
    assert out["grade"] == "safe"          # allowlist → 즉시 안전
    assert "async_error" not in out


def test_accuracy_endpoint_shape(monkeypatch):
    monkeypatch.setattr(main, "_accuracy_cache", None)   # 캐시 초기화 후 계산
    m = main.accuracy()
    assert 0.0 <= m["accuracy"] <= 1.0
    assert "precision" in m and "recall" in m and "f1" in m
    assert "misses" not in m               # 응답에서 오분류 목록 제외
