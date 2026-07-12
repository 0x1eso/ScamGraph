"use client";

// ScamGraph — 사기 조직 사건 파일 (CASE FILE)
// 스캔→그래프 킬샷의 결말. 그래프에서 노드 하나를 지목하면, 그 엔티티가 속한
// 범죄 조직의 전체 인프라를 게이트웨이(/api/campaign)에서 복원해 "기밀 도시에"로 펼친다.
// 디자인 방향: 인텔 도시에(기밀문서 톤) — 다크 SOC + 서류철. globals.css 토큰만 재사용.
// 데모 세이프: 게이트웨이가 죽어도 시드 폴백으로 항상 렌더된다.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GATEWAY } from "@/lib/api";

// ── 계약 타입 (gateway CampaignController 미러) ─────────────────
interface Pivot {
  type: "shared_ip" | "shared_registrant" | "shared_cert" | string;
  value: string;
  connects: string[];
}
interface Inventory {
  domains: string[];
  phones: string[];
  accounts: string[];
  ips: string[];
}
interface CaseFile {
  found: boolean;
  campaign_id: string;
  label: string;
  risk_grade: string;
  entity_count: number;
  first_seen: string | null;
  inventory: Inventory;
  pivots: Pivot[];
  recommendation: string;
}

interface CampaignCaseFileProps {
  // 사건 파일을 열 엔티티 값(도메인·전화·계좌·IP). GraphExplorer 노드 라벨.
  value: string;
  onClose: () => void;
}

// 시드 폴백 — 게이트웨이 미가동 시에도 도시에가 반드시 렌더된다(데모 세이프).
const SEED_CASE: CaseFile = {
  found: true,
  campaign_id: "SG-7C1A0B",
  label: "토스 사칭 클러스터",
  risk_grade: "danger",
  entity_count: 6,
  first_seen: "2026-05-14",
  inventory: {
    domains: ["secure-tosspay.info", "tosspay-help.info", "toss-verify.live"],
    phones: ["070-1234-5678"],
    accounts: ["100-234-567890 (토스뱅크)"],
    ips: ["185.220.101.44"],
  },
  pivots: [
    {
      type: "shared_ip",
      value: "185.220.101.44",
      connects: ["secure-tosspay.info", "tosspay-help.info", "toss-verify.live"],
    },
  ],
  recommendation:
    "🚨 조직 인프라 6종 식별 — 도메인 3개 차단 · 계좌 1개 지급정지 · 전화 1개 신고 권고. " +
    "공유 IP 185.220.101.44 상단 차단 시 조직 전체를 무력화할 수 있습니다.",
};

// 위험 등급 → 강조색 토큰
const GRADE_COLOR: Record<string, string> = {
  danger: "var(--danger)",
  warning: "var(--warn)",
  caution: "var(--caution)",
  safe: "var(--safe)",
  unknown: "var(--text-mute)",
};
const GRADE_KO: Record<string, string> = {
  danger: "위험",
  warning: "주의",
  caution: "의심",
  safe: "안전",
  unknown: "미상",
};

// 증거 블록 정의 — 인벤토리 4종을 서류철 증거로 그룹핑
const EVIDENCE: Array<{ key: keyof Inventory; label: string; code: string }> = [
  { key: "domains", label: "도메인", code: "DOMAIN" },
  { key: "phones", label: "전화", code: "PHONE" },
  { key: "accounts", label: "계좌", code: "ACCOUNT" },
  { key: "ips", label: "IP", code: "IP-ADDR" },
];

const PIVOT_KO: Record<string, string> = {
  shared_ip: "동일 IP",
  shared_registrant: "동일 등록자",
  shared_cert: "동일 인증서",
};

