# ScamGraph 종합 고도화 기획서 (Roadmap)

> "조금이라도 필요해 보이면 다 넣은" 전체 스코프 로드맵.
> 세 축을 **측정 가능/시연 가능**하게 끌어올린다: **정확도 · 임팩트 · 디자인**.
> (codex 토론 + 프로젝트 컨텍스트 종합. 착수 전 검토용.)

## 범례

- **우선순위** — `P0` 해커톤 전 필수 · `P1` 수상 임팩트 극대화 · `P2` 제품화 핵심 · `P3` 파트너십·규제·대규모 운영
- **축** — 🎯 정확도 · 🚀 임팩트 · 🎨 디자인 · 🛡️ 신뢰/운영
- **원칙 불변**: 순수 SW·AI 금지(설명가능성이 세일즈), 데모 세이프(시드/폴백), `quick_assess` 네트워크 무접촉, 프론트는 게이트웨이만 호출.

## 이미 완료 (재작업 금지)

규칙엔진 24신호+화이트리스트·homoglyph·브랜드임베드 / crawl_enrich(WHOIS·DNS·TLS·폼) / 교차 인프라 귀속 그래프 / 커뮤니티 신고 플라이휠 / 위협피드 수집(OpenPhish·URLhaus·ThreatFox·경찰청) / 정확도 평가 95.6%·오탐0 / 사기조직 사건파일 / 위협 동향 스트립 / 통합 `/api/check` / 킬샷 그래프 연출·티커·Pretendard / 테스트+CI+a11y.

---

## 1. 🎯 정확도 & 신호 엔지니어링

### 1.1 신호 표준화 (P1)
각 신호가 `{id, version, description, observed, scoreDelta, confidence, evidence[], first_seen, last_seen, refutes[]}` 를 반환 → UI에서 "위험도 92점"이 아니라 **"92점이 만들어진 과정"**을 waterfall로 시각화.

### 1.2 URL/도메인 신호 확장 (P1, 🎯)
- UTS#39 confusable **skeleton** 비교(키릴/그리스 넘어 전체 혼동표), NFKC 정규화 전후 diff, zero-width·BiDi(RTL override) 제어문자, IDNA2008 정규화
- Public Suffix List 기반 **정확한 eTLD+1**(현재 `labels[-2]` 근사 → 정식 PSL)
- 브랜드 삽입/삭제/치환/전치 거리 + 키보드 인접 오타, `brand-login`/`brand-security`/`brand-event` 결합 패턴
- open-redirect 악용, 정상 클라우드 하위도메인 악용, 10진수/16진수 IP 표현, 이중 percent-encoding, 비표준 포트, `.zip`/`.mov` 확장자 오인 TLD
- favicon perceptual-hash 재사용, hostname↔page-title 브랜드 불일치, 단축 URL 안전 해제

### 1.3 페이지/폼 신호 (P1, 🎯)
비번+OTP 동시 요구 / 카드·CVC·계좌·주민번호 입력 / form action cross-origin·IP 대상 / 숨은 iframe·투명 overlay / **APK·EXE 다운로드 유도** / **원격제어 앱 설치 유도** / fake CAPTCHA→명령복사(ClickFix "Win+R 붙여넣기") / 표시 URL↔실제 href 불일치 / 표시 전화번호↔`tel:` 불일치 / **QR 목적지 추출 후 재검사** / 난독화 JS·base64 URL. **콘텐츠는 저장 않고 신호만 추출**(개인정보 최소화).

### 1.4 전화/계좌/가상자산 신호 (P1~P2, 🎯)
- 전화: 공공기관 대표번호 사칭(1~2자리 차이), 발신번호↔회신번호 불일치, 단기 신고 급증, 다수 도메인·계좌 연결. **"발신번호는 조작 가능 → 소유자=범죄자 단정 금지"** 표기
- 계좌: 독립 신고자 수·시간 밀집도, 다중 캠페인 재사용, 은행코드·형식 검증. 명의자 정보 미수집 기본
- 가상자산: 공개 블록체인 탐색기로 입출금 관계, 동일 입금주소 공유 사칭 사이트

