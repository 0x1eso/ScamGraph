# 게이트웨이 부하 테스트 (k6)

ScamGraph 게이트웨이(Spring Boot · 가상 스레드)가 **초당 몇 건의 위협 스캔을 처리하는지**
보여 주는 데모용 부하 테스트입니다. 헤드라인 숫자는 **초당 처리량(req/s)** 입니다.

## 무엇을 때리나

`scan-load.js`는 실사용 스캔 콘솔 트래픽을 재현합니다.

| 비중 | 요청 | 설명 |
|---|---|---|
| 80% | `POST /api/scan` `{"target":"..."}` | 사기 의심 대상 스캔 (헤드라인) |
| 12% | `GET /api/graph?limit=200` | 관계망 스냅샷 |
| 8%  | `GET /api/stats` | 실시간 지표 |

입력은 한국형 사기 의심 값 12종을 회전 사용합니다 — 은행/포털/간편결제 사칭 URL,
스미싱 발신번호(`010-…`, `+82-…`), 대포통장 의심 계좌번호 혼합.

## 실행 (k6 설치 불필요 · Docker만 있으면 됨)

먼저 전체 스택을 띄웁니다.

```bash
make up        # 게이트웨이 :8080 포함 8개 서비스 기동
```

그다음 부하 테스트를 실행합니다. **Linux (권장, `--network host`)**:

```bash
docker run --rm -i --network host \
  -e BASE_URL=http://localhost:8080 \
  grafana/k6 run - < loadtest/scan-load.js
```

또는 한 방에:

```bash
make loadtest
```

### macOS / Windows (Docker Desktop)

`--network host`가 리눅스 전용이므로, 호스트 게이트웨이를 `host.docker.internal`로 가리킵니다.

```bash
docker run --rm -i \
  -e BASE_URL=http://host.docker.internal:8080 \
  grafana/k6 run - < loadtest/scan-load.js
```

## 튜닝 (환경변수)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `BASE_URL` | `http://localhost:8080` | 게이트웨이 주소 |
| `PEAK_VUS` | `100` | 피크 동시 사용자 수. 더 큰 숫자를 원하면 `-e PEAK_VUS=200` |

```bash
docker run --rm -i --network host \
  -e BASE_URL=http://localhost:8080 -e PEAK_VUS=200 \
  grafana/k6 run - < loadtest/scan-load.js
```

## 부하 프로파일

`0 → 50 (10초) → 100 (20초) → 0 (10초)`, 총 약 40초. (피크는 `PEAK_VUS`로 조절)

## 왜 429가 안 나는가 (레이트 리밋)

게이트웨이는 **클라이언트 IP당 60초 600건** 레이트 리밋으로 단일 남용 클라이언트를 차단합니다.
부하 도구는 한 대라서 IP가 하나뿐이라 이 리밋에 즉시 걸립니다. 스크립트는 매 요청마다
`X-Forwarded-For`를 **약 4096개의 가상 클라이언트 IP**로 회전시켜 "다수의 실사용자"를
모사합니다. 이는 throughput 헤드라인이 나타내려는 현실 시나리오 그 자체이며(한 명이 아니라
수천 명이 동시에 스캔), 안티어뷰즈 리밋이 데모 숫자를 왜곡하지 않게 합니다.
(4096 × 600 = 분당 240만 건 여유)

## 임계값 & "좋은 결과"의 기준

`options.thresholds`:

- `http_req_duration: p(95) < 800ms` — 요청의 95%가 800ms 안에 처리
- `http_req_failed: rate < 0.05` — 오류율 5% 미만

두 임계값을 모두 통과하고 **초당 처리량(req/s)이 높게** 나오면 성공입니다.
가상 스레드 덕분에 피크에서 초당 수백~수천 건이 목표치입니다. 요약 마지막 줄의
`게이트웨이가 초당 약 N건의 위협 스캔 요청을 처리했습니다`가 데모에서 인용할 문장입니다.

> 참고: 엔진(:8000)이 죽어도 게이트웨이는 데모 세이프 폴백으로 200을 반환하므로,
> 오류율은 낮게 유지됩니다. 다만 실제 처리량/지연은 스택이 정상일 때가 가장 인상적입니다.
