# ScamGraph 관측성(Observability)

Prometheus + Grafana 기반 메트릭 스택. **기존 8개 서비스에 영향 없는 부가(additive) 구성**이며,
데이터 소스가 죽어도 대시보드/메트릭 노출은 그대로 동작한다(데모 세이프).

## 구성 요소

| 서비스 | 이미지 | 호스트 포트 | 역할 |
|---|---|---|---|
| prometheus | `prom/prometheus:v3.1.0` | `9090` | 게이트웨이·엔진 메트릭 스크레이프(10초 주기, 6h 보존) |
| grafana | `grafana/grafana:11.4.0` | `3000` | 대시보드(익명 접속 허용, 다크 테마) |

> `web` 은 호스트 포트 `3001` 을 쓰므로 Grafana `3000` 과 충돌하지 않는다.

## 노출 엔드포인트

| 대상 | 엔드포인트 | 방식 |
|---|---|---|
| Gateway (Spring/Micrometer) | `http://gateway:8080/actuator/prometheus` | Actuator + `micrometer-registry-prometheus` |
| Gateway 헬스 | `http://gateway:8080/actuator/health` | Actuator |
| Engine (FastAPI) | `http://engine:8000/metrics` | `prometheus_client` ASGI 앱 |

`RateLimitFilter` 는 `/api/**` 에만 적용되므로 `/actuator/**` 스크레이프는 레이트 리밋 대상이 아니다.

## 주요 메트릭

**게이트웨이(Micrometer 표준)**
- `http_server_requests_seconds_count` / `_bucket` — 요청 수·지연(경로·상태별)
- `jvm_memory_used_bytes{area="heap"}` — JVM 힙
- `application="scamgraph-gateway"` 공통 태그

**엔진(커스텀, `apps/engine/app/metrics.py`)**
- `scamgraph_engine_requests_total{method,path,status}` — 요청 총계
- `scamgraph_engine_scan_latency_seconds_bucket` — `POST /scan` 규칙 평가 지연 히스토그램

## Grafana 대시보드

- 자동 프로비저닝: 데이터소스(`Prometheus`, uid `prometheus`) + 대시보드(폴더 `ScamGraph`)
- 파일: `infra/grafana/dashboards/scamgraph-overview.json` (uid `scamgraph-overview`)
- 패널: 게이트웨이/엔진 상태, 요청 처리율, `/scan` 지연 분위수(p50/p95), JVM 힙, 누적 요청 수

## 확인

```bash
make up
open http://localhost:3003            # Grafana → ScamGraph 폴더 → 관측성 개요 (익명 즉시 열람)
open http://localhost:9090/targets    # Prometheus 스크레이프 타깃 UP 확인
curl http://localhost:8080/actuator/prometheus | head
curl http://localhost:8000/metrics | head
```