export default function CampaignCaseFile({ value, onClose }: CampaignCaseFileProps) {
  const [data, setData] = useState<CaseFile | null>(null);
  const [loading, setLoading] = useState(true);
  const reduceMotion = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 데이터 로드 — 실패해도 시드 폴백으로 항상 채운다.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);

    const url = `${GATEWAY}/api/campaign?value=${encodeURIComponent(value)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`gateway ${r.status}`);
        return r.json();
      })
      .then((json: CaseFile) => {
        if (!alive) return;
        // 조직 미귀속이거나 인벤토리가 비면 시드 폴백으로 대체(항상 스펙터클).
        const empty =
          !json.found ||
          json.inventory == null ||
          Object.values(json.inventory).every((arr) => (arr?.length ?? 0) === 0);
        setData(empty ? SEED_CASE : json);
      })
      .catch(() => {
        if (alive) setData(SEED_CASE);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [value]);

  // Esc 로 닫기 + 마운트 시 닫기 버튼에 포커스(키보드 접근성).
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );
  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    // 오버레이가 열려 있는 동안 배경 스크롤 잠금.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [handleKey]);

  const accent = data ? GRADE_COLOR[data.risk_grade] ?? "var(--danger)" : "var(--danger)";

  return (
    <AnimatePresence>
      <motion.div
        className="cf-scrim"
        role="dialog"
        aria-modal="true"
        aria-label={`${value} 사기 조직 사건 파일`}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onMouseDown={(e) => {
          // 스크림(문서 바깥) 클릭 시 닫기.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.article
          className="cf-doc"
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          style={{ ["--cf-accent" as string]: accent }}
        >
          {/* 상단 천공(서류철) 모티프 */}
          <div className="cf-punches" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="cf-punch" />
            ))}
          </div>

          <button ref={closeRef} className="cf-close" onClick={onClose} aria-label="사건 파일 닫기">
            ×
          </button>

          {/* CLASSIFIED / 기밀 스탬프 */}
          <div className="cf-stamp" aria-hidden="true">
            <span className="cf-stamp-en">CLASSIFIED</span>
            <span className="cf-stamp-ko">기 밀</span>
          </div>

          {loading || !data ? (
            <DecryptingBody value={value} />
          ) : (
            <DossierBody data={data} reduceMotion={!!reduceMotion} />
          )}

          <style>{CASEFILE_CSS}</style>
        </motion.article>
      </motion.div>
    </AnimatePresence>
  );
}

// ── 로딩(복호화) 상태 ─────────────────────────────────────────
function DecryptingBody({ value }: { value: string }) {
  return (
    <div className="cf-loading" role="status" aria-live="polite">
      <div className="cf-kicker">// CASE FILE</div>
      <div className="cf-decrypt">
        <span className="cf-decrypt-dot" aria-hidden="true" />
        복호화 중 · DECRYPTING…
      </div>
      <div className="cf-target-line">TARGET › {value}</div>
      <div className="cf-redactions" aria-hidden="true">
        <span className="cf-redact" style={{ width: "72%" }} />
        <span className="cf-redact" style={{ width: "54%" }} />
        <span className="cf-redact" style={{ width: "63%" }} />
      </div>
    </div>
  );
}

// ── 본문 도시에 ───────────────────────────────────────────────
function DossierBody({ data, reduceMotion }: { data: CaseFile; reduceMotion: boolean }) {
  const gradeKo = GRADE_KO[data.risk_grade] ?? data.risk_grade;
  // pivots가 누락된(부분적으로 유효한) 응답에서도 렌더가 터지지 않도록 방어(데모 세이프).
  const pivots = data.pivots ?? [];

  return (
    <div className="cf-body">
      {/* 케이스 헤더 */}
      <header className="cf-head">
        <div className="cf-kicker">// SCAMGRAPH INTELLIGENCE DOSSIER</div>
        <div className="cf-caseno">CASE #{data.campaign_id}</div>
        <h2 className="cf-orgname">{data.label}</h2>
        <div className="cf-metaline">
          <span className={`cf-risk cf-risk-${data.risk_grade}`}>
            위험도 {gradeKo.toUpperCase()}
          </span>
          <span className="cf-meta-sep" aria-hidden="true">
            /
          </span>
          <span className="cf-meta-k">인프라 규모</span>
          <span className="cf-meta-v">{data.entity_count}종</span>
          <span className="cf-meta-sep" aria-hidden="true">
            /
          </span>
          <span className="cf-meta-k">최초 관측</span>
          <span className="cf-meta-v">{data.first_seen ?? "미상"}</span>
        </div>
      </header>

      {/* 공유 피벗 — WHY these are one org (차별점, 최상단 강조) */}
      {pivots.length > 0 && (
        <section className="cf-pivots" aria-labelledby="cf-pivots-h">
          <div className="cf-section-label" id="cf-pivots-h">
            ◆ 조직 연결 근거 · SHARED INFRASTRUCTURE
          </div>
          <div className="cf-pivot-list">
            {pivots.map((p, i) => (
              <div className="cf-pivot" key={`${p.type}-${p.value}-${i}`}>
                <div className="cf-pivot-head">
                  <span className="cf-pivot-tag">{PIVOT_KO[p.type] ?? p.type}</span>
                  <span className="cf-pivot-value">{p.value}</span>
                  <span className="cf-pivot-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="cf-pivot-count">{p.connects.length}개 대상 연결</span>
                </div>
                <div className="cf-pivot-connects">
                  {p.connects.map((c, j) => (
                    <span className="cf-pivot-chip" key={`${c}-${j}`}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 증거 그리드 — 인벤토리 4종 */}
      <section className="cf-evidence" aria-labelledby="cf-ev-h">
        <div className="cf-section-label" id="cf-ev-h">
          ◆ 압수 인프라 · EVIDENCE INVENTORY
        </div>
        <div className="cf-evidence-grid">
          {EVIDENCE.map((ev, idx) => (
            <EvidenceBlock
              key={ev.key}
              label={ev.label}
              code={ev.code}
              values={data.inventory[ev.key] ?? []}
              index={idx}
              reduceMotion={reduceMotion}
            />
          ))}
        </div>
      </section>

      {/* 대응 권고 */}
      <section className="cf-reco" aria-labelledby="cf-reco-h">
        <div className="cf-section-label" id="cf-reco-h">
          ◆ 대응 권고 · RECOMMENDED ACTION
        </div>
        <p className="cf-reco-text">{data.recommendation}</p>
      </section>

      <footer className="cf-footer">
        <span className="cf-footer-brand">
          Scam<b>Graph</b>
        </span>
        <span className="cf-footer-note">
          단일 기관은 이 중 하나만 봅니다 — ScamGraph는 조직 전체를 복원합니다.
        </span>
      </footer>
    </div>
  );
}

// ── 증거 블록 ─────────────────────────────────────────────────
function EvidenceBlock({
  label,
  code,
  values,
  index,
  reduceMotion,
}: {
  label: string;
  code: string;
  values: string[];
  index: number;
  reduceMotion: boolean;
}) {
  const count = values.length;
  const empty = count === 0;

  return (
    <motion.div
      className={`cf-ev-block${empty ? " cf-ev-empty" : ""}`}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.06 * index }}
    >
      <div className="cf-ev-top">
        <span className="cf-ev-code">EX-{code}</span>
        <span className="cf-ev-count">{count}</span>
      </div>
      <div className="cf-ev-label">{label}</div>
      {empty ? (
        <div className="cf-ev-none">해당 없음</div>
      ) : (
        <ul className="cf-ev-list">
          {values.map((v, i) => (
            <li className="cf-ev-item" key={`${v}-${i}`}>
              <span className="cf-ev-hash" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="cf-ev-val">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

// 스코프드 스타일 — globals.css 토큰만 재사용, 파일 미수정.
const CASEFILE_CSS = `
.cf-scrim {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: flex-start; justify-content: center;
  padding: clamp(16px, 4vh, 56px) 16px;
  background: rgba(3, 5, 9, 0.72);
  backdrop-filter: blur(6px);
  overflow-y: auto;
}
.cf-doc {
  position: relative;
  width: min(920px, 100%);
  margin: auto;
  border: 1px solid var(--line);
  border-top: 3px solid var(--cf-accent, var(--danger));
  border-radius: 16px;
  background:
    radial-gradient(680px 260px at 100% 0%, rgba(255, 77, 109, 0.06), transparent 65%),
    linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  box-shadow: 0 40px 100px rgba(16, 24, 40, 0.22), 0 0 0 1px var(--line);
  overflow: hidden;
}
/* 종이 질감 결(미세 스캔라인) */
.cf-doc::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: repeating-linear-gradient(
    0deg, transparent 0 3px, rgba(255,255,255,0.012) 3px 4px);
  z-index: 0;
}