### 1.5 반증 신호 & 오탐 감소 (P1, 🎯🛡️)
장기 유지 도메인·안정 DNS/인증서 이력·DNSSEC·CT 일관성·공식앱 연결·개인/조직 allowlist·과거 정상판정 반복·서브도메인 탈취 시 루트 전체 악성판정 금지. 판정 등급을 **"안전(근거충분)" vs "아직 악성 미확인"** 으로 분리.

### 1.6 시간 기반 신호 & 인프라 (P1~P2, 🎯)
등록 직후 로그인페이지·인증서 직후 신고·fast-flux(짧은 TTL·ASN/국가 급변)·캠페인 직전 유사도메인 일괄등록·급여일/명절/연말정산 타이밍·차단직후 대체도메인·정상도메인 compromise. → **범죄 인프라 타임라인** UI. RDAP/passive DNS/ASN 평판/CT 선제탐지/SPF·DKIM·DMARC/동일 GTM·Telegram bot·wallet 운영자식별자 재사용.

### 1.7 외부 데이터 소스 (P1~P3, 🎯🚀)
- **무료·즉시**: PhishTank, abuse.ch SSLBL/Feodo, URLScan.io, MalwareBazaar, crt.sh(CT), RDAP, Tranco/Majestic, AlienVault OTX, KISA 보호나라/KrCERT, 공공데이터포털 실연동(활용신청)
- **파트너/유료**: Google Web Risk/Safe Browsing, VirusTotal, SecurityTrails/DomainTools/WhoisXML, AbuseIPDB/GreyNoise/Censys/Shodan, **금융보안원·KISA C-TAS·통신사 스팸평판·더치트 제휴·경찰/금감원 피해정보**
- 소스별 **라이선스·호출한도·재배포 가능여부 registry** 관리. 외부평판은 "정답" 아닌 독립 증거로 표시.

### 1.8 점수 보정·평가 고도화 (P1, 🎯) — *현 95.6% 확장*
규칙별 TP/FP 집계 → likelihood ratio, 중복신호 상한(신생+짧은인증서 이중계산 방지), 채널/브랜드/언어별 임계값 분리, 신고는 Wilson score/Beta-Binomial 신뢰구간+시간감쇠. 평가: ablation·threshold sweep·ROC/PR·혼동행렬, **feed-known vs zero-feed 분리**, 시간순 holdout(미래 누수 방지), redirect 전후 분리. 배지 확장: 표본수·기준일·specificity·최근30일 추이·규칙버전·재현 링크.

### 1.9 그래프 분석 (P1, 🎯🎨) — *스펙터클 + 정확도*
- **커뮤니티 탐지**(Louvain/Leiden)로 캠페인 자동 명명 + **centrality**(degree/betweenness/PageRank/k-core/articulation point)로 핵심 인프라·kingpin 식별 → "동일 조직" 대신 **"동일 캠페인 84%, 근거 4개"**
- **그래프 선제 탐지**: 확인 악성과 인증서/NS 공유하는 신규 도메인, phishing-kit favicon/form-action 재사용, 신규 CT 인증서가 기존 조직에 연결되는 순간 경보, 캠페인 교체주기로 "다음 도메인 등장 예상시간"
- shortest-path evidence("이 두 신고가 같은 조직인 이유"), 시간 slider 캠페인 성장 재생

### 1.10 크롤링/샌드박스 강화 (P2, 🎯🛡️)
Playwright 렌더링(JS 전후 DOM diff), 모바일/데스크톱·한국/해외 IP **cloaking 비교**, referrer/재방문 차이, redirect chain·HAR·screenshot·DOM hash·QR·APK manifest 정적분석. **SSRF 방어**(private IP·metadata endpoint 차단, DNS rebinding, egress 제한, 응답크기·시간 상한, 크롤러 격리망).

---

## 2. 🚀 임팩트 · 도입 · 사업화

### 2.1 알림 & 구독 (P1)
관심 브랜드 사칭 도메인 등록 즉시·특정 번호/계좌 상태변경·내 신고가 "확인된 위협" 승격·캠페인 신규자산 추가·지역/업종 급증. 채널: Web Push·이메일·SMS·모바일 push·Slack/Teams/Discord/Telegram webhook(HMAC 서명·retry·dead-letter·cooldown).

