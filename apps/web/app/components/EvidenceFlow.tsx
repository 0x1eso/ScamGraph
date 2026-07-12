"use client";

// ScamGraph — 증거 흐름 미니 시각화 (분석 모드 전용)
// 스캔 결과의 근거(reasons)를 좌→우 흐름으로 압축해 보여준다:
//   입력 → 정규화 → 규칙 히트들 → 최종 등급
// 그리고 각 규칙의 가중치 기여도를 미니 워터폴(세그먼트 바)로 렌더한다.
// "왜 이 점수인가"를 한눈에 설명 — 설명 가능성이 세일즈 포인트(순수 SW, 근거 필수).
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

import type { ScanReason, ScanResult } from "@/lib/api";

interface EvidenceFlowProps {
  result: ScanResult;
}

// 등급별 표시 색상/라벨 — ScanConsole의 GRADE_META와 동일 팔레트(디자인 토큰 재사용).
const GRADE_META: Record<ScanResult["grade"], { label: string; color: string }> = {
  danger: { label: "위험", color: "var(--danger)" },
  warning: { label: "경고", color: "var(--warn)" },
  caution: { label: "주의", color: "#ca8a04" },
  safe: { label: "안전", color: "var(--accent-2)" },
};

const KIND_LABEL: Record<ScanResult["kind"], string> = {
  url: "URL",
  phone: "전화번호",
  account: "계좌",
};

// 워터폴 세그먼트 한 조각(원본 reason에서 파생한 표시용 값).
interface Contribution {
  rule: string;
  weight: number;
  // 전체 |가중치| 합 대비 이 조각의 폭(%).
  pct: number;
  // 위험을 올리면(+) risk, 내리면(-) safe.
  tone: "risk" | "safe";
}

// reasons → 기여도 세그먼트. |가중치| 비율로 폭을 정하고 부호로 색을 나눈다.
// 원본 불변: reasons를 복사/파생만 하고 정렬로도 건드리지 않는다.
function toContributions(reasons: ReadonlyArray<ScanReason>): Contribution[] {
  const totalAbs = reasons.reduce((sum, r) => sum + Math.abs(r.weight), 0);
  if (totalAbs <= 0) {
    return [];
  }
  return reasons.map((r) => ({
    rule: r.rule,
    weight: r.weight,
    pct: (Math.abs(r.weight) / totalAbs) * 100,
    tone: r.weight >= 0 ? "risk" : "safe",
  }));
}

function signed(weight: number): string {
  return `${weight >= 0 ? "+" : ""}${weight}`;
}