/* 서류철 천공 */
.cf-punches {
  display: flex; gap: 34px; justify-content: center;
  padding: 10px 0 2px;
  position: relative; z-index: 1;
}
.cf-punch {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--bg); border: 1px solid var(--line);
  box-shadow: inset 0 1px 2px rgba(16,24,40,0.12);
}

.cf-close {
  position: absolute; top: 12px; right: 14px; z-index: 5;
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--bg-sunken);
  color: var(--text-dim); font-size: 20px; line-height: 1; cursor: pointer;
  transition: border-color .16s ease, color .16s ease, background .16s ease;
}
.cf-close:hover { color: var(--text); border-color: var(--cf-accent, var(--danger)); }
.cf-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* 기밀 스탬프 (회전 + danger 테두리) */
.cf-stamp {
  position: absolute; top: 62px; right: 30px; z-index: 4;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 14px;
  border: 2.5px solid var(--danger); border-radius: 8px;
  color: var(--danger);
  transform: rotate(-11deg);
  opacity: 0.85;
  font-family: var(--mono);
  mix-blend-mode: multiply;
  background: var(--danger-soft);
  box-shadow: inset 0 0 0 1px rgba(217,45,67,0.4);
}
.cf-stamp-en { font-size: 15px; font-weight: 800; letter-spacing: 3px; }
.cf-stamp-ko { font-size: 10px; letter-spacing: 6px; }

