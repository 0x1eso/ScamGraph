# ScamGraph · 분석 엔진(Python) 기획서 / 핸드오프 문서

> 담당자에게 이 문서 하나만 넘기면 독립적으로 작업 가능하도록 작성됨.
> 대상 디렉터리: **`apps/engine`** · 언어: **Python 3.12** · 스택: **FastAPI + Celery + Neo4j + Meilisearch + Postgres**

---

## 0. 한 줄 요약 & 담당 범위

**당신이 소유하는 것:** 사기·피싱 위협을 분석하는 백엔드 엔진 전체.
입력(URL/전화/계좌)을 받아 **규칙 기반으로 위험도를 산출**하고, **크롤링으로 인프라를 수집**해 **Neo4j 관계망에 적재**하고, **검색 색인**을 만들고, 프론트/게이트웨이가 쓸 **API를 제공**한다.

- ✅ 담당: `apps/engine/**`, `infra/neo4j/seed.cypher`, `infra/postgres/init.sql`(스키마 협의)
- ❌ 비담당: 프론트(web), 게이트웨이(gateway/Java) — **API 계약(4장)으로만 연결**된다.

> ⚠️ **철칙 3가지 (8장 상세):** ① 순수 SW, **AI 금지** ② 모든 판정은 **근거(reason)를 설명**할 것 ③ **데모 세이프** — 네트워크/외부DB가 죽어도 즉시 결과가 나와야 함.

---

## 1. 전체 시스템에서의 위치

```
[web · Next.js]  →  [gateway · Java/Spring :8080]  →  [engine · FastAPI :8000]  ← 당신
                                                          │  └→ Celery worker (비동기 크롤링/적재)
                                                          ▼
                                    [Neo4j :7687]  [Meilisearch :7700]  [Postgres :5432]  [Redis :6379]
```

- 프론트는 게이트웨이만 호출하고, 게이트웨이가 엔진(`:8000`)으로 위임한다.
- 단, **그래프 조회/검색 같은 read-heavy API는 게이트웨이가 엔진으로 그대로 프록시**하므로, 엔진의 응답 스키마(4장)가 곧 프론트가 그리는 데이터다. **스키마를 바꾸면 프론트/게이트웨이와 반드시 협의.**

---

## 2. 현재 상태 (이미 되어 있음 — 재작업 금지)

| 항목 | 상태 | 파일 |
|---|---|---|
| FastAPI 앱 + `/health`, `/scan` | ✅ 동작 | `app/main.py` |
| **규칙 엔진**(퓨니코드·타이포스쿼팅·브랜드사칭·피싱키워드·IP호스트·TLD 등) | ✅ 동작·검증됨 | `app/crawler.py` `quick_assess()` |
| 입력 분류(url/phone/account) | ✅ | `app/crawler.py` `classify_target()` |
| 크롤링·enrich(리다이렉트·WHOIS·DNS) | ✅ 뼈대(best-effort) | `app/crawler.py` `crawl_and_enrich()` |
| Celery 워커 | ✅ | `app/worker.py` |
| Neo4j 적재(Target/Host/IP) | ⚠️ 부분 | `app/graph.py` `upsert_scan()` |
| 그래프 시드 데이터 | ✅ | `infra/neo4j/seed.cypher` |
| Postgres 스키마(scans/reports/api_keys) | ✅ 스키마만 | `infra/postgres/init.sql` |
| Docker/compose 통합 | ✅ | `apps/engine/Dockerfile`, 루트 `docker-compose.yml` |

**검증된 규칙 엔진 출력 예시** (실제 실행 결과):
```
kbstat-secure.click  -> danger 76  [typosquatting, suspicious_tld, phishing_keywords]
shinhan-otp.xyz      -> danger 73  [brand_impersonation, suspicious_tld, phishing_keywords]
naver.com            -> safe    0  []   ← 오탐 없음
```

---

## 3. 디렉터리 & 파일별 역할

```
apps/engine/
├── Dockerfile
├── requirements.txt
└── app/
    ├── __init__.py
    ├── main.py       # FastAPI 엔드포인트 (동기 API)
    ├── worker.py     # Celery 태스크 (비동기 크롤링/적재)
    ├── crawler.py    # ★ 규칙 엔진 + 크롤러 (핵심 로직)
    └── graph.py      # Neo4j 드라이버 + 적재(upsert)
```

