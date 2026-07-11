"use client";

// ScamGraph — 웹 공유 대상(Web Share Target) 랜딩 (/share)
// 다른 앱의 공유 시트에서 넘어온 링크·번호를 즉시 검사해 전체 화면 판정을 보여준다.
// "웹사이트를 찾아오지 않는다 — 검사를 사용자에게 가져간다"의 실제 진입점.
// 폰 공유 시트에서 열리므로 모바일 우선 + 데모 안전(에러가 나도 절대 크래시 금지).

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { check, extractValue, type CheckResult } from "@/lib/check";

// 등급별 표시 색상(디자인 토큰 재사용) + 한글 라벨. ScanConsole과 동일 팔레트.
const GRADE_META: Record<
  CheckResult["grade"],
  { label: string; color: string }
> = {
  danger: { label: "위험", color: "var(--danger)" },
  warning: { label: "경고", color: "var(--warn)" },
  caution: { label: "주의", color: "#c0cf3d" },
  safe: { label: "안전", color: "var(--accent-2)" },
  unknown: { label: "미확인", color: "var(--text-mute)" },
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다";
}

// Suspense 경계: Next 15에서 useSearchParams는 Suspense 안에서만 안전하다.
export default function SharePage() {
  return (
    <main className="sv">
      <Suspense fallback={<ShareBooting />}>
        <ShareVerdict />
      </Suspense>
      <style>{SHARE_CSS}</style>
    </main>
  );
}

function ShareBooting() {
  return (
    <div className="sv-shell">
      <div className="sv-eyebrow">SCAMGRAPH · 공유 검사</div>
      <div className="sv-loading" role="status" aria-live="polite">
        <span className="sv-loading-dot" /> 공유 내용을 여는 중…
      </div>
    </div>
  );
}

function ShareVerdict() {
  const params = useSearchParams();

  // 공유 페이로드에서 검사할 값을 추린다(매 렌더 저비용 계산).
  const sharedValue = extractValue({
    title: params.get("title") ?? undefined,
    text: params.get("text") ?? undefined,
    url: params.get("url") ?? undefined,
  });

  const [input, setInput] = useState(sharedValue);
  const [checked, setChecked] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 연속 재검사 시 이전 응답이 늦게 도착해 화면을 덮어쓰지 않도록 토큰으로 방어.
  const reqToken = useRef(0);

  const runCheck = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      return;
    }

    const token = ++reqToken.current;
    setInput(value);
    setChecked(value);
    setLoading(true);
    setError(null);

    try {
      const res = await check(value);
      if (token !== reqToken.current) return; // stale 응답 폐기
      setResult(res);
    } catch (err: unknown) {
      if (token !== reqToken.current) return;
      // 데모 안전성: 실패해도 친절한 안내만 노출하고 크래시하지 않는다.
      setError(getErrorMessage(err));
      setResult(null);
    } finally {
      if (token === reqToken.current) {
        setLoading(false);
      }
    }
  }, []);

  // 공유로 들어온 값이 있으면 자동 검사. 직접 방문(값 없음)이면 입력 대기.
  useEffect(() => {
    if (sharedValue.trim()) {
      void runCheck(sharedValue);
    }
    // sharedValue가 바뀔 때(다른 공유로 재진입)만 재실행.
  }, [sharedValue, runCheck]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    void runCheck(input);
  }

  const hasChecked = checked !== null;
  const meta = result ? GRADE_META[result.grade] : null;

  return (
    <div className="sv-shell">
      <div className="sv-eyebrow">SCAMGRAPH · 공유 검사</div>

      {/* 아직 아무것도 검사하지 않은 직접 방문 상태 */}
      {!hasChecked && !loading && (
        <p className="sv-intro">
          의심스러운 <b>링크 · 전화번호 · 계좌</b>를 붙여넣으면
          <br />
          즉시 사기 위험도를 판정합니다.
        </p>
      )}

      {loading && (
        <div className="sv-loading" role="status" aria-live="polite">
          <span className="sv-loading-dot" /> 위협 엔진이 분석하는 중…
        </div>
      )}

      {/* 데모 안전성: 검사 실패 시 친절한 안내 */}
      {error && !loading && (
        <div className="sv-error" role="alert">
          <div className="sv-error-title">지금은 검사할 수 없어요</div>
          <div className="sv-error-sub">
            잠시 후 다시 시도해 주세요. 문제가 계속되면 링크를 직접 확인하지
            마세요.
          </div>
        </div>
      )}

      {result && !loading && meta && (
        <VerdictPanel result={result} meta={meta} />
      )}

      {/* 다시 검사 입력 (공유 시트에서 바로 다른 값도 확인 가능) */}
      <form className="sv-recheck" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="다른 링크 · 번호 · 계좌 검사…"
          aria-label="검사할 값 입력"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? "검사 중…" : hasChecked ? "다시 검사" : "검사"}
        </button>
      </form>

      <Link href="/" className="sv-home">
        ← ScamGraph 관제 화면으로
      </Link>
    </div>
  );
}

