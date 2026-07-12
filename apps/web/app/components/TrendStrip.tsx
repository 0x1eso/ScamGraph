"use client";

// ScamGraph — 위협 동향 인사이트 스트립 (클라이언트 아일랜드)
// 최근 스캔 이력(게이트웨이 /api/trends)에서 "이번 주 무엇이 뜨는가"를 한 줄로 보여준다.
// 급상승 유형 + 등급/유형 믹스 + 표적 브랜드를 관제(SOC) 톤으로.
// ~30초 폴링하되 실패/미가동이면 시드로 항상 렌더한다(데모 세이프 = 절대 빈칸 없음).
// 서버가 값을 계산해 내려주므로 렌더에서 Date.now()/랜덤을 쓰지 않는다(하이드레이션 안전).

import { useEffect, useState } from "react";
import CountUp from "./CountUp";
import { fetchJson } from "@/lib/api";

const POLL_MS = 30000;

interface KindCount {
  kind: string;
  count: number;
}
interface GradeCount {
  grade: string;
  count: number;
}
interface Rising {
  label: string;
  count: number;
  delta_pct: number;
}
interface Brand {
  brand: string;
  count: number;
}
interface Trends {
  window_days: number;
  total: number;
  by_kind: KindCount[];
  by_grade: GradeCount[];
  rising: Rising[];
  top_brands: Brand[];
}

// 백엔드 시드와 동일한 값 — 최초 렌더 + 어떤 실패에서도 이 값으로 그린다.
const SEED: Trends = {
  window_days: 7,
  total: 1247,
  by_kind: [
    { kind: "url", count: 812 },
    { kind: "phone", count: 289 },
    { kind: "account", count: 146 },
  ],
  by_grade: [
    { grade: "danger", count: 468 },
    { grade: "warning", count: 402 },
    { grade: "caution", count: 210 },
    { grade: "safe", count: 167 },
  ],
  rising: [
    { label: "기관 사칭 URL", count: 312, delta_pct: 63 },
    { label: "택배 스미싱", count: 208, delta_pct: 47 },
    { label: "보이스피싱 번호", count: 156, delta_pct: 34 },
    { label: "사기 이용 계좌", count: 92, delta_pct: 21 },
  ],
  top_brands: [
    { brand: "토스", count: 143 },
    { brand: "KB국민", count: 121 },
    { brand: "네이버", count: 98 },
    { brand: "쿠팡", count: 87 },
    { brand: "우체국", count: 64 },
    { brand: "카카오", count: 51 },
  ],
};

// 등급 표기/색상 — globals.css 토큰만 사용해 관제 팔레트와 통일.
const GRADE_META: Record<string, { label: string; color: string }> = {
  danger: { label: "위험", color: "var(--danger)" },
  warning: { label: "주의", color: "var(--warn)" },
  caution: { label: "의심", color: "var(--accent)" },
  safe: { label: "안전", color: "var(--text-dim)" },
};

const KIND_LABEL: Record<string, string> = {
  url: "URL",
  phone: "전화",
  account: "계좌",
};

// 배열 필드가 비어 오면 시드로 메워 항상 렌더 가능한 형태로 정규화(방어적).
function normalize(raw: unknown): Trends {
  if (!raw || typeof raw !== "object") {
    return SEED;
  }
  const d = raw as Partial<Trends>;
  const arr = <T,>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) && v.length > 0 ? (v as T[]) : fallback;
  return {
    window_days: typeof d.window_days === "number" ? d.window_days : SEED.window_days,
    total: typeof d.total === "number" ? d.total : SEED.total,
    by_kind: arr<KindCount>(d.by_kind, SEED.by_kind),
    by_grade: arr<GradeCount>(d.by_grade, SEED.by_grade),
    rising: arr<Rising>(d.rising, SEED.rising),
    top_brands: arr<Brand>(d.top_brands, SEED.top_brands),
  };
}

async function fetchTrends(signal: AbortSignal): Promise<Trends> {
  // 실패(비200·네트워크·손상 JSON)면 SEED로 폴백하고, 성공 응답은 정규화한다(데모 세이프).
  const raw = await fetchJson<unknown>("/api/trends", {
    fallback: SEED,
    init: { signal, cache: "no-store" },
  });
  return normalize(raw);
}