### 2.2 공개 API 제품화 (P1~P2)
`/v1/check/{url,phone,account}` · `/v1/batch/check` · `/v1/campaigns/{id}` · `/v1/feeds/delta` · `/v1/reports` · `/v1/appeals` · `/v1/watchlists` · `/v1/webhooks`. API key 발급/폐기·OAuth2 client credentials·tenant rate limit·사용량 대시보드·idempotency key·응답 서명·cursor pagination·delta+ETag·status page·SDK(Java/Python/TS/Dart)·Postman·sandbox·요금제(free/community/partner/enterprise)·**개인정보 미전송 hash lookup 옵션**.

### 2.3 파트너 데이터 수집 (P2~P3)
STIX 2.1 / TAXII 2.1 / MISP import·export, CSV/NDJSON/S3, signed webhook, 이메일 abuse-report parser, registrar abuse ticket 결과 ingest. source confidence·TLP marking·dedup·provenance·철회/수정 이벤트·PGP 검증·feed health 모니터링.

### 2.4 신고·테이크다운 지원 (P2, 🚀)
registrar/hosting/CDN/CA 자동 식별 → abuse contact 탐색 → **증거 포함 신고서 자동 생성**, 사칭 브랜드 공식채널·URLhaus/PhishTank/Safe Browsing 제출 연계, KISA/경찰/금융기관 경로 안내, ticket 상태 추적, takedown 소요시간 통계, 재등장 인프라 자동 연결. (외부 자동제출은 운영자 검토 후.)

### 2.5 경찰 인계용 Case File PDF (P0~P1, 🚀🎨) — *킬샷의 완결*
사건요약·판정·신뢰도·입력원문·정규화값·전 탐지근거·redirect chain·DNS/WHOIS/TLS·screenshot·연관 전화/계좌/도메인/IP·캠페인 그래프·최초/최근 관측·feed 출처·신고통계·오탐가능성·권장조치·**각 증거 SHA-256·보고서 hash·QR 온라인 검증·서버 서명**. 한/영, **마스킹본 vs 수사용 전체본** 분리. *"법적 증거 확정" 아닌 "수사 참고자료·provenance 제공"* 표기.

### 2.6 임베더블 (P2, 🚀)
"ScamGraph 검증됨" 배지·URL검사 widget·중고거래 판매자 연락처 검사 버튼·커뮤니티 링크 자동경고·결제 직전 계좌검사·언론사 실시간 현황 그래프·지자체/학교 지역경보 배너. iframe/Web Component/npm/WordPress plugin/Slack bot/카카오 채널 검토.

### 2.7 사회적 임팩트 표현 (P0~P1, 🚀🎨)
"오늘 보호한 사용자 수"·"신고→전체 차단 소요시간"·"한 신고로 보호된 사람 수"·"활동 중 범죄 캠페인"·"feed에 없었으나 선제탐지한 수". **금전 피해액은 근거 없으면 직접 추산 금지**(계산식·가정 공개).

---

## 3. 🎨 디자인 · UX · 데모 연출

### 3.1 핵심 데모 시나리오 (P0) — 90초 스토리
입력→100ms quick scan→근거 분해→deep scan 신호 순차 도착→그래프 노드 생성→공유 IP/인증서/전화/계좌로 기존 캠페인 연결→지도 표시→**확장/모바일 동시 전달**→신고→"커뮤니티 보호 수" 증가→**경찰 case file PDF 생성**. 이 한 흐름이 탐지·그래프·실시간·멀티플랫폼·사회적가치를 전부 전달.

### 3.2 판정 시각화 (P1, 🎨)
스캔 진행 10단계를 실제 완료 이벤트에 맞춰 점등(폴백은 seed event 재생) · 위험 waterfall · 위험/반증 **양팔 저울** · 원문↔정규화 URL diff(homoglyph 붉게) · redirect chain을 지하철 노선처럼 · "이 조직에 연결된 이유" evidence path · quick↔deep 판정 변화 애니.

### 3.3 그래프/지도 연출 (P1, 🎨)
새 노드 pulse·증거종류별 edge 색·community 색상·centrality ring·heartbeat·takedown 노드 흐림·**시간 slider 캠페인 성장 재생**·"24h 전→현재"·피해입력→조직 camera fly-through. 지도: 국가집계 vs IP정확위치 구분·GeoIP 오차 표기·"서버 위치≠범죄자 위치" 안내.

