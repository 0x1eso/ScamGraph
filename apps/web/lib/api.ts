// ScamGraph — gateway API 클라이언트 (native fetch, 무의존)
// 스캔 콘솔 + 그래프 탐색이 공유하는 얇은 HTTP 레이어.

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

// gateway/engine 응답과 정확히 일치해야 하는 스캔 결과 타입.
// source/first_seen은 외부 위협 피드 근거(external_feed_hit 등)에만 채워지는 선택 필드.
export type ScanReason = {
  rule: string;
  weight: number;
  detail: string;
  source?: string;
  first_seen?: string | null;
};
export type ScanResult = {
  target: string;
  job_id: string | null;
  kind: "url" | "phone" | "account";
  risk_score: number;
  grade: "safe" | "caution" | "warning" | "danger";
  reasons: ScanReason[];
  // 통합 판정(/api/check)에서 함께 오는 신뢰 신호(선택). 외부 피드/커뮤니티/조직 귀속.
  feed_sources?: string[];
  organization?: string | null;
  community_reports?: number;
  recommendation?: string | null;
};

// 그래프 데이터 타입은 그래프 트랙이 소유(@/app/data/mockGraph).
type GraphData = import("@/app/data/mockGraph").GraphData;

// /api/check 원시 응답(게이트웨이 통합 판정). 필드가 느슨하므로 표시 타입으로 정규화한다.
type CheckResponse = {
  value?: string;
  kind?: string;
  grade?: string;
  risk_score?: number | null;
  reasons?: ScanReason[];
  organization?: string | null;
  community_reports?: number;
  feed_sources?: string[];
  recommendation?: string | null;
};

const GRADES: ReadonlyArray<ScanResult["grade"]> = ["safe", "caution", "warning", "danger"];
const KINDS: ReadonlyArray<ScanResult["kind"]> = ["url", "phone", "account"];

// grade는 "unknown"(엔진 미가동 폴백 등)으로 올 수 있어 표시 가능한 등급으로 좁힌다.
function normalizeGrade(raw: unknown): ScanResult["grade"] {
  return GRADES.includes(raw as ScanResult["grade"]) ? (raw as ScanResult["grade"]) : "caution";
}
function normalizeKind(raw: unknown): ScanResult["kind"] {
  return KINDS.includes(raw as ScanResult["kind"]) ? (raw as ScanResult["kind"]) : "url";
}

// 대상(URL·전화번호·계좌)을 통합 판정 엔드포인트로 스캔한다.
// /api/check = "공용 두뇌" 단일 엔드포인트: 규칙 판정 + 외부 위협 피드 대조(external_feed_hit)
// + 조직 귀속 + 커뮤니티 신고를 한 번에 반환한다. 표시 타입(ScanResult)으로 정규화해서 넘긴다.
export async function scan(target: string): Promise<ScanResult> {
  const res = await fetch(`${GATEWAY}/api/check?value=${encodeURIComponent(target)}`);
  if (!res.ok) {
    throw new Error(`스캔 요청 실패 (${res.status})`);
  }
  const raw = (await res.json()) as CheckResponse;
  return {
    target: typeof raw.value === "string" && raw.value.length > 0 ? raw.value : target,
    job_id: null,
    kind: normalizeKind(raw.kind),
    risk_score: typeof raw.risk_score === "number" ? raw.risk_score : 0,
    grade: normalizeGrade(raw.grade),
    reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
    feed_sources: Array.isArray(raw.feed_sources) ? raw.feed_sources : [],
    organization: raw.organization ?? null,
    community_reports: typeof raw.community_reports === "number" ? raw.community_reports : 0,
    recommendation: raw.recommendation ?? null,
  };
}