- `crawler.py`
  - `quick_assess(target) -> dict` : **무네트워크** 규칙 평가 → `{kind, risk_score, grade, reasons}`. 데모 세이프의 핵심.
  - `crawl_and_enrich(target) -> dict` : quick_assess + 실제 네트워크(httpx 리다이렉트 / WHOIS / DNS). 실패해도 예외 없이 부분결과.
  - `classify_target`, `_host_of`, `_levenshtein` : 유틸.
  - 상수: `KNOWN_BRANDS`, `SUSPICIOUS_TLDS`, `PHISH_KEYWORDS` — **여기 추가하면 탐지력이 늘어난다.**
- `graph.py` : `driver()`(지연 초기화), `upsert_scan(result)`. **현재 Target/Host/IP만 적재** → Phone/Account/Campaign 확장이 당신 몫.
- `main.py` : `/scan`은 `quick_assess`로 즉답 후 Celery로 비동기 크롤링 트리거(브로커 죽어도 즉답).

---

## 4. 인터페이스 계약 (가장 중요)

> 이 계약이 프론트·게이트웨이와의 유일한 접점이다. **JSON 모양을 지켜라.**

### 4.1 REST API

#### ✅ (구현됨) `GET /health`
```json
{ "service": "engine", "status": "up" }
```

#### ✅ (구현됨) `POST /scan`
요청:
```json
{ "target": "shinhan-otp.xyz" }
```
응답:
```json
{
  "target": "shinhan-otp.xyz",
  "job_id": "b1c2-...",          // 비동기 크롤링 잡 ID (브로커 없으면 null)
  "kind": "url",                 // url | phone | account
  "risk_score": 73,              // 0~100
  "grade": "danger",             // safe | caution | warning | danger
  "reasons": [
    { "rule": "brand_impersonation", "weight": 35, "detail": "'shinhan' 브랜드명이 …" }
  ]
}
```

#### 🚧 (구현 필요) `GET /scan/{job_id}` — 비동기 결과 조회
Celery 결과 백엔드(Redis)에서 상태/결과 반환.
```json
{ "job_id": "...", "state": "SUCCESS", "result": { ...enrichment 포함 전체... } }
```

#### 🚧 (구현 필요, **프론트 최우선**) `GET /graph` — 관계망 조회
Sigma.js가 그대로 그릴 수 있는 노드/엣지 포맷.
```json
{
  "nodes": [
    { "id": "shinhan-otp.xyz", "label": "shinhan-otp.xyz", "type": "Target", "grade": "danger", "risk_score": 73 },
    { "id": "203.0.113.44", "label": "203.0.113.44", "type": "IP" }
  ],
  "edges": [
    { "source": "shinhan-otp.xyz", "target": "203.0.113.44", "type": "HOSTED_ON" }
  ]
}
```
- 쿼리 파라미터: `?limit=500` (기본), 전체 그래프 or 하위 집합.
- node.type ∈ `Campaign|Target|Host|IP|Phone|Account|Report`.

#### 🚧 (구현 필요) `GET /graph/expand?value=<node>` — 특정 노드 이웃 확장
데모 킬샷용: 입력한 대상과 **연결된 인프라를 뻗어서** 반환(위 `/graph`와 동일 스키마, 해당 노드 기준 N-hop).

#### 🚧 (구현 필요) 신고 API
- `POST /report` `{target, kind, note}` → Postgres `reports` insert.
- `GET /reports?limit=50` → 최근 신고 목록(실시간 피드용).

#### 🚧 (구현 필요) `GET /search?q=` — 자체 검색엔진(Meilisearch)
색인된 위협 엔티티 전문검색 결과.

### 4.2 Neo4j 그래프 스키마 (`infra/neo4j/seed.cypher` 참고)

| 노드 라벨 | 속성 |
|---|---|
| `Campaign` | name, type |
| `Target` | value, kind, grade, risk_score, last_seen |
| `Host` | name |
| `IP` | addr |
| `Phone` | number, carrier |
| `Account` | number, bank |
| `Report` | source, note, ts |

관계: `USES`, `RESOLVES_TO`, `HOSTED_ON`, `CONTACT`, `PAYOUT`, `REPORTS`
> 핵심 인사이트: **여러 Target이 같은 IP에 `HOSTED_ON` → 동일 조직**. 이 "공유 인프라로 연결 발견"이 데모의 하이라이트다. `upsert_scan`에서 이 관계를 잘 만들어라.

### 4.3 Postgres 스키마 (`infra/postgres/init.sql`)
`scans`(스캔 이력), `reports`(시민 신고), `api_keys`(공개 API 키). **현재 엔진이 여기 안 씀** → 스캔/신고 저장 연결이 당신 몫.

