"use client";

// ScamGraph — 위협 스캔 콘솔
// 대상 입력 → gateway /api/scan 호출 → 위험 게이지 + 설명형 근거 카드 렌더.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

import { useState } from "react";
import { scan, type ScanResult } from "@/lib/api";

interface ScanConsoleProps {
  // 스캔 성공 시 상위(page)가 관계망을 확장하도록 결과를 넘겨준다.
  onResult?: (result: ScanResult) => void;
}

// 등급별 표시 색상(디자인 토큰 재사용)과 한글 라벨.
const GRADE_META: Record<ScanResult["grade"], { label: string; color: string }> = {
  danger: { label: "위험", color: "var(--danger)" },
  warning: { label: "경고", color: "var(--warn)" },
  caution: { label: "주의", color: "#c0cf3d" },
  safe: { label: "안전", color: "var(--accent-2)" },
};

const KIND_LABEL: Record<ScanResult["kind"], string> = {
  url: "URL",
  phone: "전화번호",
  account: "계좌",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다";
}

export default function ScanConsole({ onResult }: ScanConsoleProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const target = input.trim();
    if (!target || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scanResult = await scan(target);
      setResult(scanResult);
      onResult?.(scanResult);
    } catch (err: unknown) {
      // 데모 안전성: 실패해도 UI를 무너뜨리지 않고 인라인 안내만 노출.
      setError(getErrorMessage(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="console">
      <div className="console-head">
        <span className="led r" />
        <span className="led y" />
        <span className="led g" />
        <span style={{ marginLeft: 8 }}>scamgraph://threat-console</span>
      </div>

      <form className="console-body" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="의심 URL · 전화번호 · 계좌번호 입력 …"
          aria-label="위협 대상 입력"
          disabled={loading}
        />
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "SCANNING…" : "SCAN"}
        </button>
      </form>

      {loading && (
        <div className="sc-scanning" role="status" aria-live="polite">
          <span className="sc-scan-dot" aria-hidden="true" /> 엔진이 대상을 분석하는 중…
        </div>
      )}

      {error && !loading && (
        <div className="sc-error" role="alert">
          ⚠ 스캔에 실패했습니다 — {error}
        </div>
      )}

      {result && !loading && <ResultPanel result={result} />}

      <style>{SCAN_CONSOLE_CSS}</style>
    </div>
  );
}

// ── 결과 패널 ────────────────────────────────────────────────
function ResultPanel({ result }: { result: ScanResult }) {
  const meta = GRADE_META[result.grade];

  return (
    // key로 대상이 바뀔 때마다 진입 애니메이션을 재생한다.
    <div className="sc-result" key={result.target}>
      <div className="sc-result-top">
        <RiskGauge score={result.risk_score} color={meta.color} />

        <div className="sc-summary">
          <div className="sc-tags">
            <span className="sc-kind">{KIND_LABEL[result.kind]}</span>
            <span className="sc-grade" style={{ color: meta.color, borderColor: meta.color }}>
              {meta.label}
            </span>
          </div>
          <div className="sc-target" title={result.target}>
            {result.target}
          </div>
          <div className="sc-score-line">
            위험도 <b style={{ color: meta.color }}>{result.risk_score}</b>
            <span className="sc-score-max"> / 100</span>
          </div>
        </div>
      </div>

      <div className="sc-reasons-label">// 판단 근거 {result.reasons.length}건</div>
      <ul className="sc-reasons">
        {result.reasons.map((reason, i) => (
          <li className="sc-reason" key={`${reason.rule}-${i}`}>
            <span className="sc-rule">{reason.rule}</span>
            <span className="sc-weight">
              {reason.weight >= 0 ? "+" : ""}
              {reason.weight}
            </span>
            <span className="sc-detail">{reason.detail}</span>
          </li>
        ))}
        {result.reasons.length === 0 && (
          <li className="sc-reason sc-reason-empty">
            <span className="sc-detail">특이 위험 신호가 감지되지 않았습니다.</span>
          </li>
        )}
      </ul>
    </div>
  );
}

// ── 원형 위험 게이지 (SVG) ───────────────────────────────────
function RiskGauge({ score, color }: { score: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg className="sc-gauge" viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle
        className="sc-gauge-arc"
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" className="sc-gauge-num" fill={color}>
        {clamped}
      </text>
      <text x="60" y="78" textAnchor="middle" className="sc-gauge-unit">
        / 100
      </text>
    </svg>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const SCAN_CONSOLE_CSS = `
.sc-scanning {
  padding: 0 20px 16px;
  display: flex; align-items: center; gap: 8px;
  font-family: var(--mono); font-size: 12px; color: var(--accent);
}
.sc-scan-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent);
  animation: sc-pulse 1s ease-in-out infinite;
}
@keyframes sc-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }

.sc-error {
  margin: 0 20px 18px;
  padding: 12px 14px;
  border: 1px solid var(--danger);
  border-radius: 10px;
  background: rgba(255, 77, 109, 0.08);
  font-family: var(--mono); font-size: 12px; color: var(--danger);
}

.sc-result {
  border-top: 1px solid var(--line);
  padding: 24px 20px 22px;
  animation: sc-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes sc-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.sc-result-top { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }

.sc-gauge { flex: 0 0 auto; }
.sc-gauge-arc { transition: stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1); }
.sc-gauge-num { font-size: 30px; font-weight: 800; font-family: var(--sans); }
.sc-gauge-unit { font-size: 11px; font-family: var(--mono); fill: var(--text-mute); }

.sc-summary { flex: 1; min-width: 220px; }
.sc-tags { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.sc-kind {
  font-family: var(--mono); font-size: 10px; letter-spacing: 1px;
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--line); color: var(--text-dim);
}
.sc-grade {
  font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 1px;
  padding: 3px 10px; border-radius: 6px; border: 1px solid;
}
.sc-target {
  font-family: var(--mono); font-size: 14px; color: var(--text);
  word-break: break-all; margin-bottom: 8px;
}
.sc-score-line { font-size: 13px; color: var(--text-dim); }
.sc-score-line b { font-size: 22px; font-weight: 800; margin: 0 2px; }
.sc-score-max { color: var(--text-mute); }

.sc-reasons-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); margin: 22px 0 12px;
}
.sc-reasons { list-style: none; display: grid; gap: 10px; }
.sc-reason {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
  transition: border-color 0.18s ease, transform 0.18s ease;
}
.sc-reason:hover { border-color: var(--accent); transform: translateX(2px); }
.sc-rule {
  font-family: var(--mono); font-size: 12px; color: var(--accent);
  padding: 3px 8px; border-radius: 6px;
  background: rgba(0, 229, 192, 0.08); white-space: nowrap;
}
.sc-weight {
  font-family: var(--mono); font-size: 13px; font-weight: 700;
  color: var(--warn); white-space: nowrap;
}
.sc-detail { font-size: 13px; color: var(--text-dim); line-height: 1.5; }
.sc-reason-empty { grid-template-columns: 1fr; }

@media (max-width: 520px) {
  .sc-reason { grid-template-columns: auto 1fr; }
  .sc-weight { grid-column: 2; }
}
`;