// 증가율 칩 색상 — 급등일수록 위험색. 감소는 뮤트.
function deltaColor(d: number): string {
  if (d >= 50) return "var(--danger)";
  if (d >= 20) return "var(--warn)";
  if (d >= 0) return "var(--accent-2)";
  return "var(--text-mute)";
}
function deltaLabel(d: number): string {
  return d >= 0 ? `▲ ${d}%` : `▼ ${Math.abs(d)}%`;
}

export default function TrendStrip() {
  // 초기값도 시드 → 최초 렌더에서 빈칸이 없다(항상 렌더 = 데모 세이프).
  const [data, setData] = useState<Trends>(SEED);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    async function pull() {
      const next = await fetchTrends(controller.signal); // 내부에서 시드 폴백(예외 없음)
      if (alive) {
        setData(next);
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

  const maxDelta = Math.max(1, ...data.rising.map((r) => Math.abs(r.delta_pct)));
  const gradeTotal = Math.max(1, data.by_grade.reduce((s, g) => s + g.count, 0));

  return (
    <div className="trend" role="region" aria-label="이번 주 위협 동향 요약">
      <div className="trend-head">
        <div className="trend-head-left">
          <div className="trend-k">// 이번 주 위협 동향</div>
          <div className="trend-sub-line">
            최근 {data.window_days}일 스캔 <span className="trend-total"><CountUp value={data.total} /></span>건 집계
          </div>
        </div>
        <span className="trend-live" aria-hidden="true" />
      </div>

      <div className="trend-cols">
        {/* ── 급상승 유형 ── */}
        <section className="trend-col trend-col-rising" aria-label="급상승 위협 유형">
          <div className="trend-cap">// 급상승 유형 · 직전 7일 대비</div>
          <ul className="trend-rising">
            {data.rising.map((r, i) => {
              const ratio = Math.max(0.08, Math.abs(r.delta_pct) / maxDelta);
              const color = deltaColor(r.delta_pct);
              return (
                <li className="trend-row" key={`${r.label}-${i}`}>
                  <div className="trend-row-top">
                    <span className="trend-row-label" title={r.label}>{r.label}</span>
                    <span className="trend-chip" style={{ color, borderColor: color }}>
                      {deltaLabel(r.delta_pct)}
                    </span>
                  </div>
                  <div className="trend-row-track" aria-hidden="true">
                    <span
                      className="trend-row-fill"
                      style={{ transform: `scaleX(${ratio})`, background: color }}
                    />
                  </div>
                  <span className="trend-row-count">{r.count.toLocaleString()}건</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── 등급/유형 믹스 + 표적 브랜드 ── */}
        <section className="trend-col trend-col-mix" aria-label="등급·유형 분포와 표적 브랜드">
          <div className="trend-cap">// 위험 등급 믹스</div>
          <div
            className="trend-mix"
            role="img"
            aria-label={data.by_grade
              .map((g) => `${GRADE_META[g.grade]?.label ?? g.grade} ${g.count}건`)
              .join(", ")}
          >
            {data.by_grade.map((g) => {
              const meta = GRADE_META[g.grade] ?? { label: g.grade, color: "var(--text-dim)" };
              const pct = (g.count / gradeTotal) * 100;
              return (
                <span
                  key={g.grade}
                  className="trend-seg"
                  style={{ width: `${pct}%`, background: meta.color }}
                  title={`${meta.label} ${g.count.toLocaleString()}건`}
                />
              );
            })}
          </div>
          <div className="trend-legend">
            {data.by_grade.map((g) => {
              const meta = GRADE_META[g.grade] ?? { label: g.grade, color: "var(--text-dim)" };
              return (
                <span className="trend-leg" key={g.grade}>
                  <span className="trend-leg-dot" style={{ background: meta.color }} aria-hidden="true" />
                  {meta.label}
                  <b>{g.count.toLocaleString()}</b>
                </span>
              );
            })}
          </div>

          <div className="trend-kinds">
            {data.by_kind.map((k) => (
              <span className="trend-kind" key={k.kind}>
                <span className="trend-kind-t">{KIND_LABEL[k.kind] ?? k.kind}</span>
                <b>{k.count.toLocaleString()}</b>
              </span>
            ))}
          </div>

          <div className="trend-cap trend-cap-brands">// 표적 브랜드</div>
          <div className="trend-brands">
            {data.top_brands.map((b, i) => (
              <span className={`trend-brand${i === 0 ? " trend-brand-top" : ""}`} key={b.brand}>
                {b.brand}
                <b>{b.count.toLocaleString()}</b>
              </span>
            ))}
          </div>
        </section>
      </div>

      <style>{TREND_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const TREND_CSS = `
.trend {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-elev);
  padding: 20px 22px 22px;
  animation: trend-rise 0.6s var(--ease-out-expo) both;
}
@keyframes trend-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

.trend-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 16px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--line);
}
.trend-k {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); text-transform: uppercase;
}
.trend-sub-line {
  font-size: 14px; color: var(--text-dim); margin-top: 8px; font-weight: 600;
}
.trend-total {
  font-family: var(--mono); font-size: 20px; font-weight: 800;
  color: var(--accent); letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums; margin: 0 2px;
}
.trend-live {
  width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; margin-top: 4px;
  background: var(--accent-2);
  box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.6);
  animation: trend-pulse 1.8s infinite;
}
@keyframes trend-pulse {
  0% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.5); }
  70% { box-shadow: 0 0 0 7px rgba(124, 240, 61, 0); }
  100% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0); }
}

.trend-cols {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 26px;
}
.trend-cap {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
  color: var(--text-mute); margin-bottom: 12px; text-transform: uppercase;
}
.trend-cap-brands { margin-top: 18px; }

/* ── 급상승 유형 ── */
.trend-rising { list-style: none; display: grid; gap: 14px; }
.trend-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "top top" "track count";
  align-items: center;
  gap: 6px 12px;
}
.trend-row-top {
  grid-area: top;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.trend-row-label {
  font-size: 13px; font-weight: 700; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trend-chip {
  font-family: var(--mono); font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 999px;
  border: 1px solid currentColor;
  background: color-mix(in srgb, currentColor 12%, transparent);
  white-space: nowrap; flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.trend-row-track {
  grid-area: track;
  height: 6px; border-radius: 4px;
  background: var(--bg-card);
  overflow: hidden;
  border: 1px solid var(--line);
}
.trend-row-fill {
  display: block; height: 100%; width: 100%;
  transform-origin: left center;
  border-radius: 4px;
  transition: transform 0.6s var(--ease-out-expo);
}
.trend-row-count {
  grid-area: count;
  font-family: var(--mono); font-size: 11px; color: var(--text-dim);
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
}

/* ── 등급 믹스 바 ── */
.trend-mix {
  display: flex; width: 100%; height: 12px;
  border-radius: 6px; overflow: hidden;
  border: 1px solid var(--line);
  background: var(--bg-card);
}
.trend-seg { height: 100%; min-width: 2px; transition: width 0.5s var(--ease-out-expo); }
.trend-legend {
  display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 12px;
}
.trend-leg {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--mono); font-size: 11px; color: var(--text-dim);
}
.trend-leg-dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
.trend-leg b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }

/* ── 유형 카운트 칩 ── */
.trend-kinds { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.trend-kind {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 6px 11px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--bg-card);
  font-family: var(--mono); font-size: 11px; color: var(--text-mute);
}
.trend-kind b { color: var(--text); font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }

/* ── 표적 브랜드 칩 ── */
.trend-brands { display: flex; flex-wrap: wrap; gap: 8px; }
.trend-brand {
  display: inline-flex; align-items: baseline; gap: 6px;
  padding: 6px 11px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--bg-card);
  font-size: 12px; font-weight: 600; color: var(--text-dim);
  transition: border-color 0.18s ease, transform 0.18s ease, color 0.18s ease;
}
.trend-brand:hover { border-color: var(--accent); color: var(--text); transform: translateY(-1px); }
.trend-brand b {
  font-family: var(--mono); font-size: 11px; font-weight: 700;
  color: var(--text-mute); font-variant-numeric: tabular-nums;
}
.trend-brand-top {
  border-color: rgba(255, 77, 109, 0.5);
  color: var(--text);
}
.trend-brand-top b { color: var(--danger); }

@media (max-width: 760px) {
  .trend-cols { grid-template-columns: 1fr; gap: 22px; }
}
`;