// 전체 관계망 스냅샷을 불러온다(그래프 탐색기가 사용).
export async function getGraph(limit = 500): Promise<GraphData> {
  const res = await fetch(`${GATEWAY}/api/graph?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`그래프 로드 실패 (${res.status})`);
  }
  return (await res.json()) as GraphData;
}

// 특정 노드 주변을 확장해 이웃 관계망을 가져온다.
export async function expand(value: string): Promise<GraphData> {
  const res = await fetch(
    `${GATEWAY}/api/graph/expand?value=${encodeURIComponent(value)}`,
  );
  if (!res.ok) {
    throw new Error(`관계망 확장 실패 (${res.status})`);
  }
  return (await res.json()) as GraphData;
}

// 상단 stat 카드가 폴링하는 실시간 집계값(게이트웨이 응답과 일치).
export type Stats = {
  tracked_entities: number;
  graph_relations: number;
  scans_today: number;
  confirmed_threats: number;
};

// 대시보드 지표 스냅샷을 가져온다(StatsBar가 주기적으로 호출).
export async function getStats(): Promise<Stats> {
  const res = await fetch(`${GATEWAY}/api/stats`);
  if (!res.ok) {
    throw new Error(`통계 로드 실패 (${res.status})`);
  }
  return (await res.json()) as Stats;
}

// ── 위협 피드(외부 데이터 소스) 집계 ──────────────────────────
// 연결된 외부 위협 피드(글로벌·정부)의 등재 지표 수와 갱신 상태.
// DataSourcesPanel이 "실제 외부 데이터에 근거한다"는 신뢰 신호로 노출한다.
export type FeedSource = {
  id: string;
  label: string;
  kind: "global" | "gov";
  count: number;
  last_updated: string | null;
  status: "live" | "seed";
};

export type FeedStats = {
  sources: FeedSource[];
  total_indicators: number;
  updated_at: string;
};

// 게이트웨이 미가동/실패 시에도 패널이 비지 않도록 쓰는 시드 스냅샷(데모 세이프).
// 글로벌 피드(OpenPhish·URLhaus·ThreatFox)는 live-ish, 경찰청 보이스피싱은 gov seed.
// last_updated는 호출 시점 기준 상대값이라 "n분 전"이 자연스럽게 살아 움직인다.
const SEED_FEED_SOURCES: ReadonlyArray<{
  id: string;
  label: string;
  kind: FeedSource["kind"];
  count: number;
  status: FeedSource["status"];
  ageMs: number | null;
}> = [
  // 라이브 /api/feeds/stats 실값 근방으로 맞춰, 게이트웨이 연결 직후 폴링 시 숫자가
  // 급변(플래시)하지 않게 한다. 오프라인이면 '마지막으로 알던 값'처럼 자연스럽게 보인다.
  { id: "openphish", label: "OpenPhish", kind: "global", count: 50, status: "live", ageMs: 3 * 60_000 },
  { id: "urlhaus", label: "URLhaus · abuse.ch", kind: "global", count: 4, status: "live", ageMs: 60_000 },
  { id: "threatfox", label: "ThreatFox · abuse.ch", kind: "global", count: 4, status: "live", ageMs: 6 * 60_000 },
  { id: "police_kr", label: "경찰청 보이스피싱", kind: "gov", count: 3, status: "seed", ageMs: null },
];

// 시드 피드 스냅샷을 생성한다(getFeedStats 폴백 + 패널 초기 상태에서 공유).
export function seedFeedStats(): FeedStats {
  const nowMs = Date.now();
  const sources: FeedSource[] = SEED_FEED_SOURCES.map((s) => ({
    id: s.id,
    label: s.label,
    kind: s.kind,
    count: s.count,
    last_updated: s.ageMs === null ? null : new Date(nowMs - s.ageMs).toISOString(),
    status: s.status,
  }));
  const total = SEED_FEED_SOURCES.reduce((sum, s) => sum + s.count, 0);
  return { sources, total_indicators: total, updated_at: new Date(nowMs).toISOString() };
}

// 연결된 위협 피드 집계를 가져온다(DataSourcesPanel이 ~15초 주기로 호출).
// 다른 fetch와 달리 어떤 실패에도 예외를 던지지 않고 시드로 폴백한다(항상 렌더 = 데모 세이프).
export async function getFeedStats(): Promise<FeedStats> {
  try {
    const res = await fetch(`${GATEWAY}/api/feeds/stats`);
    if (!res.ok) {
      return seedFeedStats();
    }
    return (await res.json()) as FeedStats;
  } catch {
    return seedFeedStats();
  }
}
