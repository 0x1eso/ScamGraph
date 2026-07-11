// ScamGraph — 커뮤니티 신고 + 사후 대응 가이드 API 클라이언트 (native fetch, 무의존)
// 신고(플라이휠)와 위협 등급별 행동 지침을 게이트웨이에서 가져오는 얇은 HTTP 레이어.

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

// gateway /api/report 응답과 정확히 일치해야 하는 신고 결과 타입.
// reports = 이 대상의 누적 커뮤니티 신고 수(신고할수록 모두가 더 안전해진다).
export type ReportResult = { status: string; target: string; reports: number };

// 사후 대응 가이드의 개별 단계(제목 + 상세, 선택적으로 실행 버튼).
export type GuidanceStep = {
  title: string;
  detail: string;
  action?: { label: string; href: string }; // tel: 또는 https://…
};

// gateway /api/guidance 응답과 정확히 일치해야 하는 대응 지침 타입.
export type Guidance = {
  kind: string;
  grade: string;
  headline: string;
  steps: GuidanceStep[];
  hotlines: { name: string; contact: string }[]; // contact = "tel:112" 또는 "https://…"
};

// 대상을 커뮤니티에 신고한다(신고 → 모두 보호로 이어지는 플라이휠의 입력).
export async function report(
  target: string,
  kind: string,
  note: string,
): Promise<ReportResult> {
  const res = await fetch(`${GATEWAY}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, kind, note }),
  });
  if (!res.ok) {
    throw new Error(`신고 요청 실패 (${res.status})`);
  }
  return (await res.json()) as ReportResult;
}

// 위협 종류·등급에 맞는 사후 대응 지침(할 일 + 신고 핫라인)을 가져온다.
export async function getGuidance(
  kind: string,
  grade: string,
): Promise<Guidance> {
  const res = await fetch(
    `${GATEWAY}/api/guidance?kind=${encodeURIComponent(kind)}&grade=${encodeURIComponent(grade)}`,
  );
  if (!res.ok) {
    throw new Error(`대응 가이드 로드 실패 (${res.status})`);
  }
  return (await res.json()) as Guidance;
}
