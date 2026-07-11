"use client";

// ScamGraph — 위협 스캔 콘솔
// 대상 입력 → gateway /api/scan 호출 → 위험 게이지 + 설명형 근거 카드 렌더.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

import { useState } from "react";
import { scan, type ScanReason, type ScanResult } from "@/lib/api";

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

// 출처(외부 피드) 근거를 위로, external_feed_hit(신뢰 헤드라인)을 최상단으로 끌어올린다.
function reasonRank(reason: ScanReason): number {
  if (reason.rule === "external_feed_hit") {
    return 0;
  }
  if (typeof reason.source === "string" && reason.source.length > 0) {
    return 1;
  }
  return 2;
}

function hasSource(reason: ScanReason): reason is ScanReason & { source: string } {
  return typeof reason.source === "string" && reason.source.length > 0;
}

// 근거 한 건. source가 있으면 "출처 칩"으로, external_feed_hit이면 액센트로 강조한다.
function ReasonItem({ reason }: { reason: ScanReason }) {
  const signed = `${reason.weight >= 0 ? "+" : ""}${reason.weight}`;

  if (hasSource(reason)) {
    const isFeedHit = reason.rule === "external_feed_hit";
    return (
      <li className={`sc-reason sc-src${isFeedHit ? " sc-src-feed" : ""}`}>
        <div className="sc-src-top">
          <span className="sc-src-badge">출처</span>
          <span className="sc-src-name">◆ {reason.source}</span>
          {isFeedHit && <span className="sc-src-headline">실제 위협 피드 등재</span>}
          <span className="sc-src-weight">{signed}</span>
        </div>
        <div className="sc-src-detail">{reason.detail}</div>
        {reason.first_seen && <div className="sc-src-meta">최초 관측 · {reason.first_seen}</div>}
      </li>
    );
  }

  return (
    <li className="sc-reason">
      <span className="sc-rule">{reason.rule}</span>
      <span className="sc-weight">{signed}</span>
      <span className="sc-detail">{reason.detail}</span>
    </li>
  );
}

// ── 결과 패널 ────────────────────────────────────────────────
function ResultPanel({ result }: { result: ScanResult }) {
  const meta = GRADE_META[result.grade];
  // 원본 불변: 복사본을 정렬해 출처·피드 근거를 상단에 배치한다.
  const orderedReasons = [...result.reasons].sort((a, b) => reasonRank(a) - reasonRank(b));

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

      {result.feed_sources && result.feed_sources.length > 0 && (
        <div className="sc-feeds" role="note">
          <span className="sc-feeds-label">📡 위협 피드 대조</span>
          <span className="sc-feeds-chips">
            {result.feed_sources.map((source) => (
              <span className="sc-feeds-chip" key={source}>
                ◆ {source}
              </span>
            ))}
          </span>
          <span className="sc-feeds-note">실제 외부 위협 피드에 등재된 지표</span>
        </div>
      )}

      <div className="sc-reasons-label">// 판단 근거 {orderedReasons.length}건</div>
      <ul className="sc-reasons">
        {orderedReasons.map((reason, i) => (
          <ReasonItem reason={reason} key={`${reason.rule}-${i}`} />
        ))}
        {orderedReasons.length === 0 && (
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

/* 위협 피드 대조 배너 — feed_sources 요약. "실제 외부 데이터에 등재됨" 신뢰 헤드라인. */
.sc-feeds {
  margin-top: 20px;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(0, 229, 192, 0.08), rgba(0, 229, 192, 0.02));
}
.sc-feeds-label {
  font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
  color: var(--accent);
}
.sc-feeds-chips { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.sc-feeds-chip {
  font-family: var(--mono); font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 6px;
  color: #04120f; background: var(--accent);
}
.sc-feeds-note {
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
  margin-left: auto; letter-spacing: 0.3px;
}

/* 출처 칩 — source 필드를 가진 근거. 외부 데이터에 근거함을 의미로 강조한다. */
.sc-src {
  display: block;
  border-color: rgba(0, 229, 192, 0.28);
  background: linear-gradient(180deg, rgba(0, 229, 192, 0.05), var(--bg-elev));
}
/* external_feed_hit — "실제 위협 피드 등재" 신뢰 헤드라인. 액센트 테두리 + 살짝 크게. */
.sc-src-feed {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(0, 229, 192, 0.25), 0 6px 24px rgba(0, 229, 192, 0.12);
  padding: 15px 16px;
}
.sc-src-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sc-src-badge {
  font-family: var(--mono); font-size: 9px; font-weight: 700; letter-spacing: 1px;
  text-transform: uppercase;
  padding: 2px 7px; border-radius: 999px;
  color: var(--accent); border: 1px solid rgba(0, 229, 192, 0.45);
  background: rgba(0, 229, 192, 0.08);
}
.sc-src-name { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--text); }
.sc-src-feed .sc-src-name { font-size: 15px; color: var(--accent); }
.sc-src-headline {
  font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
  color: #04120f; background: var(--accent);
  padding: 2px 8px; border-radius: 6px;
}
.sc-src-weight {
  margin-left: auto;
  font-family: var(--mono); font-size: 14px; font-weight: 800; color: var(--warn);
  white-space: nowrap;
}
.sc-src-feed .sc-src-weight { color: var(--danger); }
.sc-src-detail { font-size: 13px; color: var(--text); line-height: 1.55; margin-top: 9px; }
.sc-src-meta {
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
  margin-top: 8px; letter-spacing: 0.5px;
}

@media (max-width: 520px) {
  .sc-reason { grid-template-columns: auto 1fr; }
  .sc-weight { grid-column: 2; }
}
`;