---

## 5. 할 일 (우선순위별 · 각 완료조건 포함)

### Phase 2 — 통합 (지금 집중)
1. **`GET /graph` + `GET /graph/expand`** 〔프론트 최우선〕
   - DoD: 시드 데이터가 4.1의 nodes/edges 스키마로 반환되고, 브라우저에서 `curl`로 확인됨.
2. **`upsert_scan` 확장** — Phone/Account/Campaign 노드·관계 추가, 공유 IP 연결 로직.
   - DoD: URL 스캔 시 Host·IP가, 전화/계좌 스캔 시 해당 노드가 그래프에 생기고, 같은 IP면 자동 연결.
3. **Postgres 연동** — 스캔 결과를 `scans`에, 신고를 `reports`에 저장. `POST /report`, `GET /reports`.
   - DoD: 스캔하면 `scans`에 row가 쌓이고, `GET /reports`가 최근 신고를 반환.
4. **`GET /scan/{job_id}`** — 비동기 크롤링 결과 조회.

### Phase 3 — 깊이/스펙터클 (여유 시)
5. **Meilisearch 색인 + `GET /search`** — 위협 엔티티 전문검색("자체 검색엔진" 데모용).
6. **크롤러 강화** — 리다이렉트 체인 상세, TLS 인증서 정보, 외부 블록리스트 대조(PhishTank / urlscan.io / Google Safe Browsing — 무료 API 키). **각 소스는 실패해도 무시(best-effort)**.
7. **규칙 확장** — `KNOWN_BRANDS`/`PHISH_KEYWORDS` 보강, 신규 규칙(단축URL 전개 등).
8. **대량 시드** — 데모용 그래프를 수백~수천 노드로 부풀리는 생성 스크립트(그래프가 "커 보이게").

---

## 6. 로컬 개발 방법

### A. Docker (권장 — 의존 서비스까지 한 번에)
```bash
cd /home/eser/dev/makertone
docker compose up --build engine worker neo4j redis postgres meilisearch
# 코드 수정 시 engine은 --reload로 자동 반영 (compose에 볼륨 마운트됨)
make seed          # neo4j 시드 주입
```
확인: http://localhost:8000/docs (Swagger)

### B. venv (엔진만 빠르게)
```bash
cd apps/engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# 규칙 엔진만 즉시 테스트 (의존 서비스 불필요):
python -c "from app.crawler import quick_assess; print(quick_assess('shinhan-otp.xyz'))"
# API 실행:
uvicorn app.main:app --reload --port 8000
# 워커 실행(별도 터미널, Redis 필요):
celery -A app.worker.celery_app worker --loglevel=info
```

---

## 7. 환경변수 · 의존성

환경변수(`.env.example` 참고): `REDIS_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `MEILI_URL`, `MEILI_KEY`.
의존성(`requirements.txt`): fastapi, uvicorn, celery, redis, neo4j, httpx, python-whois, dnspython, pydantic, meilisearch, tldextract.
> 새 라이브러리는 `requirements.txt`에 **버전 고정**해서 추가.

---

## 8. 반드시 지킬 규칙

1. **순수 SW, AI/ML 금지.** 판정은 명시적 규칙으로만. (전략상 "설명 가능성"이 세일즈 포인트)
2. **모든 판정에 `reasons` 첨부.** 점수만 주지 말고 왜 그런지(rule/weight/detail)를 남겨라.
3. **데모 세이프.** 외부 네트워크·DB·브로커가 죽어도 API는 예외 없이 **즉시** 결과를 반환해야 한다. 네트워크 호출은 전부 `try/except` + 타임아웃. (`quick_assess`는 절대 네트워크 호출하지 말 것.)
4. **스키마(4장)를 바꾸면 프론트·게이트웨이 담당과 협의.**

---

## 9. 다른 파트와의 경계 (조율 포인트)

| 상대 | 접점 | 합의 필요 사항 |
|---|---|---|
| 게이트웨이(Java) | `POST /scan`, `GET /graph*`, `GET /reports`, `GET /search` | 엔드포인트 경로·요청/응답 JSON |
| 프론트(web) | 위 API의 **응답 스키마** | 특히 `/graph` nodes/edges 포맷, grade 값 |
| 인프라 | Neo4j/Postgres 스키마 | 노드 라벨·관계·테이블 컬럼 변경 시 공유 |

**질문/변경은 API 계약(4장)을 기준으로.** 계약만 지키면 세 파트가 병렬로 독립 개발 가능하다.
