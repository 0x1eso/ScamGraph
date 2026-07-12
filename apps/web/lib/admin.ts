// ScamGraph — 관제 관리자 API 클라이언트 (native fetch, 무의존)
// /admin 콘솔이 사용하는 분석 지표 + 신고 모더레이션 HTTP 레이어.

import { GATEWAY } from "./api";

// 관리자 대시보드가 소비하는 집계 분석 스냅샷(게이트웨이 응답과 정확히 일치).
export type Analytics = {
  by_grade: { danger: number; warning: number; caution: number; safe: number };
  by_type: { url: number; phone: number; account: number };
  timeline: Array<{ date: string; count: number }>;
  totals: { reports: number; scans: number; confirmed: number };
};

// 모더레이션 대기열의 신고 한 건.
export type Report = {
  id: number;
  target: string;
  kind: string;
  note: string | null;
  status: string;
  votes: number;
  ts?: string;
};

// 등급·유형·추이·합계 분석 스냅샷을 가져온다.
export async function getAnalytics(): Promise<Analytics> {
  const res = await fetch(`${GATEWAY}/api/admin/analytics`);
  if (!res.ok) {
    throw new Error(`분석 지표 로드 실패 (${res.status})`);
  }
  return (await res.json()) as Analytics;
}

// 모더레이션 대상 신고 목록을 가져온다.
export async function getReports(limit = 100): Promise<Report[]> {
  const res = await fetch(`${GATEWAY}/api/reports?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`신고 목록 로드 실패 (${res.status})`);
  }
  return (await res.json()) as Report[];
}

// 신고를 확인/반려로 판정하고 갱신된 신고를 돌려받는다.
export async function moderateReport(
  id: number,
  status: "confirmed" | "rejected",
): Promise<Report> {
  const res = await fetch(`${GATEWAY}/api/reports/${id}/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`신고 판정 실패 (${res.status})`);
  }
  return (await res.json()) as Report;
}
