// ScamGraph — 관계망 시각화용 목 데이터
// infra/neo4j/seed.cypher 의 네트워크를 그대로 미러링한다.
// 핵심 단서: IP 203.0.113.44 를 두 캠페인(택배사칭-A, 은행피싱-B)의
// 모든 Host 가 공유 → 별개로 보이던 두 조직이 하나로 연결된다.

export type GraphNode = {
  id: string;
  label: string;
  type: "Campaign" | "Target" | "Host" | "IP" | "Phone" | "Account" | "Report";
  grade?: "safe" | "caution" | "warning" | "danger";
  risk_score?: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: string;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

// Host 이름은 Target 값과 문자열이 같으므로(예: "shinhan-otp.xyz"),
// 노드 id 충돌을 막기 위해 Host 는 "host:" 접두사로 유일하게 유지하고
// 화면 라벨(label)은 사람이 읽는 원래 값을 그대로 쓴다.
export const mockGraph: GraphData = {
  nodes: [
    // 캠페인 A — 택배 사칭 스미싱
    { id: "택배사칭-A", label: "택배사칭-A", type: "Campaign" },
    { id: "cj-delivery-check.top", label: "cj-delivery-check.top", type: "Target", grade: "danger", risk_score: 92 },
    { id: "cj-delivery-track.xyz", label: "cj-delivery-track.xyz", type: "Target", grade: "danger", risk_score: 88 },
    { id: "host:cj-delivery-check.top", label: "cj-delivery-check.top", type: "Host" },
    { id: "host:cj-delivery-track.xyz", label: "cj-delivery-track.xyz", type: "Host" },
    { id: "070-4123-9981", label: "070-4123-9981", type: "Phone" },
    { id: "352-9981-2210-11", label: "농협 352-9981-2210-11", type: "Account" },

    // 캠페인 B — 은행 피싱
    { id: "은행피싱-B", label: "은행피싱-B", type: "Campaign" },
    { id: "kbstat-secure.click", label: "kbstat-secure.click", type: "Target", grade: "danger", risk_score: 95 },
    { id: "shinhan-otp.xyz", label: "shinhan-otp.xyz", type: "Target", grade: "danger", risk_score: 90 },
    { id: "host:kbstat-secure.click", label: "kbstat-secure.click", type: "Host" },
    { id: "host:shinhan-otp.xyz", label: "shinhan-otp.xyz", type: "Host" },
    { id: "070-8842-1120", label: "070-8842-1120", type: "Phone" },
    { id: "110-441-882201", label: "신한 110-441-882201", type: "Account" },

    // 공유 인프라 — 두 조직을 연결하는 결정적 노드
    { id: "203.0.113.44", label: "203.0.113.44", type: "IP" },

    // 시민 신고 (커뮤니티 검증)
    { id: "report:r1", label: "신고 · 택배 문자 클릭 유도", type: "Report" },
    { id: "report:r2", label: "신고 · OTP 입력 요구", type: "Report" },
  ],
  edges: [
    // 캠페인 A
    { source: "택배사칭-A", target: "cj-delivery-check.top", type: "USES" },
    { source: "택배사칭-A", target: "cj-delivery-track.xyz", type: "USES" },
    { source: "cj-delivery-check.top", target: "host:cj-delivery-check.top", type: "RESOLVES_TO" },
    { source: "cj-delivery-track.xyz", target: "host:cj-delivery-track.xyz", type: "RESOLVES_TO" },
    { source: "host:cj-delivery-check.top", target: "203.0.113.44", type: "HOSTED_ON" },
    { source: "host:cj-delivery-track.xyz", target: "203.0.113.44", type: "HOSTED_ON" },
    { source: "택배사칭-A", target: "070-4123-9981", type: "CONTACT" },
    { source: "택배사칭-A", target: "352-9981-2210-11", type: "PAYOUT" },

    // 캠페인 B
    { source: "은행피싱-B", target: "kbstat-secure.click", type: "USES" },
    { source: "은행피싱-B", target: "shinhan-otp.xyz", type: "USES" },
    { source: "kbstat-secure.click", target: "host:kbstat-secure.click", type: "RESOLVES_TO" },
    { source: "shinhan-otp.xyz", target: "host:shinhan-otp.xyz", type: "RESOLVES_TO" },
    { source: "host:kbstat-secure.click", target: "203.0.113.44", type: "HOSTED_ON" },
    { source: "host:shinhan-otp.xyz", target: "203.0.113.44", type: "HOSTED_ON" },
    { source: "은행피싱-B", target: "070-8842-1120", type: "CONTACT" },
    { source: "은행피싱-B", target: "110-441-882201", type: "PAYOUT" },

    // 시민 신고
    { source: "report:r1", target: "cj-delivery-check.top", type: "REPORTS" },
    { source: "report:r2", target: "kbstat-secure.click", type: "REPORTS" },
  ],
};
