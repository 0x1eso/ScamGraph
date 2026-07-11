# ScamGraph · 프론트(web) + 게이트웨이(gateway) 기획서 〔내 파트〕

> 소유: **`apps/web`(Next.js) + `apps/gateway`(Java/Spring Boot) + 루트 통합(docker-compose) + 브라우저 확장**.
> 짝 문서: 엔진(Python) 계약은 **`docs/engine-spec.md` §4** 참조. 이 문서는 그 계약을 **소비**하는 쪽.

---

## 0. 범위 & 핵심 목표

**당신이 만드는 것:** 심사위원이 보는 **모든 화면**과, 그 화면을 엔진에 연결하는 **게이트웨이**.

- 🎯 **데모 킬샷 (최우선):** 심사위원이 스캔 콘솔에 URL 입력 → 위험도+근거가 뜨고 → **관계망 그래프에 새 노드가 뻗어 나가는** 장면. 이 한 흐름이 표를 만든다.
- 🎯 "학생이 못 만들 규모"로 보이게: 실시간 피드, 대형 관계망 그래프, GPU 지도, 공개 API+Swagger, 다중 서비스가 `docker compose up` 한 방에.

> ⚠️ 전략: 안 보이는 백엔드 정교함이 아니라 **화면에서 살아 움직이는 것**에 힘을 쏟는다. 단, **라이브에서 실제로 동작**해야 하며 시드/폴백으로 **데모 세이프** 확보(§9).

---

## 1. 시스템 위치 & 데이터 흐름

```
[web · Next.js :3000]  ──REST──▶  [gateway · Spring Boot :8080]  ──REST──▶  [engine :8000]
        ▲                                     │                                  └▶ Neo4j/Meili/PG/Redis
        └────────────WebSocket(/ws/feed)──────┘  (실시간 신고 브로드캐스트)
```

- 프론트는 **게이트웨이만** 호출한다(엔진 직접 호출 금지). 게이트웨이가 엔진으로 프록시.
- 실시간 피드는 게이트웨이가 WebSocket 허브 역할.

---

## 2. 현재 상태 (스캐폴드 완료 — 재작업 금지)

| 파트 | 항목 | 상태 | 파일 |
|---|---|---|---|
| web | 다크 관제 대시보드 랜딩(스캔콘솔·stat카드·파이프라인) | ✅ **정적 UI만** | `apps/web/app/page.tsx`, `globals.css` |
| web | Next.js 15 / React 19 셋업, Dockerfile, tsconfig | ✅ | `apps/web/*` |
| gateway | Spring Boot(Java 21, 가상스레드) + `/api/health`, `POST /api/scan`(엔진 프록시) | ✅ 동작 | `ScanController.java` |
| gateway | Swagger UI `/docs`, CORS 허용 | ✅ | `application.yml`, `@CrossOrigin` |
| 통합 | docker-compose 8서비스, README, Makefile | ✅ | 루트 |

**아직 없는 것 = 당신의 일:** 그래프/지도/피드 화면, 나머지 게이트웨이 프록시 엔드포인트, WebSocket, 스캔 콘솔 실제 배선, 시각화 라이브러리 설치.

---

## 3. 파일별 역할

```
apps/web/
├── app/
│   ├── page.tsx       # 관제 대시보드 (현재 정적 → 실데이터로 배선)
│   ├── layout.tsx     # 메타/전역
│   └── globals.css    # 디자인 토큰 + 관제실 다크 스타일 (여기 확장)
├── package.json       # ★ sigma/graphology/deck.gl/framer-motion 추가 필요
└── Dockerfile

apps/gateway/
├── src/main/java/io/scamgraph/gateway/
│   ├── GatewayApplication.java
│   └── ScanController.java   # /scan 프록시 패턴 — 나머지 엔드포인트도 이 패턴 복붙
└── src/main/resources/application.yml
```

- `ScanController.java`의 `RestClient` 프록시 패턴을 그대로 복사해 `/graph`, `/reports`, `/search` 프록시를 추가하면 된다.

---

## 4. 통합 계약

### 4.1 web → gateway (프론트가 호출할 게이트웨이 API)

| 메서드 | 경로 | 용도 | 상태 |
|---|---|---|---|
| `POST` | `/api/scan` | 대상 스캔 → 위험도+근거 | ✅ |
| `GET` | `/api/graph?limit=500` | 전체 관계망(nodes/edges) | 🚧 |
| `GET` | `/api/graph/expand?value=<node>` | 특정 노드 이웃 확장 | 🚧 |
| `GET` | `/api/reports?limit=50` | 최근 신고(피드 초기 로드) | 🚧 |
| `POST` | `/api/report` | 신고 등록 | 🚧 |
| `GET` | `/api/search?q=` | 위협 엔티티 검색 | 🚧 |
| `GET` | `/api/stats` | stat 카드용 집계수치 | 🚧 |
| `WS` | `/ws/feed` | 실시간 신고/스캔 스트림 | 🚧 |

응답 JSON 모양은 **engine-spec.md §4.1과 동일**(게이트웨이는 대부분 그대로 프록시). 특히 `/api/graph`:
```json
{ "nodes": [{ "id","label","type","grade","risk_score" }],
  "edges": [{ "source","target","type" }] }
```
`type` ∈ `Campaign|Target|Host|IP|Phone|Account|Report`, `grade` ∈ `safe|caution|warning|danger`.

### 4.2 gateway → engine (프록시 대상)

`ScanController`처럼 `RestClient.create(engineUrl)`로 엔진(`:8000`)의 동일 경로 호출 후 결과 반환. 엔진이 죽어도 게이트웨이는 **폴백 JSON**을 주도록(현 `/scan` 참고 = 데모 세이프).

### 4.3 WebSocket 실시간 피드 (`/ws/feed`)

