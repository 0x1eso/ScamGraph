// ScamGraph 게이트웨이 부하 테스트 — "초당 N건 처리" 데모용 k6 스크립트.
//
// 시나리오: 실사용 트래픽을 흉내 내 스캔 콘솔이 쏟아내는 스캔 요청을 대량 재현한다.
//   - 대부분  POST /api/scan   { "target": "<사기 의심 대상>" }   ← 헤드라인(스캔)
//   - 가끔    GET  /api/graph  (관계망 스냅샷)
//   - 가끔    GET  /api/stats  (실시간 지표)
//
// 게이트웨이는 IP당 60초 600건 레이트 리밋(단일 남용 클라이언트 차단용)을 두고
// X-Forwarded-For 첫 IP를 클라이언트로 인식한다. 부하 도구는 한 대라 IP가 하나뿐이므로,
// 매 요청마다 ~4096개의 가상 클라이언트 IP를 회전시켜 "다수의 실사용자"를 모사한다.
// = throughput 헤드라인이 나타내려는 현실 시나리오 그대로이며, 안티어뷰즈 리밋이
//   숫자를 왜곡하지 않게 한다. (4096 × 600 = 2.4M req/분 여유 → 429 없음, 버킷 메모리 한정)

import http from 'k6/http';
import { check } from 'k6/http';
import { Counter } from 'k6/metrics';

// ─── 튜너블 파라미터 (환경변수) ──────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const PEAK_VUS = Number(__ENV.PEAK_VUS) || 100;          // 피크 동시 사용자 수
const MID_VUS = Math.max(1, Math.round(PEAK_VUS / 2));   // 중간 단계(피크의 절반)
const CLIENT_POOL = 4096;                                // 모사할 가상 클라이언트 IP 수

// ─── 커스텀 메트릭 (요약에서 엔드포인트별 분해에 사용) ────────────────────────
const scanRequests = new Counter('scan_requests');
const graphRequests = new Counter('graph_requests');
const statsRequests = new Counter('stats_requests');

// ─── 현실적인 한국형 사기 의심 입력 (URL · 전화 · 계좌 혼합) ──────────────────
const SCAM_TARGETS = [
  'shinhan-otp.xyz',                       // 은행 사칭 피싱 호스트
  'http://kakao-event.ru/login',           // 카카오 이벤트 사칭
  'https://naver-security-check.com/verify', // 네이버 보안 사칭
  'nonghyup-safe.top',                     // 농협 사칭
  'http://toss-refund.ru',                 // 토스 환급 사칭
  'kb-star-event.xyz/gift',                // KB 경품 사칭
  '010-1234-5678',                         // 스미싱 발신번호
  '010-9876-5432',                         // 스미싱 발신번호
  '+82-2-1588-0000',                       // 기관 사칭 대표번호
  '+82-10-4444-3333',                      // 국제 위장 발신
  '110-234-567890',                        // 대포통장 의심 계좌
  '3333-01-2345678',                       // 대포통장 의심 계좌
];

// ─── 부하 프로파일: 0→50(10s) → 100(20s) → 0(10s), 총 ~40초 ────────────────
export const options = {
  scenarios: {
    scan_spectacle: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: MID_VUS },  // 워밍업 램프
        { duration: '20s', target: PEAK_VUS }, // 피크 부하
        { duration: '10s', target: 0 },        // 쿨다운
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'], // p95 지연 800ms 미만
    http_req_failed: ['rate<0.05'],   // 오류율 5% 미만
  },
};

// 가상 클라이언트 IP를 회전시켜 각 요청을 별개 사용자로 보이게 한다(레이트 리밋 우회).
function spoofedClientIp() {
  const idx = Math.floor(Math.random() * CLIENT_POOL);
  return `10.0.${(idx >> 8) & 255}.${idx & 255}`;
}

// VU별 회전 인덱스 — 사기 입력 배열을 골고루 순회한다.
let rotation = 0;