.cf-body { position: relative; z-index: 1; padding: 8px clamp(20px, 4vw, 40px) 26px; }

/* 로딩 */
.cf-loading { position: relative; z-index: 1; padding: 30px clamp(20px,4vw,40px) 60px; }
.cf-decrypt {
  display: flex; align-items: center; gap: 10px;
  margin: 12px 0 18px;
  font-family: var(--mono); font-size: 14px; color: var(--cf-accent, var(--danger));
  letter-spacing: 1px;
}
.cf-decrypt-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--cf-accent, var(--danger));
  animation: cf-pulse 1s ease-in-out infinite;
}
.cf-target-line { font-family: var(--mono); font-size: 12px; color: var(--text-dim); margin-bottom: 20px; word-break: break-all; }
.cf-redactions { display: grid; gap: 12px; }
.cf-redact { height: 14px; border-radius: 3px;
  background: linear-gradient(90deg, var(--bg-sunken), var(--line));
  animation: cf-shimmer 1.4s ease-in-out infinite;
}
@keyframes cf-pulse { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
@keyframes cf-shimmer { 0%,100% { opacity: .5 } 50% { opacity: .9 } }

.cf-kicker {
  font-family: var(--mono); font-size: 11px; letter-spacing: 2px;
  text-transform: uppercase; color: var(--accent);
}

/* 헤더 */
.cf-head { border-bottom: 1px dashed var(--line); padding-bottom: 18px; margin-bottom: 4px; }
.cf-caseno {
  font-family: var(--mono); font-size: 13px; font-weight: 700; letter-spacing: 2px;
  color: var(--text-mute); margin-top: 10px;
}
.cf-orgname {
  font-size: clamp(1.7rem, 1.1rem + 2.4vw, 2.7rem); font-weight: 800;
  letter-spacing: -0.02em; line-height: 1.05; margin: 6px 0 14px;
  color: var(--text); max-width: 74%;
}
.cf-metaline {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  font-family: var(--mono); font-size: 12px;
}
.cf-risk {
  padding: 3px 12px; border-radius: 6px; font-weight: 800; letter-spacing: 1px;
  border: 1px solid currentColor;
}
.cf-risk-danger { color: var(--danger); background: rgba(255,77,109,0.1); }
.cf-risk-warning { color: var(--warn); background: rgba(255,176,32,0.1); }
.cf-risk-caution { color: var(--caution); background: var(--caution-soft); }
.cf-risk-safe { color: var(--safe); background: var(--safe-soft); }
.cf-risk-unknown { color: var(--text-mute); background: rgba(120,132,154,0.08); }
.cf-meta-sep { color: var(--line); }
.cf-meta-k { color: var(--text-mute); }
.cf-meta-v { color: var(--text); font-weight: 700; }

/* 섹션 라벨 */
.cf-section-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1.5px;
  text-transform: uppercase; color: var(--text-mute);
  margin: 22px 0 12px;
}

