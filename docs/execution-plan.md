# ScamGraph 로드맵 실행 계획 (트래킹)

> `docs/roadmap.md` 전체를 병렬 트랙으로 실행. 2웨이브 분할. 각 트랙은 **disjoint 파일 소유**.
> 상태: ⬜ 대기 · 🟡 진행 · ✅ 완료 · ⚠️ 소스온리(런타임 미검증) · 📄 문서

## Wave 0 — 공유 파운데이션 (오케스트레이터 전담)
공유 파일을 선점해 트랙은 신규 파일만 만지게 한다.

| 항목 | 파일 | 상태 |
|---|---|---|
| 신규 PG 스키마(subscriptions·alerts·appeals·report_events) | `infra/postgres/init.sql` | 🟡 |
| 블록리스트 배포 계약(snapshot·delta·manifest) | `gateway/BlocklistController.java` | 🟡 |
| 규칙 공유 정의(모바일 Dart 패리티) | `contracts/rules.json` | 🟡 |
| 통합(page.tsx·globals.css)·의존성·compose | 오케스트레이터 전담 | — |

## Wave 1A — 병렬 (7트랙)
| # | 트랙 | 소유 파일 | 검증 | 상태 |
|---|---|---|---|---|
| T1 | 엔진 정확도·신호 | `engine/app/crawler.py`, `eval/`, `tests/` | pytest | ⬜ |
| T3 | 피드 확장 | `engine/app/feeds/*`(신규), `tests/` | pytest | ⬜ |
| T5 | Case File PDF | `gateway/CasePdfController.java`, `build.gradle` | curl→PDF | ⬜ |
| T7 | 웹 데모·디자인 | 신규 web 컴포넌트(예시칩·story·evidence path·간편/분석) | build+샷 | ⬜ |
| T9 | 크롬 확장 MV3 | `apps/extension/*` | manifest 검증 | ⚠️ |
| T10 | 모바일 Flutter | `apps/mobile/*` | dart analyze | ⚠️ |
| T12 | 법률·개인정보 문서 | `docs/*` | 문서 | 📄 |

## Wave 1B — 병렬 (5트랙)
| # | 트랙 | 소유 파일 | 검증 | 상태 |
|---|---|---|---|---|
| T2 | 그래프 분석(Louvain·centrality) | `engine/app/graph_analytics.py` + `gateway/GraphAnalyticsController.java` | curl | ⬜ |
| T4 | 알림·구독·이의제기 API | `gateway/AlertController.java`·`AppealController.java` | compile+curl | ⬜ |
| T6 | 신고 poisoning 방어 | `gateway/ReportController.java`(+service) | curl | ⬜ |
| T8 | 웹 알림/이의제기/Observatory UI | 신규 web 컴포넌트 | build+샷 | ⬜ |
| T11 | 인프라·관측성 | otel/prometheus/grafana config·health·`docker-compose.yml`·`build.gradle` | compose up | ⬜ |

## 공유 계약
- `GET /api/blocklist/manifest` → `{version, generated_at, count, hash, signature}`
- `GET /api/blocklist/snapshot` → `{version, hash, entries:[{value,kind,source,severity}]}`
- `GET /api/blocklist/delta?since=<version>` → `{from,to,added:[...],removed:[...]}`
- 스캔결과 reason: `{rule,weight,detail,source?,first_seen?,confidence?}`
- 전 트랙: 데모 세이프(시드/폴백), 프론트는 게이트웨이만 호출, 순수 SW·AI 금지.
