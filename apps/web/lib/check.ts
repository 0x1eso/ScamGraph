// ScamGraph — 공유 대상(share_target) 판정 클라이언트 (native fetch, 무의존)
// 다른 앱에서 공유된 링크·번호를 gateway /api/check 로 넘겨 즉시 안전 판정을 받는다.
// "웹사이트를 찾아오지 않는다 — 검사를 사용자에게 가져간다"는 목표를 위한 얇은 HTTP 레이어.

import { GATEWAY } from "./api";

// gateway /api/check 응답과 정확히 일치해야 하는 판정 결과 타입.
export type CheckResult = {
  value: string;
  kind: string;
  grade: "safe" | "caution" | "warning" | "danger" | "unknown";
  risk_score: number | null;
  reasons: { rule: string; weight: number; detail: string }[];
  organization: string | null;
  recommendation: string;
};

// 단일 값(URL·전화·계좌)을 검사해 등급 + 근거 + 권고를 돌려받는다.
export async function check(value: string): Promise<CheckResult> {
  const res = await fetch(
    `${GATEWAY}/api/check?value=${encodeURIComponent(value)}`,
  );
  if (!res.ok) {
    throw new Error(`검사 요청 실패 (${res.status})`);
  }
  return (await res.json()) as CheckResult;
}

// 공유 페이로드에서 실제로 검사할 값을 추려낸다.
// 우선순위: url 파라미터 → 텍스트 속 첫 URL → 전화/계좌 유사 토큰 → 원문 트림.
// 공유되는 메시지에는 대개 URL이나 번호가 포함되어 있다는 전제.
export function extractValue(shared: {
  text?: string;
  url?: string;
  title?: string;
}): string {
  // 1) 명시적 url 파라미터가 있으면 그대로 사용.
  const explicitUrl = shared.url?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  // 공유 앱마다 링크를 text/title 어디에 넣을지 제각각이라 함께 훑는다.
  const haystack = [shared.text, shared.title]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");

  // 2) 텍스트 안의 첫 URL(http(s):// 또는 www.).
  const urlMatch = haystack.match(/\bhttps?:\/\/[^\s<>"']+/i);
  if (urlMatch) {
    return urlMatch[0];
  }
  const wwwMatch = haystack.match(/\bwww\.[^\s<>"']+/i);
  if (wwwMatch) {
    return wwwMatch[0];
  }

  // 3) 전화번호 유사 토큰(하이픈·공백 포함, 숫자 9자리 이상).
  const phoneMatch = haystack.match(/\+?\d[\d\s-]{7,}\d/);
  if (phoneMatch) {
    return phoneMatch[0].trim();
  }

  // 4) 계좌 유사 토큰(숫자 위주, 하이픈 허용, 10자리 이상 연속).
  const accountMatch = haystack.match(/\b\d[\d-]{9,}\b/);
  if (accountMatch) {
    return accountMatch[0];
  }

  // 5) 아무 패턴도 못 찾으면 원문(또는 title)을 트림해 그대로 넘긴다.
  return (shared.text ?? shared.title ?? "").trim();
}
