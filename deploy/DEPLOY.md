# ScamGraph 배포 가이드 (갤러리 워크 발표용)

> "컴퓨터마다 복사·의존성 설치" 없이 발표하기. **필요한 건 Docker 하나뿐** — 나머지는 전부 컨테이너 안에 있다.

## 전제
- 발표/데모 머신에 **Docker + Docker Compose**만 설치돼 있으면 됨. (Node/Java/Python/DB 등 **개별 설치 불필요**)

---

## 시나리오 A — 발표 노트북에서 원커맨드 (기본)
인터넷 되는 환경에서 최초 1회 빌드:
```bash
make demo        # 빌드 → 기동 → 헬스대기 → 시드 → URL 안내
```
→ 대시보드 http://localhost:3001 · API문서 :8080/docs · Grafana :3003 · Prometheus :9090 · Neo4j :7474

중지: `make down`

## 시나리오 B — 오프라인 머신 (인터넷 없는 전시장)
인터넷 되는 곳에서 **번들을 미리 만들어** 두고:
```bash
make bundle      # 전 이미지를 deploy/scamgraph-images.tar.gz 로 저장(수 GB)
```
전시장 머신에는 **repo 전체 + deploy/scamgraph-images.tar.gz** 만 복사한 뒤:
```bash
make demo        # 번들을 자동 감지 → docker load → 기동 (재빌드·인터넷 불필요)
```

## 시나리오 C — 관람객이 폰으로 직접 체험 (공개 URL)
데모가 떠 있는 상태에서 다른 터미널:
```bash
make tunnel      # cloudflared 공개 https URL 생성 (계정 불필요)
# → https://<random>.trycloudflare.com 출력
make qr URL=https://<random>.trycloudflare.com   # QR 코드 생성 → 관람객이 스캔
```
관람객이 QR을 찍으면 자기 폰에서 대시보드를 열고 직접 스캔 체험 가능.
> 터널은 발표 노트북이 켜져 있는 동안만 유효(임시 URL). 발표장 벽/스탠드에 QR 붙여두면 편함.

## 시나리오 D — 내 도메인으로 공개 (scamgraph.eserlic.cloud) ★
관람객이 자기 폰에서도 스캔이 되려면 **웹과 게이트웨이가 같은 오리진**이어야 한다(폰의 localhost엔 게이트웨이가 없음).
→ 웹은 접속 오리진을 **런타임 감지**해 도메인(localhost 아님)에선 상대경로 `/api`·`/ws` 를 호출하고
(관람객 폰에서도 동작), cloudflared 명명 터널이 `/api`·`/ws`는 게이트웨이(:8080)로 나머지는 웹(:3001)으로
**경로 분기**한다. 서브도메인 하나·CORS 없음. (별도 env 설정 불필요 — 자동 감지.)

**최초 1회 (본인 Cloudflare 계정 — eserlic.cloud가 Cloudflare DNS에 있어야 함):**
```bash
cloudflared tunnel login
cloudflared tunnel create scamgraph
cloudflared tunnel route dns scamgraph scamgraph.eserlic.cloud
cp deploy/cloudflared/config.example.yml deploy/cloudflared/config.yml
#   → config.yml 의 <TUNNEL_ID> 와 credentials-file 경로를 실제 값으로 채움
```

**매 발표:**
```bash
make serve          # 스택 기동 (= make up)
make tunnel-domain  # https://scamgraph.eserlic.cloud 공개
```
관람객: `scamgraph.eserlic.cloud` 접속(또는 QR). 브라우저는 한 오리진만 보고, 스캔/그래프/실시간 피드 모두 동작.

**로컬에서 same-origin 검증(도메인 없이 미리 확인):**
```bash
make serve          # 스택 기동
make proxy          # Caddy 리버스 프록시 → http://localhost:8088
#   → :8088 에서 대시보드+API가 한 오리진으로 동작하는지 확인
```
> Cloudflare 없이 공인 IP VPS면: `make serve` 후 `deploy/Caddyfile` 의 `:8088` 을 `scamgraph.eserlic.cloud`
> 로 바꿔 Caddy가 자동 TLS(Let's Encrypt) 발급 — cloudflared 없이도 배포 가능.

---

## 데모 세이프
- 외부 네트워크·피드·DB가 죽어도 UI/API는 시드·폴백으로 즉시 응답(빈 화면 없음).
- `quick_assess`는 네트워크 무접촉 → 인터넷 없이도 스캔 즉답.

## 킬샷 시연 순서
1. 대시보드 스캔 콘솔에 **`shinhan-otp.xyz`** (신한 사칭 · 또는 첫 예시 칩 클릭) → **빨간 '위험' 73점 + 근거 3종** → **관계망 그래프가 뻗어나감**.
2. **`nаver.com`** (혼동 문자·키릴 а) → 정상 `naver.com`과 육안 구분 불가인데 **혼동 문자 위장으로 탐지**(경고 50점) → homoglyph 근거.
3. 그래프 노드 클릭 → **사건 파일**(조직 전체 인프라 복원).
4. "// 그래프 관제"의 **절단점**(차단 시 조직 분리되는 핵심 인프라).

## 트러블슈팅
| 증상 | 조치 |
|---|---|
| 포트 충돌(3000 등) | 점유 프로세스 종료 또는 compose 포트 매핑 조정(grafana=3003) |
| Neo4j 시드 실패 | 헬스 대기 후 `make seed` 재실행(피드 자동수집으로도 그래프는 채워짐) |
| 이미지 번들 큼 | 정상(수 GB) — USB/외장으로 복사 |
| 터널 URL 안 뜸 | 방화벽/아웃바운드 확인, `make tunnel` 재시도 |
