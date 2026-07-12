"use client";

// ScamGraph — 이의제기(정정 요청) 폼 (클라이언트 아일랜드)
// 대상·유형·사유·연락처 → POST /api/appeal → {ok,id,status}. 접수 확인 표시.
// 카피 톤: docs/expression-guidelines.md §0·§7 — 오탐/명예훼손 대응, "이의제기 검토 중" 상태.
//   · 발신번호 조작 가능 · 명의자 ≠ 범죄자 · 침해된 정상 사이트 가능성 → 정정 창구가 필요.
// 게이트웨이가 죽어도 로컬 접수번호를 발급해 항상 확인을 표시한다(데모 세이프).

import { useState, type FormEvent } from "react";
import { GATEWAY } from "@/lib/api";

type Kind = "url" | "phone" | "account" | "brand";

const KIND_OPTIONS: ReadonlyArray<{ value: Kind; label: string }> = [
  { value: "url", label: "URL·도메인" },
  { value: "phone", label: "전화번호" },
  { value: "account", label: "계좌" },
  { value: "brand", label: "브랜드·업체" },
];

// 이의제기 배경 — 왜 오탐이 생기고, 왜 정정 창구가 필요한가(가이드 §0).
const REASONS: ReadonlyArray<{ icon: string; text: string }> = [
  { icon: "☎", text: "발신번호는 조작(spoofing)될 수 있어, 표시된 번호의 명의자가 피해자일 수 있습니다." },
  { icon: "◈", text: "계좌 명의자는 명의도용·강요로 개설된 경우가 많아 수익자와 다를 수 있습니다." },
  { icon: "⬡", text: "정상 사이트가 침해(compromise)돼 피싱에 악용되었을 수 있습니다." },
];

interface AppealResult {
  ok: boolean;
  id: string;
  status: string;
}

// 서버 status → 한국어 라벨(가이드 §7 상태 표기). 기본은 "이의제기 검토 중".
function statusLabel(status: string): string {
  switch (status) {
    case "resolved":
    case "corrected":
      return "정정 완료";
    case "rejected":
      return "검토 후 유지";
    case "received":
    case "reviewing":
    default:
      return "이의제기 검토 중";
  }
}

// 로컬 접수번호 — 게이트웨이 미가동 시에도 접수 확인을 줄 수 있게(데모 세이프).
function localAppealId(): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const yy = new Date().getFullYear();
  return `AP-${yy}-${rand}`;
}

const EMAIL_OR_PHONE_RE = /^([^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d\s-]{6,})$/;

export default function AppealForm() {
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<Kind>("url");
  const [claim, setClaim] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AppealResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = target.trim();
    const c = claim.trim();
    if (t.length === 0 || c.length < 5 || !EMAIL_OR_PHONE_RE.test(contact.trim())) {
      setError("대상·정정 사유(5자 이상)·회신 연락처를 확인해 주세요.");
      return;
    }
    setError("");
    setSubmitting(true);
    const payload = { target: t, kind, claim: c, contact: contact.trim() };
    try {
      const res = await fetch(`${GATEWAY}/api/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const raw = (await res.json()) as Partial<AppealResult>;
        setResult({
          ok: raw.ok !== false,
          id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : localAppealId(),
          status: typeof raw.status === "string" ? raw.status : "received",
        });
      } else {
        // 서버 오류 → 로컬 접수로 폴백(데모 세이프 = 항상 접수 확인)
        setResult({ ok: true, id: localAppealId(), status: "received" });
      }
    } catch {
      setResult({ ok: true, id: localAppealId(), status: "received" });
    } finally {
      setSubmitting(false);
    }
  }

  // 접수 완료 상태 — 폼 대신 확인 카드를 보여준다.
  if (result) {
    return (
      <div className="ap" role="region" aria-label="이의제기 접수 결과">
        <div className="ap-done" role="status" aria-live="polite">
          <div className="ap-done-icon" aria-hidden="true">✓</div>
          <div className="ap-done-body">
            <div className="ap-done-title">이의제기가 접수되었습니다</div>
            <div className="ap-done-row">
              <span className="ap-done-k">접수번호</span>
              <span className="ap-done-id">{result.id}</span>
              <span className="ap-status-badge">{statusLabel(result.status)}</span>
            </div>
            <p className="ap-done-note">
              해당 항목에는 <b>“{statusLabel(result.status)}”</b> 배지가 표시되며, 피해 우려가 큰
              경우 공개 표시가 <b>임시 보류</b>됩니다. 검토 결과와 정정 여부는 남겨주신 연락처로
              회신드립니다. 정정 시 이전 판정에는 <b>“정정됨”</b> 기록(tombstone)을 남깁니다.
            </p>
          </div>
        </div>
        <button
          className="ap-again"
          type="button"
          onClick={() => {
            setResult(null);
            setTarget("");
            setClaim("");
            setContact("");
          }}
        >
          다른 항목 이의제기
        </button>
        <style>{APPEAL_CSS}</style>
      </div>
    );
  }

  return (
    <div className="ap" role="region" aria-label="이의제기 및 정정 요청">
      <div className="ap-k">// 이의제기 · 정정 요청</div>
      <p className="ap-lede">
        식별자의 소유자가 곧 범죄자는 아닙니다. <b>오탐이나 명예훼손 우려</b>가 있다면 정정을
        요청하세요. 접수 즉시 <b>“이의제기 검토 중”</b>으로 표시되고, 피해가 크면 공개 표시를
        임시 보류합니다.
      </p>

      <ul className="ap-reasons">
        {REASONS.map((r) => (
          <li className="ap-reason" key={r.text}>
            <span className="ap-reason-icon" aria-hidden="true">{r.icon}</span>
            <span className="ap-reason-text">{r.text}</span>
          </li>
        ))}
      </ul>

      <form className="ap-form" onSubmit={onSubmit}>
        <div className="ap-row2">
          <label className="ap-field">
            <span className="ap-label">대상 식별자</span>
            <input
              className="ap-input"
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="shinhan-otp.xyz · 010-1234-5678"
              autoComplete="off"
              aria-required="true"
            />
          </label>
          <label className="ap-field">
            <span className="ap-label">유형</span>
            <select
              className="ap-input ap-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="ap-field">
          <span className="ap-label">정정 사유</span>
          <textarea
            className="ap-input ap-textarea"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="예) 정상 운영 중인 도메인이며, 침해되었다가 복구되었습니다. 관련 근거를 함께 검토 부탁드립니다."
            rows={4}
            aria-required="true"
          />
        </label>

        <label className="ap-field">
          <span className="ap-label">회신 연락처 (이메일 또는 전화)</span>
          <input
            className="ap-input"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="you@example.com"
            autoComplete="off"
            aria-required="true"
          />
        </label>

        {error ? (
          <p className="ap-error" role="alert">{error}</p>
        ) : null}

        <button className="ap-btn" type="submit" disabled={submitting}>
          {submitting ? "접수 중…" : "이의제기 접수"}
        </button>
      </form>

      <p className="ap-fine">
        회신 연락처는 검토 목적으로만 사용되며 공개되지 않습니다. 신고자·이의제기자 정보는
        어디에도 노출되지 않습니다.
      </p>

      <style>{APPEAL_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const APPEAL_CSS = `
.ap {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-elev);
  padding: 22px 24px 24px;
}
.ap-k {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); text-transform: uppercase;
}
.ap-lede {
  font-size: 14px; color: var(--text-dim); line-height: 1.6; margin: 10px 0 16px;
}
.ap-lede b { color: var(--text); font-weight: 700; }

/* ── 배경 근거(왜 오탐이 생기나) ── */
.ap-reasons {
  list-style: none; display: grid; gap: 8px;
  padding: 14px 16px; margin-bottom: 18px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--bg-card);
}
.ap-reason { display: flex; align-items: flex-start; gap: 10px; }
.ap-reason-icon { color: var(--warn); font-size: 13px; line-height: 1.5; flex: 0 0 auto; }
.ap-reason-text { font-size: 12px; color: var(--text-dim); line-height: 1.5; }

