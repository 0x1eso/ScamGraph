// ScamGraph — gateway API 클라이언트 (native fetch, 무의존)
// 스캔 콘솔 + 그래프 탐색이 공유하는 얇은 HTTP 레이어.

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

// gateway/engine 응답과 정확히 일치해야 하는 스캔 결과 타입.
export type ScanReason = { rule: string; weight: number; detail: string };
export type ScanResult = {
  target: string;
  job_id: string | null;
  kind: "url" | "phone" | "account";
  risk_score: number;
  grade: "safe" | "caution" | "warning" | "danger";
  reasons: ScanReason[];
};

// 그래프 데이터 타입은 그래프 트랙이 소유(@/app/data/mockGraph).
type GraphData = import("@/app/data/mockGraph").GraphData;

// 대상(URL·전화번호·계좌)을 스캔하고 위험도 + 근거를 돌려받는다.
export async function scan(target: string): Promise<ScanResult> {
  const res = await fetch(`${GATEWAY}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  if (!res.ok) {
    throw new Error(`스캔 요청 실패 (${res.status})`);
  }
  return (await res.json()) as ScanResult;
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
