// ScamGraph — 통합 검색 API 클라이언트 (native fetch, 무의존)
// 상단 검색창이 도메인·번호·계좌·IP 등을 즉시 조회할 때 사용하는 얇은 레이어.

import { GATEWAY } from "./api";

// gateway 검색 응답과 정확히 일치해야 하는 히트 타입.
// type ∈ Target|Host|IP|Phone|Account|Report|Campaign, grade는 미평가 시 null.
export type SearchHit = {
  id: string;
  type: string;
  label: string;
  grade: "safe" | "caution" | "warning" | "danger" | null;
  risk: number | null;
};

export type SearchResponse = {
  query: string;
  hits: SearchHit[];
};

// 질의어(q)로 관계망 전반을 검색해 매칭 엔티티 목록을 돌려받는다.
export async function search(q: string): Promise<SearchResponse> {
  const res = await fetch(`${GATEWAY}/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    throw new Error(`검색 요청 실패 (${res.status})`);
  }
  return (await res.json()) as SearchResponse;
}