- 게이트웨이가 STOMP 또는 순수 WebSocket 허브. 신규 신고/스캔 발생 시 전 클라이언트에 브로드캐스트.
- 데모 세이프: 실이벤트가 없어도 **주기적 더미 이벤트**(시드 신고 순환)를 흘려 화면이 "살아있게".
- 메시지 예: `{ "type":"scan", "target":"...", "grade":"danger", "ts":... }`

---

## 5. 할 일 — 데모 임팩트 우선순위 (크리티컬 패스)

### Phase A — 킬샷 端투端 배선 〔최우선〕
1. **package.json에 시각화 deps 추가 + 설치**
   ```bash
   cd apps/web && npm i sigma graphology graphology-layout-forceatlas2 deck.gl framer-motion
   ```
   - DoD: `npm run dev`로 빌드 성공.
2. **스캔 콘솔 실제 배선** — `page.tsx` 입력창 → `POST /api/gateway/scan` → 위험 게이지 + 근거 카드 렌더.
   - DoD: `shinhan-otp.xyz` 입력 시 danger 73 + 근거 3개가 화면에 뜬다.
3. **게이트웨이 `/api/graph` 프록시** — 엔진 `/graph`로 프록시.
   - DoD: `curl :8080/api/graph`가 시드 nodes/edges 반환.
4. **Sigma.js 관계망 탐색기** — 시드 그래프를 force layout으로 렌더, 줌/드래그, 노드색=grade.
   - DoD: 브라우저에서 사기 조직 관계망이 보이고 인터랙션 됨.
5. **킬샷 연결** — 스캔 성공 시 `/api/graph/expand?value=<입력>` 호출 → 새 노드가 그래프에 **애니메이션으로 추가**.
   - DoD: 입력 → 그래프가 뻗는 장면 완성.

### Phase B — 규모/스펙터클
6. **실시간 신고 피드** — 게이트웨이 `/ws/feed` + web 사이드 패널 스트리밍.
7. **deck.gl 지도** — 위협 좌표 표시(좌표는 §9 조율 참고).
8. **stat 카드 실데이터** — `/api/stats` 집계로 교체(현재 하드코딩).
9. **검색 UI** — `/api/search` 연동.

### Phase C — "회사처럼 보이게"
10. **공개 API 키 발급 + Swagger 정리**(`/docs` 다듬기), 레이트리밋.
11. **브라우저 확장** — 방문 사이트를 `/api/scan` 조회 → 위험 시 경고 배너 주입.

---

## 6. 화면 설계 (web)

단일 대시보드(`/`) 중심 + 필요 시 `/graph` 전체화면.

```
┌─ 상태바: SYSTEM ONLINE · 서비스 LED (있음) ─────────────┐
├─ 히어로 + 스캔 콘솔 (있음 → 배선)                        │
├─ [좌] 관계망 그래프(Sigma.js)      [우] 실시간 신고 피드 │
├─ stat 카드 4개 (있음 → 실데이터)                         │
├─ GPU 지도(deck.gl)                                       │
└─ 검색 바 + 결과                                          │
```
- 디자인 토큰은 `globals.css`에 이미 정의(다크·네온). 그래프/지도도 이 팔레트로 통일(데이터 시각화를 디자인 시스템의 일부로).

---

## 7. 실행/개발법

```bash
# 전체
cd /home/eser/dev/makertone && make up && make seed

# 프론트만 빠르게 (게이트웨이는 docker로 띄워둔 채)
cd apps/web && npm install && npm run dev            # :3000

# 게이트웨이만 (JDK 21+; 로컬 JDK 25면 컨테이너 빌드 권장)
docker compose up --build gateway
# 또는 로컬: gradle bootRun  (gradle 필요, 없으면 wrapper 생성)
```
- 프론트 환경변수: `NEXT_PUBLIC_GATEWAY_URL`(기본 `http://localhost:8080`).
- Swagger 확인: http://localhost:8080/docs

---

## 8. 라이브러리 선택 (있어 보이는 것 우선)

| 용도 | 선택 | 비고 |
|---|---|---|
| 관계망 그래프 | **Sigma.js + graphology** | 수천 노드 렌더, 팔란티어 비주얼 |
| 그래프 레이아웃 | forceatlas2 | 유기적 배치 |
| GPU 지도 | **deck.gl** | "GPU 가속" flex |
| 모션 | framer-motion | 노드 등장/카운터 애니메이션 |
| 실시간 | 브라우저 `WebSocket` API | 게이트웨이 `/ws/feed` |
| 게이트웨이 | Spring Web + WebSocket + springdoc | 이미 의존성 있음 |

---

## 9. 철칙 & 조율 포인트

**철칙**
1. 프론트는 게이트웨이만 호출(엔진 직접 호출 금지).
2. **데모 세이프** — 그래프/피드/지도는 백엔드가 죽어도 **시드/더미로 렌더**되게. 스캔 실패 시에도 UI가 안 깨지게.
3. 스키마 변경은 계약(§4) 기준으로 엔진 담당과 협의.

**엔진 담당과 협의할 것**
- `/graph`·`/graph/expand`·`/reports`·`/search`·`/stats` 엔드포인트 **경로/응답 확정** (engine-spec Phase 2).
- **지도 좌표**: deck.gl은 lat/lng 필요. → 엔진이 IP 노드에 GeoIP(GeoLite2)로 좌표를 붙여줄지, 아니면 프론트가 시드 좌표를 쓸지 결정. (데모용이면 시드 좌표가 가장 안전)
- WebSocket 이벤트 포맷.

**분업 요약:** 나(web+gateway)는 §4 계약을 **소비**, 엔진 담당은 §4를 **제공**. 계약만 지키면 서로 안 기다리고 병렬 개발 가능.
