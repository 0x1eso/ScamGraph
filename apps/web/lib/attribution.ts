// ScamGraph — 사기 조직 귀속(Attribution) API 클라이언트 (native fetch, 무의존)
// 단일 엔티티 → 공유 인프라 피벗으로 조직 전체를 복원하는 얇은 HTTP 레이어.

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

// 공유 인프라 피벗 한 건(같은 IP·계좌·전화·호스트를 몇 개 대상과 공유하는지).
export type Pivot = { type: string; value: string; sharedWith: number };

// gateway /api/attribution 응답과 정확히 일치해야 하는 귀속 결과 타입.
export type Attribution = {
  value: string;
  organization: string | null; // 캠페인/조직명, 연결 없으면 null
  entities: {
    domains: string[];
    phones: string[];
    accounts: string[];
    ips: string[];
  };
  pivots: Pivot[];
  sources: string[]; // 출처 라벨 예: ["규칙엔진","커뮤니티신고","공개데이터(WHOIS·DNS)"]
  summary: string; // 사람이 읽는 한 문장
};

// 대상 엔티티를 중심으로 연루된 사기 조직 인프라를 조회한다.
export async function getAttribution(value: string): Promise<Attribution> {
  const res = await fetch(
    `${GATEWAY}/api/attribution?value=${encodeURIComponent(value)}`,
  );
  if (!res.ok) {
    throw new Error(`귀속 분석 실패 (${res.status})`);
  }
  return (await res.json()) as Attribution;
}