### 3.4 대중 친화 이중 모드 (P1, 🎨🛡️)
**간편 모드**("열지 마세요·송금 마세요·공식앱 확인") vs **분석 모드**(규칙·그래프·DNS·증거). 고령자 큰 글씨·색각이상 대응(색+아이콘+텍스트)·WCAG AA·전문용어 tooltip·키보드·reduced-motion·결과공유 시 자동 마스킹.

### 3.5 가이드 데모/온보딩 (P0, 🎨) — *직전 라운드 미채택, 재검토*
"이런 걸 스캔해보세요" 예시 칩(라이브 피싱·룩얼라이크·정상) → 원클릭 킬샷 · 발표자 story mode·전체화면·keyboard shortcut·guided tour · **DEMO 상태 배지**(LIVE/DEGRADED/FALLBACK)·demo reset·WS 자동재연결.

---

## 4. 📱 모바일 앱 — 실시간 사기 **탐지** 고도화

> 정의: "검사 앱"이 아니라 **전화·문자·메신저·브라우저에서 위험 행동 직전에 개입하는 보호 계층**. 현재 Flutter 소스에 CallScreeningService·SMS Receiver 스켈레톤 존재 → 실동작화.

### 4.1 공통 아키텍처 (P0, 🎯) — *가장 인상적*
- **Dart로 `quick_assess()` 완전 포팅**(오프라인 규칙엔진) — Python·Dart가 **동일 규칙 JSON/YAML + golden test corpus 공유**, 규칙ID·점수·설명 일치
- **signed blocklist snapshot + delta**(ETag/If-None-Match·zstd) → **Bloom filter 1차** + exact-match 2차. 서명 검증·실패 시 rollback·Wi-Fi/충전 조건(WorkManager). 원문 로컬처리·서버엔 최소 indicator만.

### 4.2 Android 전화 탐지 (P0, 🎯)
- API: `CallScreeningService`·`CallResponse`·`RoleManager.ROLE_CALL_SCREENING`·`TelecomManager`·`Call.Details`
- 수신번호 **로컬 blocklist 즉시 판정**(짧은 응답제한 → 서버 API 의존 금지). 확인 위험=차단/거절, 주의=알림. 연락처 감점·국제/VoIP/기관사칭 규칙·번호 미표시 정책·통화 후 one-tap 신고·"발신번호 조작 가능" 경고. **통화 녹음/분석 없이 번호·행동 신호만**. 제조사별 호환성 매트릭스.

### 4.3 통화 중 경고 (P1, 🎨) — *보조 기능으로*
heads-up notification 기본 + (동의 시) `SYSTEM_ALERT_WINDOW` overlay(`TYPE_APPLICATION_OVERLAY`·`ACTION_MANAGE_OVERLAY_PERMISSION`). 문구: "검찰·은행은 전화로 OTP/앱설치 요구 안 함"·"끊고 공식앱 번호로 재확인"·"원격제어 앱 설치 요구 시 중단". *Play 정책상 overlay는 필수 아닌 보조.*

### 4.4 TTS 고령자 경고 (P1, 🎨🛡️)
`TextToSpeech`+`AudioManager` → "이 전화는 사기 신고 이력이 있습니다" 음성. 큰 글씨·단순 언어·속도조절·진동·보호자 확인·잠금화면 민감정보 숨김·끌 수 있는 설정. (통화 오디오 직접 삽입은 제한 → 통화 전후 안내 중심.)

### 4.5 SMS·MMS 스미싱 탐지 (P0~P1, 🎯)
- API: `BroadcastReceiver`·`SMS_RECEIVED_ACTION`·`getMessagesFromIntent`·`RoleManager.ROLE_SMS`·`WorkManager`
- 흐름: segment 결합→Unicode/zero-width 정규화→URL(scheme 없는·punycode·**`hxxp`/`[.]` defanged 복원**) 추출→shortener 식별→로컬 규칙·blocklist→(온라인)deep scan→위험 알림+안전 행동 안내→원문 제외 indicator 신고
- 신호: 택배/과태료/부고/청첩장/건강검진 사칭·APK 유도·회신 요구·발신자↔URL 브랜드 불일치·반복 수신
- ⚠️ `RECEIVE_SMS`/`READ_SMS`는 Play 정책 제한 → **기본SMS 역할 필요할 수 있음**. 대체경로(공유검사·notification listener·clipboard) 병행.

