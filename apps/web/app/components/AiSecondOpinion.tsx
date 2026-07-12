"use client";

// ScamGraph — AI 2차 소견 (참고용)
// 규칙 판정 결과 아래에 붙는 SEPARATE 패널. 규칙 엔진 판정과 별개인 GLM 기반 독립 소견.
// 규칙 엔진 + 근거가 신뢰의 뼈대이고, 이 패널은 명시적으로 라벨링된 부가 계층일 뿐이다.
// (설명가능·AI 아님 포지셔닝 유지 — AI 소견은 "참고용" 보너스)
//
// 데모 세이프: fetchJson 이 어떤 실패에도 예외를 던지지 않고 available:false 폴백을 준다.
// 키 미설정/일시 불가면 조용한 한 줄만 노출하고, 스캔 흐름·기존 결과 렌더에는 전혀 영향이 없다.

import { useEffect, useState } from "react";
import { fetchJson, type ScanResult } from "@/lib/api";

interface AiSecondOpinionProps {
  // 방금 스캔한 규칙 결과. AI 호출의 컨텍스트로 그대로 넘긴다(규칙을 대체하지 않음).
  result: ScanResult;
}

type AiReason = { point: string; detail: string };

type AiOpinion =
  | {
      available: true;
      grade: string;
      score: number;
      summary: string;
      reasons: AiReason[];
      agrees_with_rule: boolean;
      disclaimer?: string;
      model: string;
    }
  | { available: false; reason: string };

// AI 등급 → 한글 라벨 + 색(디자인 토큰 재사용). unknown 은 규칙과 구분되는 뉴트럴.
const AI_GRADE_META: Record<string, { label: string; color: string }> = {
  danger: { label: "위험", color: "var(--danger)" },
  warning: { label: "경고", color: "var(--warn)" },
  caution: { label: "주의", color: "var(--caution)" },
  safe: { label: "안전", color: "var(--safe)" },
  unknown: { label: "판단 보류", color: "var(--text-mute)" },
};

function gradeMeta(grade: string): { label: string; color: string } {
  return AI_GRADE_META[grade] ?? AI_GRADE_META.unknown;
}

export default function AiSecondOpinion({ result }: AiSecondOpinionProps) {
  const [state, setState] = useState<AiOpinion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setState(null);

    const body = {
      target: result.target,
      kind: result.kind,
      rule_grade: result.grade,
      rule_score: result.risk_score,
      // 규칙 근거는 rule/detail 만 컨텍스트로 전달(가중치 등은 불필요).
      rule_reasons: result.reasons.map((r) => ({ rule: r.rule, detail: r.detail })),
    };

    // 클라 측 타임아웃 — glm-5.2 추론 지연(게이트웨이 read 45s)보다 넉넉히 잡아,
    // 게이트웨이가 멈춰도 패널이 무한 로딩에 걸리지 않게 한다. 비차단 보조 패널이라 몇 초 로딩은 OK.
    const timeoutSignal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(50_000)
        : undefined;

    // fetchJson = 데모 세이프 헬퍼. 실패(네트워크·비200·JSON 파싱·타임아웃)에도 폴백을 돌려준다.
    fetchJson<AiOpinion>("/api/ai/opinion", {
      fallback: { available: false, reason: "일시 불가" },
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: timeoutSignal,
      },
    }).then((data) => {
      if (!alive) {
        return;
      }
      setState(data);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [result.target, result.grade, result.risk_score]);

  return (
    <div className="ai-op" role="complementary" aria-label="AI 2차 소견">
      <div className="ai-op-head">
        <span className="ai-op-pill">AI</span>
        <span className="ai-op-title">AI 2차 소견</span>
        <span className="ai-op-ref">참고용 · 규칙 판정과 별개</span>
      </div>

      {loading && (
        <div className="ai-op-loading" role="status" aria-live="polite">
          <span className="ai-op-dot" aria-hidden="true" />
          AI 2차 소견 분석 중…
        </div>
      )}

      {!loading && state && !state.available && (
        <div className="ai-op-off">
          AI 2차 소견: {state.reason}
          <span className="ai-op-off-note"> — 규칙 판정은 위 결과가 기준입니다</span>
        </div>
      )}

      {!loading && state && state.available && <AiOpinionBody op={state} />}

      <style>{AI_OPINION_CSS}</style>
    </div>
  );
}

