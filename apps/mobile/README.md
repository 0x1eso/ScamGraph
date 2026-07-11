# ScamGraph 모바일 (Flutter · Android)

> ⚠️ **이 소스는 이 환경에서 컴파일·빌드·실기기 검증되지 않았습니다.** Flutter/Android SDK 가 없는
> 환경에서 작성된 **소스 전용(source-only) 시작점**입니다. Android Studio / Flutter 에서
> `flutter pub get` → `flutter test` → `flutter run` 으로 빌드·검증하며 다듬어야 합니다.

주변 사기(스미싱·보이스피싱)로부터 사용자를 지키는 **주변형(ambient) 보호** 앱입니다.

## 아키텍처 — "공용 두뇌 + 온‑디바이스 오프라인 우선"

초기 버전은 게이트웨이 `/api/check` 하나만 호출하는 순수 얇은 클라이언트였지만, 지금은
**오프라인 우선(offline-first)** 으로 발전했습니다. 두 층이 협력합니다.

```
온‑디바이스(오프라인·즉답·최소권한)          공용 두뇌(게이트웨이, 온라인 정밀)
──────────────────────────────────         ─────────────────────────────────
· Dart 규칙엔진 quick_assess               · 조직 귀속(그래프)
· 로컬 blocklist 멤버십(캐시/시드)          · 커뮤니티 신고 · 외부 위협 피드 대조
· SMS·통화·공유(Share) 트리거               · 크롤 심화(WHOIS·TLS·리다이렉트)
```

- **규칙 판정은 네트워크 없이 온‑디바이스에서 즉시** 이뤄집니다. 게이트웨이는 조직 귀속·피드
  대조 같은 **정밀 검사**를 담당하며, 죽어 있어도 앱은 오프라인 규칙으로 즉답합니다(demo-safe).
- 규칙 정의(ID·가중치·등급 임계값·상수)는 **`contracts/rules.json` 을 미러링한
  `assets/rules.json`** 한 곳에서 읽습니다. Python 엔진(`apps/engine/app/crawler.py`)과
  동일 규칙이므로 golden 테스트로 판정 일치를 검증합니다.

---

## 기능

1. **수동 검사 (게이트웨이 우선 · 오프라인 폴백)** — URL·전화·계좌를 입력해 판정. 게이트웨이가
   응답하면 조직 귀속·피드 근거까지, 응답하지 못하면 **온‑디바이스 규칙엔진 + 로컬 blocklist** 로
   즉시 판정하고 "오프라인" 배지를 표시합니다.
2. **공유(Share) 검사** — 다른 앱(메시지·브라우저·카톡)에서 "공유 → ScamGraph" 로 넘긴 텍스트를
   **오프라인 엔진으로 즉시** 판정합니다. 무해화된 링크(`hxxp`, `[.]`, `[dot]`)를 원형으로 복원하고
   문장 속 URL/전화를 추출합니다. **가장 낮은 권한으로 가장 큰 가치**를 주는 경로입니다(권한 불필요).
3. **SMS 스미싱 수신** — 수신 문자에서 URL·전화번호를 추출(무해화 복원 포함)해 **로컬**로 검사하고,
   스미싱(warning/danger)이면 고우선순위 알림을 띄웁니다.
4. **통화 스크리닝** — 수신 발신번호를 **로컬 blocklist + 경량 휴리스틱**으로 즉시 판정합니다.
   확인된 위험(danger)은 **차단/거절**, 의심(warning/caution)은 **허용 + 주의 알림**. 통화
   내용·녹음은 다루지 않고 번호 신호만 씁니다. `RoleManager.ROLE_CALL_SCREENING` 역할이 필요합니다.
5. **로컬 blocklist 동기화** — `${gateway}/api/blocklist/snapshot` 을 받아 네이티브
   SharedPreferences 에 캐시합니다. Dart UI 와 네이티브(SMS·통화)가 **같은 캐시**를 읽어
   오프라인 멤버십을 판정합니다. 서버 동기화 전에도 내장 시드로 즉시 동작합니다(demo-safe).
6. **가족 보호 모드 (스켈레톤)** — 노약자·가족의 "위험 이벤트만" 보호자에게 알리는 개념. 페어링 코드,
   위험 전용 알림 토글, **본인 동의 게이트(스토킹 방지)** 를 담습니다. 현재는 UI·로컬 상태만
   구현(서버 연동/이벤트 전송 미구현).

---

## 오프라인 규칙엔진 & parity