### 4.6 공유대상·클립보드 (P0, 🎯) — *권한 부담 낮음, 우선*
- **Sharesheet**: `ACTION_SEND`·`ACTION_PROCESS_TEXT`·`EXTRA_TEXT` → "공유→ScamGraph로 검사"(카톡/텔레그램/메일 무관, 의도 명확, Play 위험 낮음)
- **Clipboard**: `ClipboardManager` foreground 붙여넣기 URL 검사(백그라운드 제한 준수, 자동 서버전송 금지, OTP 자동저장 금지, 분석 후 즉시 폐기)

### 4.7 메신저 링크 탐지 (P2, 🎯🛡️) — *개인정보 강함, 신중*
`NotificationListenerService`로 **사용자 명시 허용 앱**의 notification text URL 추출→로컬 1차 검사→위험 시 경고. 원문 미저장·서버 미전송 기본·앱별 opt-in. (접근성 서비스로 메시지 읽기는 정책/신뢰 위험 커서 지양.)

### 4.8 가족·보호자 모드 (P1, 🚀🎨) — *데모 임팩트 큼*
QR pairing·**피보호자 명시 동의**·위험 전화/문자 시 보호자에 **최소 정보** 알림("어머니가 검찰사칭 의심 전화 수신")·원문 미공유·"송금 전 확인 요청" 버튼·가족 공용 allowlist·**스토킹 악용 방지(연결상태 상시 표시·위치/통화기록/원문 미수집)**·보호자 조회 audit log.

### 4.9 iOS (P2)
- 전화: `CallKit` **Call Directory Extension**(`CXCallDirectoryProvider`·`addBlockingEntry`·`addIdentificationEntry`) — 미리 동기화된 signed blocklist(App Group) 중심(실시간 질의 불가)
- 문자: **IdentityLookup Message Filter**(`ILMessageFilterExtension`·`ILMessageFilterQueryRequest/Response`·`ILMessageFilterAction`) — 미지 발신자 분류, 오프라인 규칙
- 신고: Unwanted Communication Reporting(`ILClassificationUIExtensionViewController`)
- Safari: **Content Blocker**(`SFContentBlockerManager`) + Safari Web Extension + Share/Action Extension + Universal Links, App Group blocklist 공유

### 4.10 운영 품질 (P1~P2, 🛡️)
WorkManager 주기 sync·foreground service는 지속작업만·`EncryptedSharedPreferences`/Keystore·Room(+SQLCipher 검토)·Play Integrity·crash scrub·Baseline Profiles·battery benchmark·Android 8~최신 호환·삼성/샤오미 background 제한 안내·**권한 없어도 수동검사는 항상 작동**.

---

## 5. 🧩 Chrome 확장 프로그램 고도화

> 현재 소스 존재 → 실동작화. 핵심 컨셉: **브라우저 내부 방화벽**(개인정보 보존형).

### 5.1 MV3 개인정보 보존형 즉시 차단 (P0, 🎯🚀) — *최우선*
- API: `declarativeNetRequest`(`updateDynamicRules`/`updateSessionRules`)·`chrome.alarms`·`chrome.storage.local`
- 구조: gateway가 **signed blocklist snapshot+delta** 제공 → SW가 alarms로 주기 sync → ETag·서명·hash 검증 → 확인 위험도메인을 DNR rule로 변환 → **브라우저가 로컬 즉시 차단**. 일반 browsing URL 서버 미전송(방문기록 유출 0), 오프라인 차단, 서버 장애 무관.
- DNR quota 고려(고위험 도메인 중심·압축·shared hosting 전체차단 금지), **allowlist가 우선하도록 rule priority**, 정정 즉시 rule 제거, feed manifest(version·생성/만료시각·hash·signature).

### 5.2 위험 사이트 interstitial (P0~P1, 🎨🛡️)
확인 위협은 **navigation 단계 DNR redirect** → `chrome-extension://.../blocked.html`(원문 URL은 opaque token/session storage). 화면: 큰 경고·차단 이유·homoglyph diff·신고수·최초관측·연관 캠페인·"공식 사이트로"·"오탐 신고"·개인 allowlist·**credential 입력 전 차단** 표시. 미확정 "주의"는 content-script banner.

