# ScamGraph

**실시간 사기·피싱 위협 인텔리전스 플랫폼** — 인터넷에서 사기 인프라를 실시간으로 수집·분석하고, 그 관계망을 그래프와 지도로 시각화해 시민을 보호합니다.

> 메이커톤 주제: *디지털 시민으로서 안전한 디지털 세상을 만드는 방안* (SDG 16 · 10)

---

## 무엇인가

- 의심스러운 **URL / 전화번호 / 계좌번호**를 넣으면, 규칙 엔진 + 공개 데이터로 위험도와 **근거**를 알려줍니다. (설명 가능 — 블랙박스 AI 아님)
- 수집된 도메인·번호·계좌·IP를 **Neo4j 그래프**로 연결해 "사기 조직 인프라"를 시각화합니다.
- **GPU 기반 실시간 지도**(deck.gl)와 **대형 관계망 탐색기**(Sigma.js)로 위협을 보여줍니다.
- 시민 신고가 실시간으로 쌓이고, **공개 API + 검색엔진 + 브라우저 확장**까지 제공합니다.

## 아키텍처 (폴리글랏 마이크로서비스)

```
        ┌──────────────────────────────┐
        │  apps/web  · Next.js (React)  │  deck.gl · Sigma.js · WebSocket
        └──────────────┬───────────────┘
                       │ REST / WS
        ┌──────────────▼───────────────┐
        │ apps/gateway · Java Spring    │  인증 · RBAC · 공개 API+Swagger
        │ Boot (가상 스레드)            │  · WS 허브
        └──────────────┬───────────────┘
                       │ 큐 (Redis)
        ┌──────────────▼───────────────┐
        │ apps/engine · Python FastAPI  │  Playwright/httpx 크롤링
        │ + Celery 워커                 │  · WHOIS/DNS/인증서 · 관계분석
        └──────────────┬───────────────┘
                       │
   ┌───────────┬───────┴────────┬──────────────┐
   ▼           ▼                ▼              ▼
 Neo4j     Meilisearch      PostgreSQL       Redis
(그래프)   (검색엔진)        (메타/신고)      (큐/캐시)
```

## 서비스 구성

| 서비스 | 스택 | 포트 | 역할 |
|---|---|---|---|
| `web` | Next.js 15 / React 19 | 3000 | 관제 대시보드 · 그래프/지도 시각화 |
| `gateway` | Java 21 / Spring Boot | 8080 | API 게이트웨이 · Swagger(`/docs`) · WS |
| `engine` | Python / FastAPI | 8000 | 크롤링·분석 API |
| `worker` | Python / Celery | — | 비동기 크롤링·그래프 적재 |
| `neo4j` | Neo4j 5 | 7474/7687 | 관계망 그래프 DB |
| `meilisearch` | Meilisearch | 7700 | 자체 검색엔진 |
| `postgres` | PostgreSQL 16 | 5432 | 신고·메타데이터 |
| `redis` | Redis 7 | 6379 | Celery 브로커 · 캐시 |

## 빠른 실행

```bash
# 전체 플랫폼 한 방에 (컨테이너 8개)
make up          # = docker compose up --build

# 그래프 시드 데이터 주입 (neo4j 뜬 뒤)
make seed
```

접속:
- 대시보드 → http://localhost:3000
- API 문서(Swagger) → http://localhost:8080/docs
- Neo4j 브라우저 → http://localhost:7474 (neo4j / scamgraph123)
- 엔진 API 문서 → http://localhost:8000/docs

## 프로젝트 구조

```
.
├── apps/
│   ├── web/       Next.js 프론트엔드 (관제 대시보드)
│   ├── gateway/   Spring Boot API 게이트웨이
│   └── engine/    FastAPI + Celery 크롤링/분석 엔진
├── infra/
│   ├── neo4j/     그래프 시드(seed.cypher)
│   └── postgres/  스키마(init.sql)
├── docker-compose.yml
└── Makefile
```

## 팀 역할 분담(제안)

- **게이트웨이/백엔드 (Java)** — Spring Boot API, 인증/RBAC, Swagger, WebSocket 허브
- **엔진 (Python)** — 크롤러, 규칙 엔진, WHOIS/DNS 수집, Neo4j 적재, 검색 색인
- **프론트 (TS/React)** — 관제 대시보드, Sigma.js 그래프, deck.gl 지도, 실시간 피드

## 파트별 기획서 (분업)

| 파트 | 담당 | 문서 |
|---|---|---|
| 분석 엔진 (Python) | 엔진 담당 | [`docs/engine-spec.md`](docs/engine-spec.md) |
| 프론트(web) + 게이트웨이(Java) | 통합 담당 | [`docs/web-gateway-spec.md`](docs/web-gateway-spec.md) |

> 두 파트의 유일한 접점은 **API 계약**(engine-spec §4 = web-gateway-spec §4). 계약만 지키면 병렬 개발 가능.

## 로드맵

- [x] 모노레포 · docker-compose · 서비스 뼈대
- [ ] 규칙 엔진 확장(퓨니코드/타이포스쿼팅/리다이렉트/인증서)
- [ ] Neo4j 관계 모델 + 그래프 쿼리 API
- [ ] Sigma.js 관계망 탐색기 · deck.gl 지도
- [ ] 실시간 신고 피드(WebSocket)
- [ ] 공개 API 키 발급 + Swagger 정리
- [ ] 브라우저 확장
- [ ] 시드 데이터 대량 주입(데모 세이프)

> ⚠️ 데모 세이프: 라이브 크롤링이 실패해도 되도록 시드 그래프를 미리 적재하고, `quick_assess`(무네트워크 규칙 평가)로 항상 즉시 결과가 나오게 설계되어 있습니다.