- **규칙 소스**: `assets/rules.json` — `contracts/rules.json` 의 규칙 ID·가중치·등급 임계값·상수
  (`known_brands`·`suspicious_tlds`·`confusable_ranges`)를 그대로 미러링하고, Python 엔진이
  하드코딩으로 갖고 있어 계약 파일엔 없는 `phish_keywords`·`allowlist`·`phishing_keyword_scoring`
  을 추가로 담습니다. **contract 가 바뀌면 이 파일도 동기화**해야 합니다.
- **엔진**: `lib/engine/quick_assess.dart` + `lib/engine/signals.dart` — 순수 Dart 포팅(플러터 의존
  없음). 현재 계약의 19개 URL 규칙 전부: allowlist→즉시 안전, homograph(퓨니코드),
  homoglyph(키릴/그리스/전각·**혼동문자 스켈레톤 접기**, 스켈레톤이 화이트리스트와 일치하면 40→50),
  brand_impersonation/typosquatting(Levenshtein)·**brand_subdomain**, 위험 TLD, 피싱 키워드,
  숫자/하이픈 과다, ip_host·**obfuscated_ip**(10진/16진), **url_shortener**, `@` 은폐,
  **double_encoding**(%25XX), **nonstandard_port**, 딥 서브도메인, 긴 URL, no‑TLS,
  VoIP(070/050)·국제(00/+). `{kind, riskScore, grade, reasons[]}` 반환.
- **이식 근사/한계(문서화)**:
  - eTLD+1(멀티파트 TLD: co.kr·go.kr 등)은 전체 PSL 대신 국내외 주요 접미사 집합으로 근사한다
    (파이썬은 `tldextract` 사용). 흔한 KR/글로벌 도메인은 동일 결과.
  - 퓨니코드(xn--)는 유니코드 디코드 없이 `homograph` 규칙(+35)으로만 처리한다(Dart 표준
    라이브러리에 punycode 디코더 없음). **원시 유니코드 혼동문자는 완전 지원**.
  - 규칙 **가중치는 `contracts/rules.json` 을 권위 소스로 따른다**(엔진 코드의 인라인 가중치와
    일부 다를 수 있음 — url_shortener/double_encoding/nonstandard_port). reason 의 `confidence`
    필드는 모바일 모델에 반영하지 않는다(등급·근거만).
- **골든 테스트**: `test/quick_assess_test.dart` (Python `eval/dataset.py` 미러 표본 + 신규 규칙) +
  `test/blocklist_test.dart`. 실행: `flutter test`.

> 백그라운드(SMS·통화)의 네이티브 Kotlin 경로는 응답 지연이 중요해 **경량 부분집합**(로컬 blocklist +
> 위험 TLD·피싱 키워드·IP·VoIP)만 씁니다. 상수 목록은 동일 자산(`flutter_assets/assets/rules.json`)
> 에서 읽어 **목록 단위 parity** 를 유지하고, 전체 규칙엔진은 Dart 가 담당합니다.

---

## 기능 → 파일 매핑

### Dart (`lib/`)

| 영역 | 파일 |
|------|------|
| 앱 진입·내비게이션(검사/기록/가족/설정) + 공유 라우팅 | `lib/main.dart` |
| **오프라인 규칙엔진** (Python `quick_assess` 포팅, 순수 Dart) | `lib/engine/quick_assess.dart` |
| 보조 신호(혼동문자 스켈레톤·단축URL·인코딩IP·이중인코딩·포트·eTLD+1) | `lib/engine/signals.dart` |
| 번들 규칙 자산 로더(캐시 싱글턴) | `lib/engine/rule_engine.dart` |
| **로컬 blocklist** 동기화·캐시·오프라인 멤버십 | `lib/data/blocklist.dart` |
| 가족 보호 설정 모델·영속화 | `lib/data/family_config.dart` |
| 공유/문자 텍스트 → URL/전화 추출 + 무해화 복원(refang) | `lib/util/link_extract.dart` |
| 공유(ACTION_SEND) 수신 → 검사 화면 라우팅 | `lib/share_handler.dart` |
| 게이트웨이 `/api/check` 클라이언트 | `lib/api.dart` |
| 응답 모델(`CheckResult`·`Grade`·`Reason`, `offline` 플래그) | `lib/models.dart` |
| 전역 상태(게이트웨이 우선 + 오프라인 폴백 + blocklist) | `lib/app_state.dart` |
| 설정·히스토리·범용 pref + 네이티브 브릿지(MethodChannel) | `lib/config_store.dart` |
| 다크 팔레트/테마 | `lib/theme.dart` |
| Dart 측 로컬 알림 | `lib/notifications.dart` |
| 수동 검사 화면 | `lib/screens/manual_check_screen.dart` |
| **공유 검사(위험) 화면** | `lib/screens/risk_screen.dart` |
| 검사 기록 화면 | `lib/screens/history_screen.dart` |
| **가족 보호 화면(스켈레톤)** | `lib/screens/family_screen.dart` |
| 설정 화면 | `lib/screens/settings_screen.dart` |
| 등급 배지 / 결과 카드(오프라인 태그) | `lib/widgets/grade_badge.dart`, `lib/widgets/result_card.dart` |

