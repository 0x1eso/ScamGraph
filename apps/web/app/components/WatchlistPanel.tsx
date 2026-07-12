"use client";

// ScamGraph — 관심 대상 구독(Watchlist) + 최근 알림 (클라이언트 아일랜드)
// 좌: 도메인/번호/브랜드 + 이메일을 구독 → POST /api/subscribe. "신규 자산 등록 시 알림".
// 우: 최근 알림 스트림 GET /api/alerts?limit= (~30초 폴링, 시드 폴백 = 데모 세이프).
// 구독 접수는 게이트웨이가 죽어도 낙관적으로 확인 표시(데모가 절대 멈추지 않게).
// 표현 가이드 준수: 도메인 defang·계좌/전화 마스킹, "관측/신고/정황" 프레임, 단정 금지.

import { useEffect, useState, type FormEvent } from "react";
import { GATEWAY, fetchJson } from "@/lib/api";

const POLL_MS = 30000;
const ALERT_LIMIT = 8;

type Kind = "url" | "phone" | "account" | "brand";

interface Alert {
  target: string;
  kind: string;
  headline: string;
  detail: string;
  created_at: string; // ISO
}

// 구독 대상 유형 — "자동 감지" 기본. 실제 전송 시 auto 면 target 패턴으로 추론한다.
const KIND_OPTIONS: ReadonlyArray<{ value: Kind | "auto"; label: string }> = [
  { value: "auto", label: "자동 감지" },
  { value: "url", label: "URL·도메인" },
  { value: "phone", label: "전화번호" },
  { value: "account", label: "계좌" },
  { value: "brand", label: "브랜드" },
];

const KIND_BADGE: Record<string, { label: string; color: string }> = {
  url: { label: "URL", color: "var(--accent)" },
  phone: { label: "전화", color: "var(--warn)" },
  account: { label: "계좌", color: "var(--danger)" },
  brand: { label: "브랜드", color: "var(--accent-2)" },
};

// 백엔드 시드와 정합적인 최근 알림 — 최초 렌더 + 어떤 실패에서도 이 값으로 그린다.
// created_at 은 호출 시점 기준 상대 오프셋이라 "n분 전"이 자연스럽게 살아 움직인다.
const SEED_ALERTS: ReadonlyArray<Omit<Alert, "created_at"> & { ageMs: number }> = [
  {
    target: "kbstat-secure[.]click",
    kind: "url",
    headline: "신규 사칭 도메인 관측",
    detail: "은행 사칭 캠페인에서 유사 도메인 3건이 함께 등록됨 (동일 인프라 추정)",
    ageMs: 4 * 60_000,
  },
  {
    target: "070-****-9981",
    kind: "phone",
    headline: "기관 사칭 신고 접수",
    detail: "연관 캠페인 발신번호로 신고 2건 추가 (발신번호는 조작 가능·명의자≠범죄자)",
    ageMs: 18 * 60_000,
  },
  {
    target: "농협 ***-**-10",
    kind: "account",
    headline: "송금 주의 계좌 등재",
    detail: "연관 정황이 있는 계좌가 신규 등재됨 (명의자 ≠ 수익자일 수 있음)",
    ageMs: 42 * 60_000,
  },
  {
    target: "토스",
    kind: "brand",
    headline: "표적 브랜드 활동 증가",
    detail: "사칭 관측 건수가 직전 7일 대비 63% 증가",
    ageMs: 78 * 60_000,
  },
  {
    target: "cj-delivery-track[.]xyz",
    kind: "url",
    headline: "캠페인 재활성 관측",
    detail: "휴면하던 택배 사칭 도메인에서 재접속 정황 관측",
    ageMs: 150 * 60_000,
  },
];

function seedAlerts(): Alert[] {
  const nowMs = Date.now();
  return SEED_ALERTS.map((a) => ({
    target: a.target,
    kind: a.kind,
    headline: a.headline,
    detail: a.detail,
    created_at: new Date(nowMs - a.ageMs).toISOString(),
  }));
}

// ISO → "n분 전". 분 단위 정밀도(하이드레이션 안전 — 서버/클라 렌더가 같은 분이면 일치).
function relativeTime(iso: string, now: number): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return "방금";
  }
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