### 5.3 링크 hover 위험 tooltip (P1, 🎯🎨)
content script `pointerover`+`MutationObserver`·debounce 100~200ms → 실제 href 정규화·표시텍스트↔도메인 비교·로컬 blocklist·punycode 사람이 읽게·registrable domain 강조·viewport 링크만·**Shadow DOM**(레이아웃 안 깨짐)·기본 로컬검사(방문기록 미전송).

### 5.4 폼/credential·OTP guard (P1, 🎯🛡️)
`submit`/버튼 click 관찰 → registrable domain 위험·form action cross-origin·표시브랜드↔domain 불일치·비번+OTP 동시·비번 입력 후 외부 endpoint 전송·다운로드/원격제어 결합 → **제출 일시중단** "비밀번호 보내기 전 도메인 확인". **입력 value는 읽지/저장/전송 안 함**(type·존재·form destination 메타데이터만). 비번관리자 방해 금지 테스트.

### 5.5 우클릭·원클릭 신고·popup·side panel (P1, 🚀🎨)
- `contextMenus`: 링크/전화/계좌/페이지/QR 검사·신고
- **popup**: 현재 탭 위험도·근거 3개·registrable domain·blocklist version·마지막 sync·오늘 차단수·"서버 상세검사" 명시 버튼
- **`chrome.sidePanel`**: 현재 사이트 상세·redirect chain·evidence waterfall·**캠페인 미니 그래프 실시간 성장** ← *발표 시 브라우저 옆 그래프 성장 = 임팩트 큼*

### 5.6 웹메일 피싱 탐지 (P1, 🎯) — *Gmail/Naver*
content script(site별 adapter+generic fallback, `MutationObserver`) → 메일 링크 실제 href↔표시 불일치·shortener·punycode/homoglyph·`mailto`/`tel`/QR·외부발신자·display name↔발신도메인 불일치·"보안팀/공유문서" 사칭·Drive/Naver 공유 가장 외부 URL. **원문/제목/본문 서버 미업로드**(URL만 로컬, deep scan 누른 것만 전송)·domain별 host permission·Shadow DOM·selector 변경 대비 adapter versioning.

### 5.7 다운로드·QR·타임라인 (P2, 🎯)
`chrome.downloads.onCreated` 위험도메인 APK/EXE/ZIP 경고·double-extension·Unicode filename·(동의 시)hash reputation. QR: 이미지 선택→로컬 decode→열기 전 분석. `webNavigation` 로 "광고→단축URL→피싱" chain 로컬 단기보존(신고 시만 전송).

### 5.8 Cross-browser·기업·보안 (P2~P3, 🛡️)
- Edge(Chromium 재사용·SmartScreen 보조), Firefox(`browser.*`·MV3/DNR 지원범위 확인), Safari(Web Extension converter+Content Blocker+App Group)
- 공통: core rules / browser adapter / feed sync / UI / site adapter 패키지 분리·Playwright E2E
- 기업: `storage.managed`·강제 blocklist·조직 gateway·SSO·정책 audit
- 확장 보안: **remote code 금지**(MV3)·CSP 강화·`innerHTML` 최소+DOMPurify·signed feed·schema validation·최소 권한·optional permissions·sender 검증·web-accessible 최소·kill switch(서명)·compromise 대비 IR plan

---

## 6. 🛡️ 인프라 · 운영 · 관측성 · 확장

