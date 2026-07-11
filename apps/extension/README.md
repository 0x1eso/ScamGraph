# ScamGraph 방패 (브라우저 확장 프로그램)

방문 중인 사이트를 ScamGraph 게이트웨이로 실시간 검사하여 사기·피싱 위험을
경고하는 Chrome/Edge 확장 프로그램입니다 (Manifest V3).

## 사전 준비

ScamGraph 게이트웨이가 `http://localhost:8080` 에서 실행 중이어야 합니다.
게이트웨이가 꺼져 있으면 확장 프로그램은 조용히 동작을 중단하며 페이지를
망가뜨리지 않습니다.

- 검사 API: `POST http://localhost:8080/api/scan`
- 요청 본문: `{"target": "<url 또는 host>"}`
- 응답: `{target, kind, risk_score, grade, reasons}`

## 설치 (압축해제된 확장 프로그램 로드)

1. Chrome 또는 Edge 주소창에 `chrome://extensions` 를 입력합니다.
   (Edge 는 `edge://extensions`)
2. 우측 상단의 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램 로드** 버튼을 클릭합니다.
4. 이 저장소의 `apps/extension` 디렉터리를 선택합니다.
5. 툴바에 ScamGraph 아이콘이 나타나면 설치 완료입니다.

> 아이콘 이미지는 포함되어 있지 않아 기본 퍼즐 아이콘으로 표시됩니다.

## 동작 방식

- **content.js** — 모든 페이지에서 `document_idle` 시점에 실행됩니다.
  http(s) 페이지가 아니거나 localhost 면 건너뜁니다. 현재 호스트명을
  백그라운드로 보내 검사하고, 등급이 `warning` 또는 `danger` 이면 페이지
  상단에 경고 배너를 삽입합니다.
- **background.js** (서비스 워커) — 실제 게이트웨이 호출을 담당합니다.
  `host_permissions` 덕분에 페이지 CORS 제약을 우회할 수 있으므로,
  content 스크립트는 직접 fetch 하지 않고 백그라운드에 위임합니다.
- **popup.html / popup.js** — 툴바 아이콘 클릭 시 현재 탭의 호스트명을
  보여주고, **검사** 버튼으로 위험도 게이지·등급·주요 사유를 표시합니다.

흐름: `content.js → chrome.runtime.sendMessage → background.js → 게이트웨이`

## 문제 해결

- 배너가 뜨지 않으면: 게이트웨이 실행 여부와 해당 사이트의 등급이
  `warning`/`danger` 인지 확인하세요. `safe`/`caution` 은 배너를 띄우지
  않습니다.
- 팝업에 "게이트웨이에 연결할 수 없습니다" 가 표시되면 `localhost:8080`
  게이트웨이가 실행 중인지 확인하세요.
- 코드를 수정한 뒤에는 `chrome://extensions` 에서 새로고침 버튼을 눌러
  확장 프로그램을 다시 로드하세요.
