# ScamGraph 모바일 (Flutter · Android)

> ⚠️ **이 소스는 이 환경에서 컴파일·검증되지 않았습니다. Android Studio/Flutter에서 빌드·실기기 테스트가 필요합니다.**
> Flutter/Android SDK 가 없는 환경에서 작성된 **시작점(starting point)** 이며, 실기기에서 동작을 확인하며 다듬어야 합니다.

주변 사기(스미싱·보이스피싱)로부터 사용자를 지키는 **주변형(ambient) 보호** 앱입니다.
브라우저 확장·웹·PWA 와 동일하게 게이트웨이의 통합 판정 엔드포인트 하나(`GET /api/check`)만 호출하는
**"공용 두뇌, 얇은 클라이언트"** 구조입니다.

```
GET {baseUrl}/api/check?value=<url|phone|account>
→ { value, kind, grade: safe|caution|warning|danger|unknown,
    risk_score, reasons[], organization, recommendation }
```

---

## 기능

1. **수동 검사** — URL·전화번호·계좌를 입력해 즉시 판정. 등급·위험 점수·권고·귀속 조직·근거를 표시하고, 검사 기록을 저장합니다.
2. **SMS 자동 스캔** — 수신 문자에서 URL·전화번호를 추출해 각각 검사하고, `warning`/`danger` 이면 고우선순위 알림(`⚠️ 위험 링크/번호 감지: <recommendation>`)을 띄웁니다.
3. **통화 스크리닝** — 수신 전화의 발신 번호를 검사해 위험하면 알림을 게시(옵션: 자동 차단)합니다. Android `RoleManager` 로 `CALL_SCREENING` 역할을 요청합니다.

---

## 기능 → 파일 매핑

### Dart (`lib/`)

| 영역 | 파일 |
|------|------|
| 앱 진입·내비게이션 (검사/기록/설정) | `lib/main.dart` |
| 게이트웨이 `/api/check` 클라이언트 | `lib/api.dart` |
| 응답 모델 (`CheckResult`, `Grade`, `Reason`) | `lib/models.dart` |
| 전역 상태 (baseURL·히스토리) | `lib/app_state.dart` |
| 설정·히스토리 영속화 + 네이티브 브릿지(MethodChannel) | `lib/config_store.dart` |
| 다크 팔레트/테마 (`#06080d`·`#00e5c0`·`#ff4d6d`·`#ffb020`) | `lib/theme.dart` |
| Dart 측 로컬 알림 | `lib/notifications.dart` |
| 수동 검사 화면 | `lib/screens/manual_check_screen.dart` |
| 검사 기록 화면 | `lib/screens/history_screen.dart` |
| 설정 화면 (URL·권한·역할·알림 테스트) | `lib/screens/settings_screen.dart` |
| 등급 배지 / 결과 카드 위젯 | `lib/widgets/grade_badge.dart`, `lib/widgets/result_card.dart` |

### Android 네이티브 (`android/app/src/main/`)

| 영역 | 파일 |
|------|------|
| 권한·매니페스트·서비스 등록 | `AndroidManifest.xml` |
| Flutter 호스트 + 설정/권한/역할 MethodChannel | `kotlin/io/scamgraph/mobile/MainActivity.kt` |
| 얇은 게이트웨이 클라이언트 (`HttpURLConnection`) | `kotlin/io/scamgraph/mobile/GatewayClient.kt` |
| 고우선순위 위험 알림 헬퍼 | `kotlin/io/scamgraph/mobile/Alerts.kt` |
| SMS 수신 → URL/번호 추출 → 검사 → 알림 | `kotlin/io/scamgraph/mobile/SmsReceiver.kt` |
| 통화 스크리닝 → 번호 검사 → 알림/차단 | `kotlin/io/scamgraph/mobile/ScamCallScreeningService.kt` |

---

## 등록된 권한 · 서비스

**권한 (`AndroidManifest.xml`)**

- `INTERNET` — 게이트웨이 호출
- `RECEIVE_SMS`, `READ_SMS` — SMS 자동 스캔
- `READ_PHONE_STATE`, `READ_CALL_LOG` — 통화 스크리닝/발신 번호
- `POST_NOTIFICATIONS` — Android 13+ 알림 게시

**컴포넌트**

- `SmsReceiver` — `<receiver>`, `android.permission.BROADCAST_SMS` 로 보호, 인텐트 필터 `android.provider.Telephony.SMS_RECEIVED`
- `ScamCallScreeningService` — `<service>`, `android.permission.BIND_SCREENING_SERVICE`, 인텐트 필터 `android.telecom.CallScreeningService`

---