- **신뢰성**: health/readiness/liveness·timeout budget·retry(backoff+jitter)·circuit breaker·bulkhead·Celery dead-letter·idempotent ingest·feed checkpoint·graceful shutdown·rolling deploy·zero-downtime migration·scan deadline·크롤 domain별 동시성 제한 (P2)
- **관측성**: OpenTelemetry **Next→Gateway→FastAPI→Celery distributed trace**(trace ID를 결과화면에 표시), Prometheus+Grafana, Loki/Tempo, 규칙별 hit·판정 latency p50/95/99(quick/deep 분리)·feed freshness·queue depth·fallback 사용률·SLO burn-rate. SLO 예: quick scan p95<300ms·gateway 99.9%·feed delta<5min·확장 반영 p95<2min (P1~P2)
- **데이터**: canonical entity ID·URL canonicalization version·전화 E.164·append-only observation+materialized view·판정 versioning·soft delete/tombstone·**Postgres↔Neo4j outbox pattern**·CDC 색인갱신·raw event 재처리 (P2)
- **확장**: Redis Streams/Kafka event backbone·scan↔enrichment 분리·stateless gateway 수평확장·Redis pub/sub WS fan-out·Neo4j read replica·PG partitioning·**Bloom/Cuckoo filter 로컬 1차판정**·CDN feed 배포·사전계산 centrality/community (P2~P3)
- **보안**: mTLS·secret manager·key rotation·최소권한 DB·egress allowlist·관리자 MFA·RBAC/ABAC·tenant isolation·API key hashing·audit log·SBOM·SAST/DAST·secret scanning·pinned deps·Cosign 서명·CSP/Trusted Types·SSRF/DNS rebinding 방어·크롤러 격리망 (P2)
- **백업/DR**: PG PITR·Neo4j backup·object versioning·restore drill·RPO/RTO·리전 장애·blocklist 서명키 offline backup·색인은 원본서 재구축 (P2~P3)
- **테스트**: URL parser property-based·Unicode homoglyph fuzzing·IDNA corpus·SSRF payload·rule golden·historical incident replay·contract test·WS reconnect·chaos(외부 feed/Neo4j/Redis 종료)·mobile offline↔online·extension feed corruption·**false-report poisoning 시뮬**·Playwright 발표 시나리오 검증 (P1~P2)

---

## 7. ⚖️ 법률 · 개인정보 · 악용 방지 (P0~P2, 🛡️) — *출시 전 필수*

### 7.1 표현·법적 위험
전화/계좌/도메인을 "사기범"으로 단정 = 명예훼손·개인정보보호·부정확정보 리스크(spoofing·대포통장·계정탈취·도메인 compromise로 소유자≠악용자). **"사기 신고에 사용된 것으로 관측된 발신번호"·"신고 및 연관 정황이 있는 계좌"·"공통 인프라 공유 캠페인 후보"** 표현. 사실/추정/신고 분리·출처·관측시각·불확실성·이의제기중 표시·공개화면 마스킹·검색엔진 색인 제한·reverse lookup/대량수집 방지. **한국 개인정보보호법·형법(명예훼손·업무방해)·통신/금융 규제 실제 법률검토.**

### 7.2 개인정보 최소화
원본 SMS **기기 밖 미전송**(URL/도메인만)·전화는 HMAC lookup·계좌 마스킹/keyed hash·IP/device ID 최소·광고ID 미사용·정확위치 금지·검사기록 opt-in·보존기간·삭제/export 요청·목적별 동의 분리·로그 redaction·at rest/in transit 암호화·**개인정보 영향평가(DPIA)**·국외이전 고지.

### 7.3 신고 poisoning 방어 (P0) — *플라이휠 무결성*
계정/기기/IP rate limit·신규계정 영향력 제한·인증·CAPTCHA·동일증거 dedup·신고자 독립성 평가·burst 탐지·신고자 reputation(과거 적중률)·검증출처(경찰/은행/feed) vs 일반신고 분리. **승격 정책**: 신고 1건=저장만 / 독립 다수="다수 신고" 표시 / 신고+강한 기술신호=위험후보 / 신뢰 feed 확인=확인된 위협 / 운영자 검토·복수 강증거=전체 blocklist. allowlist 대상 신고는 즉시차단 말고 검토·**high-impact 판정 dual approval**·moderation queue.

### 7.4 이의제기·정정 (P1)
누구나 접근 appeal form·소유권 증명·SLA(접수→임시조치→최종)·공개차단 피해 크면 임시 suppress·판정변경 사유기록·blocklist tombstone·**모바일/확장 긴급 정정 delta**·색인/캐시 purge·파트너 correction webhook·신고자 개인정보 미공개.

### 7.5 서비스 악용 방지 & 투명성 (P2)
공격자가 역이용(미탐 URL 테스트·경쟁사 대량신고·수사연결 파악·크롤러 SSRF·데이터 수집·차단기준 역공학) → 익명결과는 요약만(내부 임계값 비공개)·세부 그래프는 인증 조사자만·bulk API 승인제·anomaly detection·크롤러 격리·internal/partner/public evidence level 분리·수사 중 비공개 사건 분리. **투명성 보고서**(판정정책·feed 출처·성능·삭제/정정 건수·이의제기 인용률).

