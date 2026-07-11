"use client";

// ScamGraph — 커뮤니티 신고 모달 (플라이휠의 입력점)
// "🚩 사기 신고" 버튼 → 인라인 패널 → report() 호출 → "신고 → 모두 보호" 완료 안내.
// 한 사람의 신고가 관계망을 살찌우고, 그 결과 모두가 같은 위협으로부터 보호받는다.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

import { useState } from "react";
import { report } from "@/lib/report";

interface ReportModalProps {
  // 신고 대상 값(스캔된 URL·전화번호·계좌).
  target: string;
  // 대상 종류(url | phone | account). 게이트웨이에 그대로 전달.
  kind: string;
  // 패널이 닫힐 때 상위에 알리고 싶을 때 사용(선택).
  onClose?: () => void;
}

// 제출 상태 머신: 대기 → 전송중 → 완료 / 오류.
type Phase = "idle" | "sending" | "done" | "error";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다";
}

export default function ReportModal({ target, kind, onClose }: ReportModalProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [reports, setReports] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setOpen(false);
    onClose?.();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (phase === "sending") {
      return;
    }

    setPhase("sending");
    setError(null);

    try {
      const result = await report(target, kind, note.trim());
      setReports(result.reports);
      setPhase("done");
    } catch (err: unknown) {
      // 데모 안전성: 실패해도 UI를 무너뜨리지 않고 친근한 인라인 안내만 노출.
      setError(getErrorMessage(err));
      setPhase("error");
    }
  }

  return (
    <div className="rm">
      <button
        type="button"
        className="rm-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        🚩 사기 신고
      </button>

      {open && (
        <div className="rm-panel" role="dialog" aria-label="커뮤니티 사기 신고">
          {phase === "done" ? (
            <div className="rm-success" role="status" aria-live="polite">
              <div className="rm-success-icon">✅</div>
              <div className="rm-success-msg">
                신고 완료 — 이제 모두가 이 위협으로부터 보호받습니다
              </div>
              <div className="rm-success-count">
                커뮤니티 <b>{reports ?? 0}</b>건 신고됨
              </div>
              <button type="button" className="rm-close" onClick={handleClose}>
                닫기
              </button>
            </div>
          ) : (
            <form className="rm-form" onSubmit={handleSubmit}>
              <div className="rm-form-head">
                <span className="rm-form-title">이 대상을 커뮤니티에 신고</span>
                <button
                  type="button"
                  className="rm-x"
                  onClick={handleClose}
                  aria-label="닫기"
                >
                  ✕
                </button>
              </div>

              <div className="rm-target" title={target}>
                {target}
              </div>

              <label className="rm-label" htmlFor="rm-note">
                메모 <span className="rm-optional">(선택)</span>
              </label>
              <textarea
                id="rm-note"
                className="rm-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="어떻게 접촉해 왔는지, 무엇을 요구했는지 등 …"
                rows={3}
                disabled={phase === "sending"}
              />

              {phase === "error" && error && (
                <div className="rm-error" role="alert">
                  ⚠ 신고를 접수하지 못했습니다 — {error} · 잠시 후 다시 시도해 주세요
                </div>
              )}

              <button type="submit" className="rm-submit" disabled={phase === "sending"}>
                {phase === "sending" ? "신고 접수 중…" : "신고하기"}
              </button>

              <p className="rm-flywheel">
                신고 한 건이 관계망을 넓혀 모두를 보호합니다.
              </p>
            </form>
          )}
        </div>
      )}

      <style>{REPORT_MODAL_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const REPORT_MODAL_CSS = `
.rm { position: relative; display: inline-block; }

.rm-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(255, 77, 109, 0.08);
  color: var(--danger);
  border: 1px solid var(--danger);
  border-radius: 10px;
  font-family: var(--mono);
  font-weight: 700;
  font-size: 13px;
  padding: 9px 16px;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.2s ease, background 0.18s ease;
}
.rm-trigger:hover {
  transform: translateY(-1px);
  background: rgba(255, 77, 109, 0.14);
  box-shadow: 0 8px 26px rgba(255, 77, 109, 0.22);
}
.rm-trigger:focus-visible { outline: 2px solid var(--danger); outline-offset: 2px; }

.rm-panel {
  margin-top: 12px;
  width: min(420px, 90vw);
  border: 1px solid var(--line);
  border-left: 3px solid var(--danger);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  padding: 18px 18px 16px;
  animation: rm-rise 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes rm-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.rm-form-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.rm-form-title { font-size: 14px; font-weight: 800; color: var(--text); }
.rm-x {
  background: none; border: none; cursor: pointer;
  color: var(--text-mute); font-size: 14px; line-height: 1;
  padding: 4px; border-radius: 6px;
  transition: color 0.18s ease;
}
.rm-x:hover { color: var(--text); }

.rm-target {
  font-family: var(--mono); font-size: 12px; color: var(--text-dim);
  word-break: break-all;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  margin-bottom: 14px;
}

.rm-label {
  display: block;
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute);
  margin-bottom: 6px;
}
.rm-optional { color: var(--text-mute); font-weight: 400; }

.rm-note {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 12px;
  outline: none;
  resize: vertical;
  transition: border-color 0.18s ease;
}
.rm-note:focus { border-color: var(--danger); }
.rm-note:disabled { opacity: 0.6; }

.rm-error {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--danger);
  border-radius: 10px;
  background: rgba(255, 77, 109, 0.08);
  font-family: var(--mono); font-size: 11px; line-height: 1.5; color: var(--danger);
}

.rm-submit {
  width: 100%;
  margin-top: 14px;
  background: var(--danger);
  color: #14060a;
  border: none;
  border-radius: 10px;
  font-weight: 800;
  font-size: 14px;
  padding: 12px 20px;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.2s ease, opacity 0.18s ease;
}
.rm-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 30px rgba(255, 77, 109, 0.28);
}
.rm-submit:disabled { opacity: 0.6; cursor: default; }

.rm-flywheel {
  margin-top: 12px;
  font-family: var(--mono); font-size: 11px; line-height: 1.5;
  color: var(--accent-2);
  text-align: center;
}

/* ── 신고 완료 상태 ── */
.rm-success { text-align: center; padding: 8px 4px 4px; }
.rm-success-icon {
  font-size: 34px; line-height: 1;
  margin-bottom: 12px;
  animation: rm-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes rm-pop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
.rm-success-msg {
  font-size: 14px; font-weight: 800; line-height: 1.45;
  color: var(--text);
  margin-bottom: 10px;
}
.rm-success-count {
  display: inline-block;
  font-family: var(--mono); font-size: 12px;
  color: var(--accent);
  padding: 6px 14px; border-radius: 999px;
  border: 1px solid var(--accent);
  background: rgba(0, 229, 192, 0.08);
}
.rm-success-count b { font-size: 15px; font-weight: 800; margin: 0 2px; }
.rm-close {
  display: block;
  margin: 16px auto 0;
  background: none;
  color: var(--text-dim);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-family: var(--mono); font-size: 12px;
  padding: 8px 18px;
  cursor: pointer;
  transition: border-color 0.18s ease, color 0.18s ease;
}
.rm-close:hover { border-color: var(--accent); color: var(--text); }
`;