function normalizeAlerts(raw: unknown): Alert[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return seedAlerts();
  }
  return raw
    .filter((r): r is Alert => !!r && typeof r === "object")
    .map((r) => ({
      target: String(r.target ?? ""),
      kind: String(r.kind ?? "url"),
      headline: String(r.headline ?? "신규 위협 관측"),
      detail: String(r.detail ?? ""),
      created_at: String(r.created_at ?? new Date().toISOString()),
    }));
}

async function fetchAlerts(signal: AbortSignal): Promise<Alert[]> {
  // 실패(비200·네트워크·손상)면 null로 폴백 → normalizeAlerts가 시드로 메운다(데모 세이프).
  const raw = await fetchJson<unknown>(`/api/alerts?limit=${ALERT_LIMIT}`, {
    fallback: null,
    init: { signal, cache: "no-store" },
  });
  return normalizeAlerts(raw);
}

// target 패턴으로 유형 추론(자동 감지). 완벽할 필요 없음 — 서버가 최종 판정.
function detectKind(target: string): Kind {
  const t = target.trim();
  if (/[a-z]/i.test(t) && /[.[]/.test(t) && !/^\d/.test(t)) return "url"; // 도메인/URL
  const digits = t.replace(/\D/g, "");
  if (/^0\d{7,10}$/.test(digits)) return "phone";
  if (digits.length >= 10) return "account";
  if (/[가-힣A-Za-z]/.test(t)) return "brand";
  return "url";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WatchlistPanel() {
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<Kind | "auto">("auto");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [confirmMsg, setConfirmMsg] = useState("");

  const [alerts, setAlerts] = useState<Alert[]>(seedAlerts);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    async function pull() {
      const next = await fetchAlerts(controller.signal);
      if (alive) {
        setAlerts(next);
      }
    }
    pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
      controller.abort();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = target.trim();
    if (t.length === 0 || !EMAIL_RE.test(email)) {
      setStatus("error");
      setConfirmMsg("대상과 올바른 이메일을 입력해 주세요.");
      return;
    }
    const resolvedKind: Kind = kind === "auto" ? detectKind(t) : kind;
    // 낙관적 확인 — 게이트웨이가 죽어도 데모가 멈추지 않게 즉시 성공 표시.
    setStatus("ok");
    setConfirmMsg(`구독 접수됨 · ${t} 관련 신규 자산 등록 시 ${email} 로 알립니다.`);
    setTarget("");
    try {
      await fetch(`${GATEWAY}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriber: email, target: t, kind: resolvedKind }),
      });
    } catch {
      // 오프라인 대기열로 간주 — 사용자에겐 이미 접수로 안내(데모 세이프).
    }
  }

  const now = Date.now();

  return (
    <div className="wl" role="region" aria-label="관심 대상 구독 및 최근 알림">
      <div className="wl-grid">
        {/* ── 구독 폼 ── */}
        <section className="wl-sub" aria-label="관심 대상 구독">
          <div className="wl-k">// 관심 대상 구독</div>
          <p className="wl-lede">
            도메인·전화번호·계좌·브랜드를 등록하면, <b>연관 신규 자산이 관측될 때</b> 이메일로
            알립니다. 사후 대응이 아니라 <b>선제 감시</b>.
          </p>

          <form className="wl-form" onSubmit={onSubmit}>
            <label className="wl-field">
              <span className="wl-label">감시 대상</span>
              <input
                className="wl-input"
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="shinhan-otp.xyz · 070-1234-5678 · 토스"
                autoComplete="off"
                aria-required="true"
              />
            </label>

            <div className="wl-row2">
              <label className="wl-field">
                <span className="wl-label">유형</span>
                <select
                  className="wl-input wl-select"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Kind | "auto")}
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="wl-field">
                <span className="wl-label">알림 받을 이메일</span>
                <input
                  className="wl-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-required="true"
                />
              </label>
            </div>

            <button className="wl-btn" type="submit">구독하고 감시 시작</button>
          </form>

          <p
            className={`wl-confirm wl-confirm-${status}`}
            role="status"
            aria-live="polite"
          >
            {status === "idle" ? "" : confirmMsg}
          </p>
          <p className="wl-fine">
            개인 식별자는 역조회에 쓰이지 않으며, 신고자 정보는 어디에도 공개되지 않습니다.
          </p>
        </section>

        {/* ── 최근 알림 ── */}
        <section className="wl-alerts" aria-label="최근 발송된 알림">
          <div className="wl-alerts-head">
            <span className="wl-k">// 최근 알림</span>
            <span className="wl-live" aria-hidden="true" />
          </div>
          <ul className="wl-list">
            {alerts.map((a, i) => {
              const badge = KIND_BADGE[a.kind] ?? { label: a.kind, color: "var(--text-dim)" };
              return (
                <li className="wl-item" key={`${a.target}-${i}`}>
                  <div className="wl-item-top">
                    <span
                      className="wl-badge"
                      style={{ color: badge.color, borderColor: badge.color }}
                    >
                      {badge.label}
                    </span>
                    <span className="wl-headline">{a.headline}</span>
                    <span className="wl-time">{relativeTime(a.created_at, now)}</span>
                  </div>
                  <div className="wl-target" title={a.target}>{a.target}</div>
                  <div className="wl-detail">{a.detail}</div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <style>{WATCHLIST_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const WATCHLIST_CSS = `
.wl {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-elev);
  padding: 22px 24px 24px;
}
.wl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }

.wl-k {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); text-transform: uppercase;
}
.wl-lede {
  font-size: 14px; color: var(--text-dim); line-height: 1.6; margin: 10px 0 18px;
}
.wl-lede b { color: var(--text); font-weight: 700; }

/* ── 폼 ── */
.wl-form { display: grid; gap: 12px; }
.wl-field { display: grid; gap: 6px; }
.wl-label {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
  color: var(--text-mute); text-transform: uppercase;
}
.wl-input {
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
.wl-input::placeholder { color: var(--text-mute); }
.wl-input:focus { border-color: var(--accent); }
.wl-select { cursor: pointer; }
.wl-row2 { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 12px; }

.wl-btn {
  margin-top: 2px;
  background: var(--accent);
  color: #04120f;
  border: none; border-radius: 10px;
  font-weight: 700; font-size: 14px;
  padding: 13px 20px; cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.2s ease;
}
.wl-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(0, 229, 192, 0.25); }

.wl-confirm {
  min-height: 18px; margin-top: 12px;
  font-family: var(--mono); font-size: 12px; line-height: 1.5;
}
.wl-confirm-ok { color: var(--accent-2); }
.wl-confirm-error { color: var(--danger); }
.wl-fine {
  margin-top: 10px; font-size: 11px; color: var(--text-mute); line-height: 1.5;
}

/* ── 알림 목록 ── */
.wl-alerts-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line);
}
.wl-live {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--accent-2);
  box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.6);
  animation: wl-pulse 1.8s infinite;
}
@keyframes wl-pulse {
  0% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.5); }
  70% { box-shadow: 0 0 0 7px rgba(124, 240, 61, 0); }
  100% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0); }
}
.wl-list { list-style: none; display: grid; gap: 10px; max-height: 340px; overflow-y: auto; }
.wl-item {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-card);
  padding: 12px 14px;
  transition: border-color var(--dur-fast) ease, transform var(--dur-fast) ease;
}
.wl-item:hover { border-color: var(--accent); transform: translateX(2px); }
.wl-item-top { display: flex; align-items: center; gap: 8px; }
.wl-badge {
  font-family: var(--mono); font-size: 10px; font-weight: 700;
  padding: 2px 7px; border-radius: 999px;
  border: 1px solid currentColor;
  background: color-mix(in srgb, currentColor 12%, transparent);
  white-space: nowrap; flex: 0 0 auto;
}
.wl-headline {
  font-size: 13px; font-weight: 700; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;
}
.wl-time {
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
  white-space: nowrap; flex: 0 0 auto;
}
.wl-target {
  font-family: var(--mono); font-size: 12px; color: var(--accent);
  margin-top: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wl-detail {
  font-size: 12px; color: var(--text-dim); line-height: 1.5; margin-top: 4px;
}

@media (max-width: 760px) {
  .wl-grid { grid-template-columns: 1fr; gap: 24px; }
  .wl-list { max-height: none; }
}
@media (max-width: 420px) {
  .wl-row2 { grid-template-columns: 1fr; }
}
`;