export default function EvidenceFlow({ result }: EvidenceFlowProps) {
  const meta = GRADE_META[result.grade];
  const contributions = toContributions(result.reasons);
  const hitCount = result.reasons.length;

  return (
    <div className="evf" key={result.target}>
      <div className="evf-title">// 증거 흐름</div>

      {/* ── 흐름 레일: 입력 → 정규화 → 규칙 N건 → 최종 등급 ── */}
      <div className="evf-rail" role="list" aria-label="판정 흐름">
        <FlowStep k="입력" v={result.target} mono truncate role="listitem" />
        <FlowArrow />
        <FlowStep k="정규화" v={KIND_LABEL[result.kind]} role="listitem" />
        <FlowArrow />
        <FlowStep k="규칙 히트" v={`${hitCount}건`} role="listitem" />
        <FlowArrow />
        <FlowStep
          k="최종 등급"
          v={`${meta.label} · ${result.risk_score}`}
          color={meta.color}
          emphasis
          role="listitem"
        />
      </div>

      {/* ── 가중치 워터폴: 규칙별 기여도 세그먼트 + 범례 ── */}
      {contributions.length > 0 ? (
        <div className="evf-waterfall">
          <div className="evf-wf-head">
            <span className="evf-wf-label">가중치 기여도</span>
            <span className="evf-wf-legend">
              <span className="evf-dot evf-dot-risk" /> 위험 상승
              <span className="evf-dot evf-dot-safe" /> 위험 하강
            </span>
          </div>

          <div className="evf-bar" role="img" aria-label="규칙별 가중치 기여도">
            {contributions.map((c, i) => (
              <span
                key={`${c.rule}-${i}`}
                className={`evf-seg evf-seg-${c.tone}`}
                style={{ flexBasis: `${c.pct}%`, animationDelay: `${i * 70}ms` }}
                title={`${c.rule} · ${signed(c.weight)}`}
              />
            ))}
          </div>

          <div className="evf-chips">
            {contributions.map((c, i) => (
              <span key={`${c.rule}-chip-${i}`} className={`evf-chip evf-chip-${c.tone}`}>
                <span className="evf-chip-rule">{c.rule}</span>
                <span className="evf-chip-w">{signed(c.weight)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="evf-empty">감지된 위험 신호 없음 · 규칙 기반 정상 판정</div>
      )}

      <style>{EVIDENCE_FLOW_CSS}</style>
    </div>
  );
}

// ── 흐름 단계 노드 ─────────────────────────────────────────────
interface FlowStepProps {
  k: string;
  v: string;
  color?: string;
  mono?: boolean;
  truncate?: boolean;
  emphasis?: boolean;
  role?: string;
}

function FlowStep({ k, v, color, mono, truncate, emphasis, role }: FlowStepProps) {
  return (
    <div className={`evf-step${emphasis ? " evf-step-emph" : ""}`} role={role}>
      <div className="evf-step-k">{k}</div>
      <div
        className={`evf-step-v${mono ? " evf-mono" : ""}${truncate ? " evf-trunc" : ""}`}
        style={color ? { color } : undefined}
        title={truncate ? v : undefined}
      >
        {v}
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <span className="evf-arrow" aria-hidden="true">
      →
    </span>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const EVIDENCE_FLOW_CSS = `
.evf {
  margin: 22px 0 4px;
  padding: 16px 16px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  animation: evf-rise 0.5s var(--ease-out-expo) both;
}
@keyframes evf-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.evf-title {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); margin-bottom: 14px;
}

/* ── 흐름 레일 ── */
.evf-rail {
  display: flex; align-items: stretch; gap: 8px;
  flex-wrap: wrap;
}
.evf-step {
  flex: 1 1 auto;
  min-width: 96px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
}
.evf-step-emph {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(0, 229, 192, 0.2);
}
.evf-step-k {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
  color: var(--text-mute); margin-bottom: 5px;
}
.evf-step-v {
  font-size: 13px; font-weight: 700; color: var(--text);
  line-height: 1.3;
}
.evf-mono { font-family: var(--mono); font-size: 12px; }
.evf-trunc {
  max-width: 200px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.evf-arrow {
  align-self: center;
  font-family: var(--mono); font-size: 15px; color: var(--accent);
  flex: 0 0 auto;
}

/* ── 가중치 워터폴 ── */
.evf-waterfall { margin-top: 16px; }
.evf-wf-head {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 8px;
  margin-bottom: 8px;
}
.evf-wf-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.5px; color: var(--text-dim);
}
.evf-wf-legend {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
}
.evf-dot {
  width: 8px; height: 8px; border-radius: 2px; display: inline-block;
  margin-left: 6px;
}
.evf-dot-risk { background: var(--danger); }
.evf-dot-safe { background: var(--accent-2); }

.evf-bar {
  display: flex; gap: 3px;
  height: 26px;
  border-radius: 8px;
  overflow: hidden;
}
.evf-seg {
  flex-grow: 0; flex-shrink: 1;
  min-width: 5px;
  border-radius: 4px;
  /* transform 기반이라 컴포지터 친화적 — 레이아웃 리플로우 없음. */
  transform: scaleX(0);
  transform-origin: left center;
  animation: evf-grow 0.6s var(--ease-out-expo) both;
}
.evf-seg-risk { background: linear-gradient(180deg, var(--danger), #d93a58); }
.evf-seg-safe { background: linear-gradient(180deg, var(--accent-2), #5fc72f); }
@keyframes evf-grow {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.evf-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-top: 12px;
}
.evf-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--bg-elev);
  font-family: var(--mono); font-size: 11px;
}
.evf-chip-rule { color: var(--text-dim); }
.evf-chip-w { font-weight: 800; }
.evf-chip-risk { border-color: rgba(255, 77, 109, 0.4); }
.evf-chip-risk .evf-chip-w { color: var(--danger); }
.evf-chip-safe { border-color: rgba(124, 240, 61, 0.4); }
.evf-chip-safe .evf-chip-w { color: var(--accent-2); }

.evf-empty {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  font-family: var(--mono); font-size: 12px; color: var(--text-mute);
}

@media (max-width: 520px) {
  .evf-arrow { display: none; }
  .evf-step { min-width: 0; flex-basis: calc(50% - 4px); }
  .evf-trunc { max-width: 140px; }
}
`;