---

## 8. 🌐 추가 확장 (P2~P3)

- **브랜드 보호 센터**: 공식 도메인/전화/앱 검증·유사도메인 CT 모니터·registrar takedown template·평균 대응시간·공개 경고 페이지·DNS TXT verification
- **ScamGraph Observatory**(공개 연구 포털): 실시간 캠페인 지도·인기 사칭 브랜드·재사용 인프라 순위·피싱 생존시간·월별 투명성 보고서·익명 연구 dataset·캠페인 permalink
- **표준화**: STIX/TAXII/MISP/OpenIOC export·TLP 2.0·SBOM(CycloneDX)·entity/relationship ontology 공개
- **교육 모드**: 실제 악성 안 여는 phishing simulation·homoglyph 퀴즈·주소창 읽기·고령자 음성훈련·기업 모의훈련·"위험 근거 맞힌 비율" 평가
- **공격자 적응 대응**: 규칙 변경 전후 탐지율 비교·rule DSL hot reload·canary·rollback·규칙 만료일·emergency block

---

## 9. 우선순위 로드맵

### P0 — 해커톤 직전 (최대 임팩트/최소 리스크)
확장 **DNR 로컬 blocklist 동기화** · 위험 사이트 **interstitial** · 확장 popup 현재탭 분석 · Android **오프라인 Dart 규칙엔진** · Android **CallScreeningService 로컬차단** · Android **공유대상 URL 검사** · **case-file PDF** · 그래프 evidence path · quick→deep→graph **story mode** · 위험/반증 신호 표시 · demo replay/fallback · 신고 poisoning 최소방어 · 공개화면 마스킹 · 이의제기 접수 · **가이드 데모 예시 칩**

### P1 — 수상 임팩트 극대화
확장 link-hover tooltip · credential/OTP submit guard · Gmail/Naver 웹메일 · 확장 **Side Panel 실시간 미니 그래프** · Android SMS URL 추출 · TTS 고령자 경고 · **가족 보호 알림** · CT 유사 브랜드 인증서 선제탐지 · **Louvain/centrality 시각화** · 캠페인 시간재생 · signed feed+delta · **OpenTelemetry E2E trace 화면** · **신고 1건이 모바일·확장으로 퍼지는 실시간 장면**

### P2 — 제품화
iOS Call Directory/Message Filter/Safari · partner API+webhook · STIX/TAXII/MISP · 기업 watchlist+SSO · takedown workflow · 운영자 moderation · 정식 appeal/correction · tenant isolation · production SLO · signed PDF provenance · **법률검토+DPIA** · 대규모 blocklist 압축·배포

### P3 — 생태계 확장
금융기관·통신사 연동 · KISA/경찰/금융보안원 협력 · 거래 직전 계좌 위험조회 · 전국 가족보호 · 브랜드보호 SaaS · 연구 데이터 포털 · 다국가/다국어 · registrar 자동 abuse 대응

---

## 10. 발표 핵심 메시지

> 한 사용자가 받은 의심 링크를 검사하면, **로컬 규칙**이 즉시 위험 요소를 설명하고, **서버**가 DNS·인증서·redirect를 확인하며, **그래프**가 같은 IP·전화·계좌를 쓰는 범죄 캠페인을 찾아낸다. 확인된 위험은 **서명된 blocklist**로 변환되어 브라우저와 휴대전화에 배포되고, 다음 사용자는 자신의 방문기록을 서버에 보내지 않고도 즉시 보호받는다. 모든 판정은 **어떤 규칙과 증거로 만들어졌는지 재현 가능**하며, 잘못된 판정은 **이의제기와 정정 feed**로 전체 기기에서 회수된다.

이 흐름이 완성되면 ScamGraph는 "피싱 URL 검사기"가 아니라 **① 실시간 다중채널 예방 · ② 범죄 인프라 상관분석 · ③ 시민 신고 공유 방어망 · ④ 블랙박스 AI 없는 설명가능 보안 제품**을 동시에 보여준다.