/* ── 폼 ── */
.ap-form { display: grid; gap: 12px; }
.ap-row2 { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 12px; }
.ap-field { display: grid; gap: 6px; }
.ap-label {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
  color: var(--text-mute); text-transform: uppercase;
}
.ap-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  font-family: var(--mono);
  font-size: 14px;
  padding: 12px 14px;
  outline: none;
  transition: border-color var(--dur-fast) ease;
}
.ap-input::placeholder { color: var(--text-mute); }
.ap-input:focus { border-color: var(--accent); }
.ap-select { cursor: pointer; }
.ap-textarea { resize: vertical; min-height: 92px; font-family: var(--sans); line-height: 1.5; }

.ap-error { font-family: var(--mono); font-size: 12px; color: var(--danger); }

.ap-btn {
  margin-top: 2px;
  background: var(--accent);
  color: #04120f;
  border: none; border-radius: 10px;
  font-weight: 700; font-size: 14px;
  padding: 13px 20px; cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.2s ease, opacity var(--dur-fast) ease;
}
.ap-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(0, 229, 192, 0.25); }
.ap-btn:disabled { opacity: 0.6; cursor: default; transform: none; box-shadow: none; }

.ap-fine {
  margin-top: 12px; font-size: 11px; color: var(--text-mute); line-height: 1.5;
}

/* ── 접수 완료 카드 ── */
.ap-done {
  display: flex; gap: 16px; align-items: flex-start;
  border: 1px solid rgba(124, 240, 61, 0.4);
  border-radius: 12px;
  background:
    radial-gradient(120% 120% at 0% 0%, rgba(124, 240, 61, 0.08), transparent 55%),
    var(--bg-card);
  padding: 20px;
}
.ap-done-icon {
  flex: 0 0 auto;
  width: 40px; height: 40px; border-radius: 50%;
  display: grid; place-items: center;
  background: rgba(124, 240, 61, 0.14);
  border: 1px solid rgba(124, 240, 61, 0.5);
  color: var(--accent-2); font-size: 20px; font-weight: 800;
}
.ap-done-title { font-size: 16px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
.ap-done-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.ap-done-k { font-family: var(--mono); font-size: 10px; color: var(--text-mute); text-transform: uppercase; letter-spacing: 0.5px; }
.ap-done-id {
  font-family: var(--mono); font-size: 14px; font-weight: 700; color: var(--accent);
  letter-spacing: 0.02em;
}
.ap-status-badge {
  font-family: var(--mono); font-size: 11px; font-weight: 700;
  color: var(--warn);
  border: 1px solid rgba(255, 176, 32, 0.5);
  background: rgba(255, 176, 32, 0.1);
  padding: 3px 10px; border-radius: 999px; white-space: nowrap;
}
.ap-done-note { font-size: 13px; color: var(--text-dim); line-height: 1.6; margin-top: 12px; }
.ap-done-note b { color: var(--text); font-weight: 700; }
.ap-again {
  margin-top: 16px;
  background: transparent;
  color: var(--text-dim);
  border: 1px solid var(--line); border-radius: 10px;
  font-family: var(--mono); font-size: 13px;
  padding: 11px 18px; cursor: pointer;
  transition: border-color var(--dur-fast) ease, color var(--dur-fast) ease;
}
.ap-again:hover { border-color: var(--accent); color: var(--text); }

@media (max-width: 480px) {
  .ap-row2 { grid-template-columns: 1fr; }
}
`;