### Android 네이티브 (`android/app/src/main/`)

| 영역 | 파일 |
|------|------|
| 권한·매니페스트·서비스/리시버·**공유(SEND) 인텐트 필터** | `AndroidManifest.xml` |
| Flutter 호스트 + 설정/권한/역할 MethodChannel + **공유 인텐트 브릿지** | `kotlin/io/scamgraph/mobile/MainActivity.kt` |
| 공유 SharedPreferences 키·헬퍼(단일 진실 공급원) | `kotlin/io/scamgraph/mobile/Prefs.kt` |
| 번들 자산에서 위험 TLD·피싱 키워드 로드(폴백 상수) | `kotlin/io/scamgraph/mobile/LocalRules.kt` |
| **로컬 위협 판정**(blocklist + 경량 휴리스틱) | `kotlin/io/scamgraph/mobile/LocalDetector.kt` |
| 고우선순위 위험 알림 헬퍼 | `kotlin/io/scamgraph/mobile/Alerts.kt` |
| SMS 수신 → 무해화 복원·추출 → **로컬** 검사 → 알림 | `kotlin/io/scamgraph/mobile/SmsReceiver.kt` |
| 통화 스크리닝 → **로컬** 판정 → 차단/알림 | `kotlin/io/scamgraph/mobile/ScamCallScreeningService.kt` |

> 이전의 `GatewayClient.kt`(네이티브 HTTP 클라이언트)는 제거했습니다. 백그라운드 경로는
> **로컬 우선**으로 바뀌어 게이트웨이에 의존하지 않습니다(짧은 응답 제한·오프라인·개인정보 보존).

---

## 등록된 권한 · 컴포넌트

**권한 (`AndroidManifest.xml`)**

- `INTERNET` — 게이트웨이 호출(정밀 검사·blocklist 동기화)
- `RECEIVE_SMS`, `READ_SMS` — SMS 자동 스캔
- `READ_PHONE_STATE`, `READ_CALL_LOG` — 통화 스크리닝/발신 번호
- `POST_NOTIFICATIONS` — Android 13+ 알림 게시

**컴포넌트**

- `MainActivity` — 런처 + **`ACTION_SEND`(text/plain) 공유 대상** 인텐트 필터
- `SmsReceiver` — `<receiver>`, `BROADCAST_SMS` 로 보호, `SMS_RECEIVED` 인텐트 필터
- `ScamCallScreeningService` — `<service>`, `BIND_SCREENING_SERVICE`, `CallScreeningService` 인텐트 필터

---

## ⚠️ Google Play 정책 주의 (중요)

이 앱의 자동 보호는 **정책상 민감한 권한**을 씁니다. 스토어 심사에서 제한될 수 있어, 현재 구성은
**데모·사이드로드·기업 배포·안티‑피싱 예외 승인** 전제입니다.

- **`RECEIVE_SMS`/`READ_SMS`** 는 Play의 **제한 권한(Restricted Permissions)** 입니다. 일반적으로
  기본 SMS 앱이거나 승인된 예외 용도라야 하며, 그렇지 않으면 등록이 거부될 수 있습니다.
  (Android 정책상 안티‑스팸/피싱이 자동 예외는 아닙니다.)
- **`READ_CALL_LOG`** 도 제한 권한입니다. `CallScreeningService` 는 `Call.Details.handle` 로 번호를
  받으므로 실제 판정에는 통화기록 읽기가 **필수는 아닙니다** — 스토어 배포 시 제거를 검토하세요.
- **통화 스크리닝**은 사용자가 `ROLE_CALL_SCREENING` 역할을 직접 허용해야 하며(Android 10/API 29+),
  Caller ID & Spam 정책 선언이 필요할 수 있습니다.
- **가장 낮은 권한·가장 큰 가치의 경로는 "공유(Share) 검사"** 입니다. SMS/통화 권한 없이도 사용자가
  의심 링크를 공유만 하면 오프라인으로 즉시 판정합니다 — 스토어 친화적 기본 경로로 권장합니다.

