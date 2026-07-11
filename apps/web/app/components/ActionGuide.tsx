"use client";

// ScamGraph — 사후 대응 가이드 ("🆘 지금 할 일")
// 위협 등급이 warning·danger일 때만, 게이트웨이가 내려주는 등급별 행동 지침을 렌더.
// 스캔이 "이건 위험합니다"에서 끝나지 않고 "지금 이렇게 하세요"로 이어지게 만든다.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

import { useEffect, useState } from "react";
import { getGuidance, type Guidance } from "@/lib/report";

interface ActionGuideProps {
  // 위협 종류(url | phone | account).
  kind: string;
  // 위협 등급. warning·danger일 때만 이 컴포넌트가 무언가를 그린다.
  grade: string;
}

// 대응 가이드는 실제 위험이 있을 때만 노출한다(안전·주의는 조용히 숨김).
const ACTIONABLE_GRADES = new Set(["warning", "danger"]);

// 외부 링크 여부(tel: 은 같은 탭, http 링크는 새 탭으로 연다).
function isWebLink(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export default function ActionGuide({ kind, grade }: ActionGuideProps) {
  const [data, setData] = useState<Guidance | null>(null);

  const actionable = ACTIONABLE_GRADES.has(grade);

  useEffect(() => {
    // 대응이 필요 없는 등급이면 조회 자체를 하지 않는다.
    if (!actionable) {
      setData(null);
      return;
    }

    // 등급·종류가 바뀌면 이전 요청 결과는 무시(stale 응답 취소).
    let ignore = false;

    getGuidance(kind, grade)
      .then((result) => {
        if (ignore) return;
        setData(result);
      })
      .catch(() => {
        if (ignore) return;
        // 데모 안전성: 실패해도 UI를 무너뜨리지 않고 조용히 숨긴다.
        setData(null);
      });

    return () => {
      ignore = true;
    };
  }, [kind, grade, actionable]);

  // 대응이 필요 없는 등급이거나 아직 데이터가 없으면 아무것도 그리지 않는다.
  if (!actionable || !data) {
    return null;
  }

  return (
    <div className="ag" key={`${kind}-${grade}`}>
      <div className="ag-card">
        <div className="ag-head">
          <span className="ag-icon">🆘</span>
          <span className="ag-title">지금 할 일</span>
        </div>

        <p className="ag-headline">{data.headline}</p>

        <ol className="ag-steps">
          {data.steps.map((step, i) => (
            <li className="ag-step" key={`${step.title}-${i}`}>
              <span className="ag-step-n">{i + 1}</span>
              <div className="ag-step-body">
                <div className="ag-step-title">{step.title}</div>
                <div className="ag-step-detail">{step.detail}</div>
                {step.action && <StepAction action={step.action} />}
              </div>
            </li>
          ))}
        </ol>

        {data.hotlines.length > 0 && (
          <div className="ag-hotlines">
            <div className="ag-hotlines-label">// 바로 연결</div>
            <div className="ag-hotline-row">
              {data.hotlines.map((hotline, i) => (
                <Hotline key={`${hotline.name}-${i}`} name={hotline.name} contact={hotline.contact} />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{ACTION_GUIDE_CSS}</style>
    </div>
  );
}

// ── 단계 실행 버튼 (tel: 또는 웹 링크) ──────────────────────────
function StepAction({ action }: { action: { label: string; href: string } }) {
  const web = isWebLink(action.href);

  return (
    <a
      className="ag-step-action"
      href={action.href}
      {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {action.label}
      <span className="ag-step-action-arrow" aria-hidden="true">
        {web ? "↗" : "→"}
      </span>
    </a>
  );
}

// ── 신고 핫라인 칩 (112 · 1332 · 118 등) ───────────────────────
function Hotline({ name, contact }: { name: string; contact: string }) {
  const web = isWebLink(contact);
  // tel: 링크는 번호만 뽑아 눈에 띄게 표기.
  const display = web ? "바로가기" : contact.replace(/^tel:/, "");

  return (
    <a
      className="ag-hotline"
      href={contact}
      {...(web ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <span className="ag-hotline-name">{name}</span>
      <span className="ag-hotline-contact">{display}</span>
    </a>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const ACTION_GUIDE_CSS = `
.ag {
  margin: 20px 0 8px;
  animation: ag-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes ag-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── 핵심 대응 카드: danger 좌측 강조선 + 카드 톤 ── */
.ag-card {
  position: relative;
  border: 1px solid var(--line);
  border-left: 3px solid var(--danger);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  padding: 22px 24px 20px;
  overflow: hidden;
}
.ag-card::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(420px 180px at 0% 0%, rgba(255, 77, 109, 0.1), transparent 70%);
  pointer-events: none;
}

.ag-head {
  position: relative;
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px;
}
.ag-icon { font-size: 18px; }
.ag-title {
  font-size: 15px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--danger);
}

.ag-headline {
  position: relative;
  margin-bottom: 18px;
  font-size: clamp(1rem, 0.94rem + 0.4vw, 1.2rem);
  line-height: 1.55;
  color: var(--text);
}

/* ── 번호가 매겨진 단계 ── */
.ag-steps {
  position: relative;
  list-style: none;
  display: grid; gap: 12px;
  margin-bottom: 18px;
  counter-reset: none;
}
.ag-step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg-elev);
  transition: border-color 0.18s ease;
}
.ag-step:hover { border-color: var(--danger); }
.ag-step-n {
  flex: 0 0 auto;
  width: 26px; height: 26px;
  display: grid; place-items: center;
  border-radius: 999px;
  background: rgba(255, 77, 109, 0.12);
  border: 1px solid var(--danger);
  color: var(--danger);
  font-family: var(--mono); font-size: 13px; font-weight: 800;
}
.ag-step-title {
  font-size: 14px; font-weight: 700; color: var(--text);
  margin-bottom: 4px;
}
.ag-step-detail {
  font-size: 13px; line-height: 1.55; color: var(--text-dim);
}
.ag-step-action {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 10px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: rgba(0, 229, 192, 0.08);
  color: var(--accent);
  font-family: var(--mono); font-size: 12px; font-weight: 700;
  text-decoration: none;
  transition: transform 0.12s ease, box-shadow 0.2s ease, background 0.18s ease;
}
.ag-step-action:hover {
  transform: translateY(-1px);
  background: rgba(0, 229, 192, 0.14);
  box-shadow: 0 6px 22px rgba(0, 229, 192, 0.18);
}
.ag-step-action-arrow { font-size: 13px; }

/* ── 신고 핫라인 행 ── */
.ag-hotlines {
  position: relative;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.ag-hotlines-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); margin-bottom: 10px;
}
.ag-hotline-row { display: flex; flex-wrap: wrap; gap: 8px; }
.ag-hotline {
  display: inline-flex; flex-direction: column; gap: 2px;
  padding: 9px 14px;
  border: 1px solid var(--danger);
  border-radius: 10px;
  background: rgba(255, 77, 109, 0.08);
  text-decoration: none;
  transition: transform 0.12s ease, box-shadow 0.2s ease, background 0.18s ease;
}
.ag-hotline:hover {
  transform: translateY(-1px);
  background: rgba(255, 77, 109, 0.14);
  box-shadow: 0 6px 22px rgba(255, 77, 109, 0.2);
}
.ag-hotline-name {
  font-size: 12px; font-weight: 700; color: var(--text);
}
.ag-hotline-contact {
  font-family: var(--mono); font-size: 13px; font-weight: 800; color: var(--danger);
}

@media (max-width: 520px) {
  .ag-hotline { flex: 1; }
}
`;