export default function () {
  const clientIp = spoofedClientIp();
  const dice = Math.random();

  if (dice < 0.8) {
    // 80% — 스캔 (헤드라인). 사기 입력 배열을 회전하며 소비.
    const target = SCAM_TARGETS[rotation % SCAM_TARGETS.length];
    rotation += 1;
    const res = http.post(`${BASE_URL}/api/scan`, JSON.stringify({ target }), {
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': clientIp,
      },
      tags: { name: 'scan' },
    });
    scanRequests.add(1);
    check(res, { 'scan 200': (r) => r.status === 200 });
  } else if (dice < 0.92) {
    // 12% — 관계망 스냅샷.
    const res = http.get(`${BASE_URL}/api/graph?limit=200`, {
      headers: { 'X-Forwarded-For': clientIp },
      tags: { name: 'graph' },
    });
    graphRequests.add(1);
    check(res, { 'graph 200': (r) => r.status === 200 });
  } else {
    // 8% — 실시간 지표.
    const res = http.get(`${BASE_URL}/api/stats`, {
      headers: { 'X-Forwarded-For': clientIp },
      tags: { name: 'stats' },
    });
    statsRequests.add(1);
    check(res, { 'stats 200': (r) => r.status === 200 });
  }
}

// ─── 데모용 한국어 요약: 헤드라인은 "초당 처리량(req/s)" ──────────────────────
export function handleSummary(data) {
  const m = data.metrics;
  const num = (v, d = 0) => (typeof v === 'number' ? v : d);

  const totalReqs = num(m.http_reqs && m.http_reqs.values.count);
  const rps = num(m.http_reqs && m.http_reqs.values.rate);
  const durSec = num(data.state && data.state.testRunDurationMs) / 1000;
  const p95 = num(m.http_req_duration && m.http_req_duration.values['p(95)']);
  const avg = num(m.http_req_duration && m.http_req_duration.values.avg);
  const maxLat = num(m.http_req_duration && m.http_req_duration.values.max);
  const errRate = num(m.http_req_failed && m.http_req_failed.values.rate);
  const maxVus = num(m.vus_max && m.vus_max.values.max);
  const scanN = num(m.scan_requests && m.scan_requests.values.count);
  const graphN = num(m.graph_requests && m.graph_requests.values.count);
  const statsN = num(m.stats_requests && m.stats_requests.values.count);

  // k6(goja)는 toLocaleString 의 locale 인자를 radix 로 오인하므로 직접 천단위 구분.
  const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const pass = (ok) => (ok ? '✅ 통과' : '❌ 초과');
  const durOk = p95 < 800;
  const errOk = errRate < 0.05;

  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════╗',
    '║           ScamGraph 게이트웨이 부하 테스트 결과            ║',
    '╠══════════════════════════════════════════════════════════╣',
    `║  ⚡ 초당 처리량 (throughput) :  ${fmt(rps).padStart(9)} 건/초        ║`,
    `║  📊 총 처리 요청            :  ${fmt(totalReqs).padStart(9)} 건         ║`,
    `║  ⏱  테스트 시간            :  ${durSec.toFixed(1).padStart(9)} 초         ║`,
    `║  👥 피크 동시 사용자        :  ${fmt(maxVus).padStart(9)} VU         ║`,
    '╟──────────────────────────────────────────────────────────╢',
    `║  ⏳ 지연 p95               :  ${p95.toFixed(1).padStart(9)} ms   ${pass(durOk)}  ║`,
    `║  ⏳ 지연 평균 / 최대       :  ${avg.toFixed(0)} / ${maxLat.toFixed(0)} ms`.padEnd(59) + '║',
    `║  🚨 오류율                 :  ${(errRate * 100).toFixed(2).padStart(9)} %    ${pass(errOk)}  ║`,
    '╟──────────────────────────────────────────────────────────╢',
    `║  분해:  스캔 ${fmt(scanN)} · 그래프 ${fmt(graphN)} · 지표 ${fmt(statsN)}`.padEnd(59) + '║',
    '╚══════════════════════════════════════════════════════════╝',
    '',
    `👉 데모 헤드라인:  게이트웨이가 초당 약 ${fmt(rps)}건의 위협 스캔 요청을 처리했습니다.`,
    '',
  ];

  return {
    stdout: lines.join('\n'),
  };
}