---

## 빌드 · 실행 (Android Studio / Flutter)

> 이 저장소에는 `android/`(Kotlin·Gradle·매니페스트·리소스·벡터 아이콘)와 `assets/rules.json`,
> `test/` 가 **이미 포함**되어 있습니다. 포함되지 않은 것은 바이너리인 **Gradle 래퍼 JAR**
> (`android/gradle/wrapper/gradle-wrapper.jar`)과 환경별 **`android/local.properties`** 뿐이며,
> 아래에서 자동 생성됩니다.
>
> ⚠️ `flutter create` 로 `android/` 를 재생성하지 마세요. 패키지는 `io.scamgraph.mobile` 로
> 고정되어 있어, 기본 조합과 어긋나면 중복 `MainActivity` 가 생길 수 있습니다.

1. **Gradle 래퍼 + `local.properties` 생성**
   - **(권장) Android Studio** 에서 `apps/mobile/` 를 열면 첫 Gradle Sync 때 자동 생성됩니다.
   - **CLI** 는 `android/local.properties` 를 만들고(예: `flutter.sdk=/path/to/flutter`,
     `sdk.dir=/path/to/Android/sdk`), 시스템 Gradle 로 래퍼를 한 번 생성합니다:
     ```bash
     cd apps/mobile/android
     gradle wrapper --gradle-version 8.4
     ```

2. **의존성 설치 & 테스트**
   ```bash
   cd apps/mobile
   flutter pub get
   flutter test          # 오프라인 엔진 golden + blocklist 테스트
   ```

3. **실행**
   ```bash
   flutter run
   ```

4. **게이트웨이 주소 설정** — 앱 **설정** 탭:
   - 에뮬레이터: `http://10.0.2.2:8080` (호스트의 `localhost` = 기본값)
   - 실기기: 게이트웨이 PC 의 LAN IP, 예) `http://192.168.0.10:8080`
     (같은 Wi‑Fi · 게이트웨이가 `0.0.0.0` 바인딩)

5. **권한·역할 부여** — **설정** 탭에서 권한/역할/알림을 요청합니다.

---

## 중요한 제약 / 참고

- **오프라인이 기본**: 게이트웨이·네트워크가 죽어도 규칙엔진과 로컬 blocklist(시드 폴백)로 즉시
  판정합니다. 게이트웨이가 살아 있으면 조직 귀속·피드 근거가 추가로 붙습니다.
- **공유 검사는 권한 불필요**로 어디서나 동작합니다(콜드/웜 공유 모두 지원).
- **SMS·통화 자동 기능은 실기기(또는 통신 기능이 있는 에뮬레이터)에서만** 동작합니다. 기본 에뮬레이터엔
  텔레포니가 없어 SMS/통화 이벤트가 발생하지 않습니다(Extended Controls 로 가짜 주입은 가능).
- **통화 자동 차단**: 확인된 위험(로컬 blocklist danger) 번호는 거절/차단합니다. 발신번호는
  조작(스푸핑)될 수 있어 판정은 참고 신호로 안내합니다.
- **가족 보호 모드는 스켈레톤**입니다(서버 연동 미구현). 스토킹 악용을 막기 위해 **본인 동의** 없이는
  켜지지 않으며, 전송 개념은 "위험 이벤트 발생" 신호뿐 — 통화·문자 원문·연락처·위치·방문기록은
  수집·전송하지 않습니다.
- **`http://` 평문 통신**: 기본 게이트웨이 주소가 HTTP 이므로 실 배포 시 HTTPS 또는
  `network_security_config` 로 정책을 조정하세요(Flutter 디버그 빌드는 clear‑text 허용).
- **`minSdk 24`**: `CallScreeningService` 는 API 24+, `RoleManager(CALL_SCREENING)` 은 코드에서
  API 29+ 로 가드됩니다.
- 아이콘은 벡터(`res/drawable/ic_launcher.xml`)로 제공됩니다. 정식 런처 아이콘이 필요하면
  `flutter_launcher_icons` 로 교체하세요.

---

이 앱은 **온‑디바이스 오프라인 규칙엔진 + 로컬 blocklist** 로 즉답하고, **게이트웨이(공용 두뇌)** 로
정밀 검사를 보강하는 offline-first 구조입니다. 규칙 parity 는 `contracts/rules.json` ↔
`assets/rules.json` 과 golden 테스트로 보장합니다.