/* 공유 피벗 — 조직 연결의 물증(가장 강조) */
.cf-pivots { position: relative; }
.cf-pivot-list { display: grid; gap: 10px; }
.cf-pivot {
  border: 1px solid var(--accent); border-radius: 12px;
  background: var(--accent-soft);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
}
.cf-pivot-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.cf-pivot-tag {
  font-family: var(--mono); font-size: 10px; letter-spacing: 1px;
  padding: 3px 9px; border-radius: 6px; text-transform: uppercase;
  background: var(--accent); color: var(--on-accent); font-weight: 800;
}
.cf-pivot-value { font-family: var(--mono); font-size: 15px; font-weight: 700; color: var(--accent); word-break: break-all; }
.cf-pivot-arrow { color: var(--text-mute); }
.cf-pivot-count {
  margin-left: auto; font-family: var(--mono); font-size: 11px;
  padding: 2px 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent); white-space: nowrap;
}
.cf-pivot-connects { display: flex; flex-wrap: wrap; gap: 6px; }
.cf-pivot-chip {
  font-family: var(--mono); font-size: 11px; color: var(--text-dim);
  padding: 3px 9px; border-radius: 6px;
  border: 1px solid var(--line); background: var(--bg);
  word-break: break-all;
}

/* 증거 그리드 */
.cf-evidence-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;
}
.cf-ev-block {
  position: relative;
  border: 1px solid var(--line); border-radius: 12px;
  background: var(--bg-elev);
  padding: 14px 15px 12px;
  overflow: hidden;
}
.cf-ev-block::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--cf-accent, var(--danger)); opacity: 0.7;
}
.cf-ev-empty { opacity: 0.5; }
.cf-ev-top { display: flex; align-items: center; justify-content: space-between; }
.cf-ev-code {
  font-family: var(--mono); font-size: 9.5px; letter-spacing: 1.5px;
  color: var(--text-mute); text-transform: uppercase;
}
.cf-ev-count {
  font-size: 26px; font-weight: 800; letter-spacing: -0.03em;
  color: var(--cf-accent, var(--danger)); line-height: 1;
}
.cf-ev-label {
  font-size: 13px; font-weight: 700; color: var(--text);
  margin: 2px 0 10px;
}
.cf-ev-none { font-family: var(--mono); font-size: 11px; color: var(--text-mute); }
.cf-ev-list { list-style: none; display: grid; gap: 5px; max-height: 168px; overflow-y: auto; }
.cf-ev-item {
  display: flex; align-items: baseline; gap: 8px;
  font-family: var(--mono); font-size: 12px; color: var(--text-dim);
  word-break: break-all;
}
.cf-ev-hash { color: var(--text-mute); font-size: 10px; flex-shrink: 0; }
.cf-ev-val { color: var(--text-dim); }

/* 권고 */
.cf-reco-text {
  border: 1px solid var(--line); border-left: 3px solid var(--warn);
  border-radius: 12px; background: var(--bg-card);
  padding: 14px 16px;
  font-size: 14px; line-height: 1.6; color: var(--text);
}

/* 푸터 */
.cf-footer {
  display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
  margin-top: 22px; padding-top: 14px; border-top: 1px dashed var(--line);
}
.cf-footer-brand { font-weight: 800; color: var(--text); letter-spacing: 0.3px; }
.cf-footer-brand b { color: var(--accent); }
.cf-footer-note { font-size: 12px; color: var(--text-mute); }

@media (max-width: 620px) {
  .cf-orgname { max-width: 100%; }
  .cf-evidence-grid { grid-template-columns: 1fr; }
  .cf-stamp { top: 54px; right: 16px; transform: rotate(-9deg) scale(0.86); }
}
@media (prefers-reduced-motion: reduce) {
  .cf-decrypt-dot, .cf-redact { animation: none; }
}
`;
