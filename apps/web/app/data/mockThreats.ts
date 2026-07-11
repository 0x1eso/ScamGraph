// ScamGraph — 위협 지도용 목 데이터
// 사기 인프라의 지리적 출발점을 좌표로 나타내고, 모든 공격 궤적이
// 타깃(서울)으로 수렴하도록 한다. 백엔드에 의존하지 않는다.
// 라벨은 가능한 한 seed 도메인/캠페인과 연결해 관계망 탐색기와 맥락을 공유한다.

export type Threat = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  grade: "danger" | "warning" | "caution" | "safe";
  risk: number;
};

// 모든 공격 궤적이 수렴하는 지점 — 서울
export const TARGET_CENTER = { lng: 126.978, lat: 37.5665 };

// 국내 6개 도시 + 해외 8개 출발점. 대부분 danger/warning, risk 30~98.
export const mockThreats: Threat[] = [
  // ── 국내 출발점 ──
  { id: "kr-seoul", label: "shinhan-otp.xyz", lng: 126.978, lat: 37.5665, grade: "danger", risk: 95 },
  { id: "kr-busan", label: "kbstat-secure.click", lng: 129.075, lat: 35.1796, grade: "danger", risk: 88 },
  { id: "kr-incheon", label: "cj-delivery-check.top", lng: 126.7052, lat: 37.4563, grade: "warning", risk: 72 },
  { id: "kr-daegu", label: "cj-delivery-track.xyz", lng: 128.6014, lat: 35.8714, grade: "warning", risk: 66 },
  { id: "kr-gwangju", label: "nh-account-verify.top", lng: 126.8526, lat: 35.1595, grade: "caution", risk: 48 },
  { id: "kr-daejeon", label: "toss-refund-noti.click", lng: 127.3845, lat: 36.3504, grade: "warning", risk: 61 },

  // ── 해외 출발점 ──
  { id: "cn-beijing", label: "kakaobank-otp.xyz", lng: 116.4074, lat: 39.9042, grade: "danger", risk: 93 },
  { id: "jp-tokyo", label: "coupang-pay-check.top", lng: 139.6917, lat: 35.6895, grade: "warning", risk: 70 },
  { id: "hk-hongkong", label: "wooribank-secure.click", lng: 114.1694, lat: 22.3193, grade: "danger", risk: 90 },
  { id: "ph-manila", label: "call-center-070.vip", lng: 120.9842, lat: 14.5995, grade: "danger", risk: 84 },
  { id: "ru-moscow", label: "credit-card-dump.store", lng: 37.6173, lat: 55.7558, grade: "danger", risk: 79 },
  { id: "us-la", label: "gift-card-scam.shop", lng: -118.2437, lat: 34.0522, grade: "caution", risk: 42 },
  { id: "br-saopaulo", label: "invest-double.online", lng: -46.6333, lat: -23.5505, grade: "warning", risk: 55 },
  { id: "ng-lagos", label: "romance-transfer.site", lng: 3.3792, lat: 6.5244, grade: "danger", risk: 98 },
];
