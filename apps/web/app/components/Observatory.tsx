"use client";

// ScamGraph — 그래프 관제(Observatory) · 조직 단위 분석 (클라이언트 아일랜드)
// 게이트웨이 /api/graph/analytics 로 관계망의 "구조"를 읽는다:
//   · 캠페인(연결 컴포넌트) 수와 규모
//   · 허브(degree) — 가장 많이 얽힌 노드
//   · 핵심 브릿지(betweenness) — 조직 사이를 잇는 길목
//   · 절단점(articulation points) — 차단 시 조직이 물리적으로 분리되는 핵심 인프라  ← 킬샷
// ~40초 폴링하되 실패/미가동이면 시드로 항상 렌더한다(데모 세이프 = 절대 빈칸 없음).
// 표현 가이드 준수: 도메인 defang([.]), 계좌/전화 마스킹, 캠페인은 코드명. 단정 금지.

import { useEffect, useState } from "react";
import CountUp from "./CountUp";

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";
const POLL_MS = 40000;

interface ComponentInfo {
  id: string;
  size: number;
  top_hub: string;
}
interface DegreeNode {
  label: string;
  degree: number;
}
interface BetweennessNode {
  label: string;
  betweenness: number;
}
interface Articulation {
  label: string;
}
interface Analytics {
  components: ComponentInfo[];
  top_degree: DegreeNode[];
  top_betweenness: BetweennessNode[];
  articulation_points: Articulation[];
  node_count: number;
  edge_count: number;
}

// 백엔드 시드와 정합적인 값 — 최초 렌더 + 어떤 실패에서도 이 값으로 그린다.
// 시드 그래프(infra/neo4j/seed.cypher)에서 IP 203.0.113.44 가 택배사칭-A · 은행피싱-B 를
// 잇는 유일한 공유 인프라 → 최상위 브릿지이자 절단점. "차단 시 조직 분리" 스토리의 핵심.
const SEED: Analytics = {
  node_count: 1284,
  edge_count: 2117,
  components: [
    { id: "CAMP-2026-041", size: 46, top_hub: "203.0.113.44" },
    { id: "CAMP-2026-038", size: 38, top_hub: "kbstat-secure[.]click" },
    { id: "CAMP-2026-033", size: 24, top_hub: "cj-delivery-check[.]top" },
    { id: "CAMP-2026-029", size: 17, top_hub: "shinhan-otp[.]xyz" },
    { id: "CAMP-2026-022", size: 11, top_hub: "070-****-9981" },
  ],
  top_degree: [
    { label: "203.0.113.44", degree: 27 },
    { label: "kbstat-secure[.]click", degree: 14 },
    { label: "cj-delivery-check[.]top", degree: 12 },
    { label: "shinhan-otp[.]xyz", degree: 9 },
    { label: "070-****-1120", degree: 7 },
  ],
  top_betweenness: [
    { label: "203.0.113.44", betweenness: 0.61 },
    { label: "cj-delivery-track[.]xyz", betweenness: 0.34 },
    { label: "kbstat-secure[.]click", betweenness: 0.28 },
    { label: "농협 ***-**-10", betweenness: 0.19 },
  ],
  articulation_points: [
    { label: "203.0.113.44" },
    { label: "kbstat-secure[.]click" },
    { label: "cj-delivery-track[.]xyz" },
  ],
};

// 배열 필드가 비어 오면 시드로 메워 항상 렌더 가능한 형태로 정규화(방어적).
function normalize(raw: unknown): Analytics {
  if (!raw || typeof raw !== "object") {
    return SEED;
  }
  const d = raw as Partial<Analytics>;
  const arr = <T,>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) && v.length > 0 ? (v as T[]) : fallback;
  return {
    node_count: typeof d.node_count === "number" ? d.node_count : SEED.node_count,
    edge_count: typeof d.edge_count === "number" ? d.edge_count : SEED.edge_count,
    components: arr<ComponentInfo>(d.components, SEED.components),
    top_degree: arr<DegreeNode>(d.top_degree, SEED.top_degree),
    top_betweenness: arr<BetweennessNode>(d.top_betweenness, SEED.top_betweenness),
    articulation_points: arr<Articulation>(d.articulation_points, SEED.articulation_points),
  };
}

async function fetchAnalytics(signal: AbortSignal): Promise<Analytics> {
  try {
    const res = await fetch(`${GATEWAY}/api/graph/analytics`, { signal, cache: "no-store" });
    if (!res.ok) {
      return SEED;
    }
    return normalize(await res.json());
  } catch {
    // 게이트웨이/Neo4j 미가동 → 시드(예외를 밖으로 던지지 않는다 = 데모 세이프)
    return SEED;
  }
}