function AiOpinionBody({
  op,
}: {
  op: Extract<AiOpinion, { available: true }>;
}) {
  const meta = gradeMeta(op.grade);
  const clamped = Math.max(0, Math.min(100, op.score));

  return (
    <div className="ai-op-body" key={op.summary}>
      <div className="ai-op-verdict">
        <span
          className="ai-op-grade"
          style={{ color: meta.color, borderColor: meta.color }}
        >
          {meta.label}
        </span>
        <span className="ai-op-score">
          AI 위험도 <b style={{ color: meta.color }}>{clamped}</b>
          <span className="ai-op-score-max"> / 100</span>
        </span>
        <span
          className={`ai-op-agree ${op.agrees_with_rule ? "yes" : "no"}`}
          title="규칙 엔진 판정과의 일치 여부"
        >
          {op.agrees_with_rule ? "규칙 판정과 일치" : "규칙 판정과 견해차"}
        </span>
      </div>

      {op.summary && <p className="ai-op-summary">{op.summary}</p>}

      {op.reasons.length > 0 && (
        <>
          <div className="ai-op-reasons-label">// AI 근거 {op.reasons.length}건</div>
          <ul className="ai-op-reasons">
            {op.reasons.map((r, i) => (
              <li className="ai-op-reason" key={`${r.point}-${i}`}>
                {r.point && <span className="ai-op-reason-point">{r.point}</span>}
                <span className="ai-op-reason-detail">{r.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="ai-op-foot">
        <span className="ai-op-model">◇ {op.model}</span>
        <span className="ai-op-disclaimer">
          {op.disclaimer ?? "AI 2차 소견은 참고용이며 규칙 판정과 별개입니다."}
        </span>
      </div>
    </div>
  );
}

// 스코프드 스타일 — globals.css 를 건드리지 않고 토큰만 재사용한다.
// 규칙 카드(인디고 --accent)와 시각적으로 구분되도록 violet 액센트 + 파선 테두리.
const AI_OPINION_CSS = `
.ai-op {
  --ai-violet: #7c3aed;
  --ai-violet-soft: #f2ecfe;
  margin: 14px 20px 20px;
  padding: 16px 16px 14px;
  border: 1px dashed var(--ai-violet);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--ai-violet-soft), var(--bg-card));
  animation: ai-op-rise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes ai-op-rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-op-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.ai-op-pill {
  font-family: var(--mono); font-size: 10px; font-weight: 800; letter-spacing: 1px;
  color: #fff; background: var(--ai-violet);
  padding: 2px 9px; border-radius: 999px;
}
.ai-op-title { font-size: 14px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
.ai-op-ref {
  font-family: var(--mono); font-size: 10px; color: var(--ai-violet);
  margin-left: auto; letter-spacing: 0.3px;
}

.ai-op-loading {
  margin-top: 12px;
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 12px; color: var(--ai-violet);
}
.ai-op-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--ai-violet);
  animation: ai-op-pulse 1s ease-in-out infinite;
}
@keyframes ai-op-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }

.ai-op-off {
  margin-top: 10px;
  font-family: var(--mono); font-size: 12px; color: var(--text-mute);
}
.ai-op-off-note { color: var(--text-mute); opacity: 0.8; }

.ai-op-body { margin-top: 12px; }
.ai-op-verdict { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ai-op-grade {
  font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 1px;
  padding: 3px 10px; border-radius: 6px; border: 1px solid;
}
.ai-op-score { font-size: 13px; color: var(--text-dim); }
.ai-op-score b { font-size: 20px; font-weight: 800; margin: 0 2px; }
.ai-op-score-max { color: var(--text-mute); }
.ai-op-agree {
  margin-left: auto;
  font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.3px;
  padding: 3px 9px; border-radius: 999px; border: 1px solid;
}
.ai-op-agree.yes { color: var(--safe); border-color: var(--safe); background: var(--safe-soft); }
.ai-op-agree.no { color: var(--warn); border-color: var(--warn); background: var(--warn-soft); }

.ai-op-summary {
  margin: 12px 0 0;
  font-size: 13.5px; line-height: 1.6; color: var(--text);
}

.ai-op-reasons-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); margin: 16px 0 10px;
}
.ai-op-reasons { list-style: none; display: grid; gap: 8px; margin: 0; padding: 0; }
.ai-op-reason {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--ai-violet);
  border-radius: 8px;
  background: var(--bg-elev);
}
.ai-op-reason-point {
  display: block;
  font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--ai-violet);
  margin-bottom: 4px;
}
.ai-op-reason-detail { font-size: 13px; color: var(--text-dim); line-height: 1.55; }

.ai-op-foot {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px dashed var(--line-strong);
}
.ai-op-model {
  font-family: var(--mono); font-size: 11px; font-weight: 700; color: var(--ai-violet);
}
.ai-op-disclaimer {
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
  margin-left: auto; letter-spacing: 0.2px;
}

@media (prefers-reduced-motion: reduce) {
  .ai-op { animation: none; }
  .ai-op-dot { animation: none; opacity: 0.7; }
}

@media (max-width: 520px) {
  .ai-op-ref, .ai-op-agree, .ai-op-disclaimer { margin-left: 0; }
}
`;