## 빌드 · 실행 (Android Studio / Flutter)

> 이 저장소에는 `android/` 디렉터리(Kotlin·Gradle·매니페스트·리소스·벡터 아이콘)가 **이미 완전히 포함**되어 있습니다.
> 포함되지 않은 것은 바이너리인 **Gradle 래퍼 JAR**(`android/gradle/wrapper/gradle-wrapper.jar`)과 환경별 **`android/local.properties`** 뿐입니다.
> 이 둘은 아래에서 자동 생성됩니다.
>
> ⚠️ `flutter create` 로 `android/` 를 재생성하지 마세요. 이 프로젝트의 패키지는 `io.scamgraph.mobile` 로 고정되어 있어,
> 기본 `--org/--project-name` 조합과 어긋나면 중복 `MainActivity` 가 생길 수 있습니다. 아래 절차만 따르면 됩니다.

1. **Gradle 래퍼 + `local.properties` 생성** (둘 중 하나)

   - **(권장) Android Studio** 에서 `apps/mobile/` 를 열면, 첫 Gradle Sync 때 `local.properties` 와 Gradle 래퍼(JAR 포함)가 자동 생성됩니다.
   - **CLI** 를 쓸 경우, `android/local.properties` 를 만들고(예: `flutter.sdk=/path/to/flutter`, `sdk.dir=/path/to/Android/sdk`),
     시스템 Gradle 로 래퍼를 한 번 생성합니다:

     ```bash
     cd apps/mobile/android
     gradle wrapper --gradle-version 8.4   # gradlew + gradle-wrapper.jar 생성
     ```

     (Flutter 툴은 `flutter run` 시 `android/local.properties` 를 자동으로 보정합니다.)

2. **의존성 설치**

   ```bash
   cd apps/mobile
   flutter pub get
   ```

3. **실행**

   ```bash
   flutter run
   ```

4. **게이트웨이 주소 설정** — 앱의 **설정** 탭에서 지정합니다.
   - 에뮬레이터: `http://10.0.2.2:8080` (호스트의 `localhost` = 기본값)
   - 실기기: 게이트웨이 PC 의 LAN IP, 예) `http://192.168.0.10:8080`
     (같은 Wi‑Fi 여야 하며, 게이트웨이가 `0.0.0.0` 로 바인딩되어 있어야 합니다.)

5. **권한·역할 부여** — **설정** 탭에서:
   - "SMS · 전화 · 알림 권한 허용" → 시스템 다이얼로그 승인
   - "통화 스크리닝 역할 요청" → `CALL_SCREENING` 역할 부여
   - "알림 테스트" 로 알림 표시 확인

---

## 중요한 제약 / 참고

- **자동 기능은 실기기(또는 통신 기능이 있는 에뮬레이터)에서만 동작**합니다. 기본 에뮬레이터에는 텔레포니가 없어 SMS/통화 이벤트가 발생하지 않습니다. (에뮬레이터의 Extended Controls 로 가짜 SMS/통화를 주입해 부분 테스트는 가능합니다.)
- **통화 스크리닝**은 사용자가 `CALL_SCREENING` 역할을 직접 허용해야 하며(Android 10/ API 29+), 기본 동작은 통화 **허용 + 알림**입니다. 위험 통화 자동 차단을 원하면 `ScamCallScreeningService.kt` 의 `respondDisallow` 관련 주석을 해제하세요.
- **`http://` 평문 통신**: 기본 게이트웨이 주소가 HTTP 이므로, 실 배포 시에는 HTTPS 로 바꾸거나 `network_security_config` 로 정책을 조정해야 합니다. (Flutter 디버그 빌드는 clear‑text 를 허용합니다.)
- **`minSdk 24`**: `CallScreeningService` 는 API 24+, `RoleManager(CALL_SCREENING)` 는 코드에서 API 29+ 로 가드되어 있습니다.
- 게이트웨이가 꺼져 있으면 네이티브 검사는 조용히 무시(알림 없음)되고, 수동 검사는 사용자에게 연결 오류를 표시합니다.
- 아이콘은 PNG 없이 벡터(`res/drawable/ic_launcher.xml`)로 제공됩니다. 정식 런처 아이콘이 필요하면 `flutter create` 또는 `flutter_launcher_icons` 로 교체하세요.

---

이 앱은 게이트웨이 하나만 알면 되는 얇은 클라이언트입니다. 판정 로직·규칙·조직 귀속은 모두 게이트웨이(공용 두뇌)에 있으므로, 여기서는 UI/UX 와 온‑디바이스 트리거(SMS·통화)에 집중해 다듬으면 됩니다.