export default function Observatory() {
  // 초기값도 시드 → 최초 렌더에서 빈칸이 없다(항상 렌더 = 데모 세이프).
  const [data, setData] = useState<Analytics>(SEED);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    async function pull() {
      const next = await fetchAnalytics(controller.signal); // 내부에서 시드 폴백(예외 없음)
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

  const maxSize = Math.max(1, ...data.components.map((c) => c.size));
  const maxDeg = Math.max(1, ...data.top_degree.map((d) => d.degree));
  const maxBtw = Math.max(0.01, ...data.top_betweenness.map((b) => b.betweenness));
  const cutCount = data.articulation_points.length;

  return (
    <div className="obs" role="region" aria-label="관계망 그래프 조직 단위 분석">
      <div className="obs-head">
        <div className="obs-head-left">
          <div className="obs-k">// 그래프 관제 · 조직 단위 분석</div>
          <p className="obs-lede">
            개별 신고를 넘어 <b>사기 인프라의 구조</b>를 읽는다. 국가기관도 잘 보지 못하는
            <b> 조직 단위 연결·길목·급소</b>를 그래프 이론으로 드러낸다.
          </p>
        </div>
        <div className="obs-scale" aria-label="분석 대상 규모">
          <span className="obs-scale-item">
            <b><CountUp value={data.node_count} /></b>노드
          </span>
          <span className="obs-scale-sep" aria-hidden="true">·</span>
          <span className="obs-scale-item">
            <b><CountUp value={data.edge_count} /></b>관계
          </span>
        </div>
      </div>

      {/* ── 킬샷: 절단점(핵심 인프라) — 차단 시 조직이 분리되는 급소 ── */}
      <section className="obs-cut" aria-label="차단 시 조직이 분리되는 핵심 인프라(절단점)">
        <div className="obs-cut-head">
          <span className="obs-cut-badge">차단 우선순위</span>
          <span className="obs-cut-title">
            핵심 인프라 <b>{cutCount}</b>개 — 차단 시 확인된 캠페인 클러스터가 <b>물리적으로 분리</b>됩니다
          </span>
        </div>
        <ul className="obs-cut-list">
          {data.articulation_points.map((a, i) => (
            <li className="obs-cut-card" key={`${a.label}-${i}`}>
              <span className="obs-cut-icon" aria-hidden="true">✂</span>
              <span className="obs-cut-label" title={a.label}>{a.label}</span>
              <span className="obs-cut-tag">조직 분리 지점</span>
            </li>
          ))}
        </ul>
        <p className="obs-cut-note">
          절단점(articulation point) = 제거 시 그래프가 둘 이상으로 쪼개지는 노드. 한정된 단속
          자원을 <b>가장 파급이 큰 급소</b>에 집중하도록 근거를 제공합니다.
        </p>
      </section>

      <div className="obs-cols">
        {/* ── 캠페인(연결 컴포넌트) ── */}
        <section className="obs-col" aria-label="캠페인 클러스터(연결 컴포넌트)">
          <div className="obs-cap">
            <span>// 캠페인 클러스터</span>
            <span className="obs-cap-n">{data.components.length}개 탐지</span>
          </div>
          <ul className="obs-rows">
            {data.components.map((c, i) => {
              const ratio = Math.max(0.06, c.size / maxSize);
              return (
                <li className="obs-row" key={`${c.id}-${i}`}>
                  <div className="obs-row-top">
                    <span className="obs-code">{c.id}</span>
                    <span className="obs-size">{c.size}개 자산</span>
                  </div>
                  <div className="obs-track" aria-hidden="true">
                    <span className="obs-fill obs-fill-accent" style={{ transform: `scaleX(${ratio})` }} />
                  </div>
                  <span className="obs-hub" title={c.top_hub}>핵심 노드 · {c.top_hub}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── 허브(degree) ── */}
        <section className="obs-col" aria-label="최다 연결 허브(degree centrality)">
          <div className="obs-cap">
            <span>// 최다 연결 허브</span>
            <span className="obs-cap-n">degree</span>
          </div>
          <ul className="obs-rows">
            {data.top_degree.map((d, i) => {
              const ratio = Math.max(0.06, d.degree / maxDeg);
              return (
                <li className="obs-row obs-row-compact" key={`${d.label}-${i}`}>
                  <div className="obs-row-top">
                    <span className="obs-node-label" title={d.label}>{d.label}</span>
                    <span className="obs-metric">{d.degree}</span>
                  </div>
                  <div className="obs-track" aria-hidden="true">
                    <span className="obs-fill obs-fill-warn" style={{ transform: `scaleX(${ratio})` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── 핵심 브릿지(betweenness) ── */}
        <section className="obs-col" aria-label="핵심 브릿지(betweenness centrality)">
          <div className="obs-cap">
            <span>// 핵심 브릿지</span>
            <span className="obs-cap-n">betweenness</span>
          </div>
          <ul className="obs-rows">
            {data.top_betweenness.map((b, i) => {
              const ratio = Math.max(0.06, b.betweenness / maxBtw);
              return (
                <li className="obs-row obs-row-compact" key={`${b.label}-${i}`}>
                  <div className="obs-row-top">
                    <span className="obs-node-label" title={b.label}>{b.label}</span>
                    <span className="obs-metric">{b.betweenness.toFixed(2)}</span>
                  </div>
                  <div className="obs-track" aria-hidden="true">
                    <span className="obs-fill obs-fill-danger" style={{ transform: `scaleX(${ratio})` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <style>{OBSERVATORY_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const OBSERVATORY_CSS = `
.obs {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-elev);
  padding: 22px 24px 24px;
  animation: obs-rise 0.6s var(--ease-out-expo) both;
}
@keyframes obs-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

.obs-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 20px; flex-wrap: wrap;
  padding-bottom: 18px; margin-bottom: 20px;
  border-bottom: 1px solid var(--line);
}
.obs-k {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); text-transform: uppercase;
}
.obs-lede {
  font-size: 14px; color: var(--text-dim); line-height: 1.6;
  margin-top: 10px; max-width: 560px;
}
.obs-lede b { color: var(--text); font-weight: 700; }
.obs-scale {
  display: inline-flex; align-items: baseline; gap: 10px;
  font-family: var(--mono); font-size: 12px; color: var(--text-mute);
  white-space: nowrap;
}
.obs-scale-item b {
  font-size: 20px; font-weight: 800; color: var(--accent);
  margin-right: 4px; font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
}
.obs-scale-sep { color: var(--line); font-size: 16px; }

/* ── 절단점 킬샷 카드 ── */
.obs-cut {
  border: 1px solid rgba(255, 77, 109, 0.35);
  border-radius: 12px;
  background:
    radial-gradient(120% 120% at 100% 0%, rgba(255, 77, 109, 0.08), transparent 60%),
    var(--bg-card);
  padding: 18px 18px 16px;
  margin-bottom: 20px;
}
.obs-cut-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.obs-cut-badge {
  font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--danger);
  border: 1px solid rgba(255, 77, 109, 0.5);
  background: rgba(255, 77, 109, 0.1);
  padding: 4px 9px; border-radius: 999px; white-space: nowrap;
}
.obs-cut-title { font-size: 14px; color: var(--text-dim); font-weight: 600; line-height: 1.5; }
.obs-cut-title b { color: var(--text); font-weight: 800; }
.obs-cut-list { list-style: none; display: flex; flex-wrap: wrap; gap: 10px; }
.obs-cut-card {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 77, 109, 0.35);
  border-radius: 10px;
  background: var(--bg-elev);
  transition: border-color var(--dur-fast) ease, transform var(--dur-fast) ease;
}
.obs-cut-card:hover { border-color: var(--danger); transform: translateY(-2px); }
.obs-cut-icon { color: var(--danger); font-size: 14px; line-height: 1; }
.obs-cut-label {
  font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--text);
  letter-spacing: -0.01em;
}
.obs-cut-tag {
  font-family: var(--mono); font-size: 10px; color: var(--danger);
  padding-left: 10px; border-left: 1px solid var(--line);
}
.obs-cut-note {
  font-size: 12px; color: var(--text-mute); line-height: 1.6; margin-top: 14px;
}
.obs-cut-note b { color: var(--text-dim); font-weight: 700; }

/* ── 3열 지표 ── */
.obs-cols {
  display: grid;
  grid-template-columns: 1.25fr 1fr 1fr;
  gap: 22px;
}
.obs-col { min-width: 0; }
.obs-cap {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
  color: var(--text-mute); text-transform: uppercase;
  margin-bottom: 14px;
  padding-bottom: 8px; border-bottom: 1px solid var(--line);
}
.obs-cap-n { color: var(--text-dim); }

.obs-rows { list-style: none; display: grid; gap: 14px; }
.obs-row { display: grid; gap: 6px; }
.obs-row-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.obs-code {
  font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--accent);
  letter-spacing: 0.02em;
}
.obs-size {
  font-family: var(--mono); font-size: 11px; color: var(--text-dim);
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.obs-node-label {
  font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.obs-metric {
  font-family: var(--mono); font-size: 13px; font-weight: 800; color: var(--text);
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.obs-track {
  height: 6px; border-radius: 4px;
  background: var(--bg); border: 1px solid var(--line); overflow: hidden;
}
.obs-fill {
  display: block; height: 100%; width: 100%;
  transform-origin: left center; border-radius: 4px;
  transition: transform 0.6s var(--ease-out-expo);
}
.obs-fill-accent { background: var(--accent); }
.obs-fill-warn { background: var(--warn); }
.obs-fill-danger { background: var(--danger); }
.obs-hub {
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

@media (max-width: 860px) {
  .obs-cols { grid-template-columns: 1fr 1fr; }
  .obs-col:first-child { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .obs-cols { grid-template-columns: 1fr; }
  .obs-col:first-child { grid-column: auto; }
}
`;