// ── 판정 패널 (검사 결과가 있을 때의 핵심 화면) ─────────────────
function VerdictPanel({
  result,
  meta,
}: {
  result: CheckResult;
  meta: { label: string; color: string };
}) {
  const topReasons = result.reasons.slice(0, 5);

  return (
    <section className="sv-verdict" style={{ ["--g" as string]: meta.color }}>
      <VerdictRing score={result.risk_score} color={meta.color} />

      <div className="sv-grade-label" style={{ color: meta.color }}>
        {meta.label}
      </div>

      <p className="sv-reco">{result.recommendation}</p>

      <div className="sv-value" title={result.value}>
        <span className="sv-value-kind">{result.kind}</span>
        <span className="sv-value-text">{result.value}</span>
      </div>

      {result.organization && (
        <div className="sv-org">
          🔗 사기 조직 <b>&lsquo;{result.organization}&rsquo;</b> 인프라와 연결
        </div>
      )}

      {topReasons.length > 0 && (
        <div className="sv-reasons">
          <div className="sv-reasons-label">// 판단 근거</div>
          <ul>
            {topReasons.map((reason, i) => (
              <li key={`${reason.rule}-${i}`}>
                <span className="sv-reason-rule">{reason.rule}</span>
                <span className="sv-reason-weight">
                  {reason.weight >= 0 ? "+" : ""}
                  {reason.weight}
                </span>
                <span className="sv-reason-detail">{reason.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ── 원형 위험 게이지 (SVG) — ScanConsole 게이지와 톤 통일 ────────
function VerdictRing({
  score,
  color,
}: {
  score: number | null;
  color: string;
}) {
  const hasScore = typeof score === "number";
  const clamped = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg
      className="sv-ring"
      viewBox="0 0 140 140"
      width="160"
      height="160"
      aria-hidden="true"
    >
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke="var(--line)"
        strokeWidth="11"
      />
      <circle
        className="sv-ring-arc"
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="66" textAnchor="middle" className="sv-ring-num" fill={color}>
        {hasScore ? clamped : "—"}
      </text>
      <text x="70" y="90" textAnchor="middle" className="sv-ring-unit">
        {hasScore ? "/ 100" : "위험도 미상"}
      </text>
    </svg>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용. 모바일 우선.
const SHARE_CSS = `
.sv {
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  padding: 28px 18px calc(28px + env(safe-area-inset-bottom));
}
.sv-shell {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.sv-eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent);
  text-align: center;
}
.sv-intro {
  text-align: center;
  color: var(--text-dim);
  font-size: 15px;
  line-height: 1.6;
  margin: 24px 0 4px;
}
.sv-intro b { color: var(--text); }

.sv-loading {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 40px 16px;
  font-family: var(--mono); font-size: 13px; color: var(--accent);
}
.sv-loading-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--accent);
  animation: sv-pulse 1s ease-in-out infinite;
}
@keyframes sv-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }

.sv-error {
  border: 1px solid var(--warn);
  border-radius: 14px;
  background: rgba(255, 176, 32, 0.08);
  padding: 18px 18px;
}
.sv-error-title { font-weight: 800; color: var(--warn); font-size: 15px; }
.sv-error-sub { margin-top: 6px; color: var(--text-dim); font-size: 13px; line-height: 1.55; }

/* ── 핵심 판정 패널 ── */
.sv-verdict {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 14px;
  padding: 26px 20px 24px;
  border: 1px solid var(--line);
  border-top: 3px solid var(--g, var(--accent));
  border-radius: 18px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  position: relative;
  overflow: hidden;
  animation: sv-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.sv-verdict::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(360px 200px at 50% 0%, color-mix(in oklab, var(--g) 16%, transparent), transparent 70%);
  pointer-events: none;
}
@keyframes sv-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

.sv-ring { position: relative; }
.sv-ring-arc { transition: stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1); }
.sv-ring-num { font-size: 36px; font-weight: 800; font-family: var(--sans); }
.sv-ring-unit { font-size: 11px; font-family: var(--mono); fill: var(--text-mute); }

.sv-grade-label {
  font-size: clamp(2.2rem, 1.4rem + 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  position: relative;
}
.sv-reco {
  position: relative;
  font-size: clamp(1rem, 0.95rem + 0.6vw, 1.18rem);
  line-height: 1.55;
  color: var(--text);
  max-width: 36ch;
}

.sv-value {
  position: relative;
  display: inline-flex; align-items: center; gap: 8px;
  max-width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
}
.sv-value-kind {
  font-family: var(--mono); font-size: 10px; letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-mute);
  padding: 2px 7px; border-radius: 6px;
  border: 1px solid var(--line);
  flex: 0 0 auto;
}
.sv-value-text {
  font-family: var(--mono); font-size: 13px; color: var(--text);
  word-break: break-all; text-align: left;
}

.sv-org {
  position: relative;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--danger);
  border-radius: 12px;
  background: rgba(255, 77, 109, 0.1);
  color: var(--text);
  font-size: 14px; line-height: 1.5;
}
.sv-org b { color: var(--danger); }

.sv-reasons { position: relative; width: 100%; text-align: left; margin-top: 4px; }
.sv-reasons-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); margin-bottom: 10px;
}
.sv-reasons ul { list-style: none; display: grid; gap: 8px; }
.sv-reasons li {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
}
.sv-reason-rule {
  font-family: var(--mono); font-size: 11px; color: var(--accent);
  padding: 3px 8px; border-radius: 6px;
  background: rgba(0, 229, 192, 0.08); white-space: nowrap;
}
.sv-reason-weight {
  font-family: var(--mono); font-size: 12px; font-weight: 700;
  color: var(--warn); white-space: nowrap;
}
.sv-reason-detail { font-size: 12.5px; color: var(--text-dim); line-height: 1.5; }

/* ── 다시 검사 입력 ── */
.sv-recheck { display: flex; gap: 10px; margin-top: 4px; }
.sv-recheck input {
  flex: 1; min-width: 0;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 15px;
  padding: 14px 14px;
  outline: none;
}
.sv-recheck input:focus { border-color: var(--accent); }
.sv-recheck button {
  flex: 0 0 auto;
  background: var(--accent);
  color: #04120f;
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 15px;
  padding: 0 20px;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.2s ease;
}
.sv-recheck button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 30px rgba(0, 229, 192, 0.25);
}
.sv-recheck button:disabled { opacity: 0.6; cursor: default; }

.sv-home {
  text-align: center;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-mute);
  text-decoration: none;
  padding: 6px;
}
.sv-home:hover { color: var(--accent); }

@media (max-width: 380px) {
  .sv-reasons li { grid-template-columns: auto 1fr; }
  .sv-reason-weight { grid-column: 2; justify-self: start; }
}
`;
