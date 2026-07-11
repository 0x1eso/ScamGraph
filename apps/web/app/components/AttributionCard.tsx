"use client";

// ScamGraph — 사기 조직 귀속(Attribution) 카드
// 스캔된 단일 엔티티 → gateway /api/attribution 호출 → 조직 전체 인프라 복원.
// 이 화면이 정부·통신사 서비스와의 핵심 차별점: 그들은 하나만 보고, 우리는 조직을 복원한다.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

import { useEffect, useState } from "react";
import { getAttribution, type Attribution, type Pivot } from "@/lib/attribution";

interface AttributionCardProps {
  // 스캔 콘솔에서 확정된 대상 값. null이면 아직 조회할 것이 없다.
  target: string | null;
}

// 피벗 타입별 한글 라벨(공유 인프라 종류 표시용).
const PIVOT_LABEL: Record<string, string> = {
  IP: "IP",
  Account: "계좌",
  Phone: "전화",
  Host: "호스트",
};

export default function AttributionCard({ target }: AttributionCardProps) {
  const [data, setData] = useState<Attribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const value = target?.trim();
    if (!value) {
      setData(null);
      setError(false);
      setLoading(false);
      return;
    }

    // 대상이 바뀌면 이전 요청 결과는 무시(stale 응답 취소).
    let ignore = false;
    setLoading(true);
    setError(false);

    getAttribution(value)
      .then((result) => {
        if (ignore) return;
        setData(result);
      })
      .catch(() => {
        if (ignore) return;
        // 데모 안전성: 실패해도 UI를 무너뜨리지 않는다.
        setData(null);
        setError(true);
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [target]);

  // 조회 대상이 없으면 아무것도 그리지 않는다.
  if (!target?.trim()) {
    return null;
  }

  if (loading) {
    return (
      <div className="attr" role="status" aria-live="polite">
        <div className="attr-loading">
          <span className="attr-loading-dot" /> 연루 분석 중…
        </div>
        <style>{ATTRIBUTION_CSS}</style>
      </div>
    );
  }

  // 데모 안전성: 오류 시 카드를 숨긴다(크래시 금지).
  if (error || !data) {
    return null;
  }

  // 조직 연결이 없으면 조용한 안내만 노출.
  if (data.organization === null) {
    return (
      <div className="attr" key={data.value}>
        <div className="attr-none">
          인프라 연결 없음 — 독립 엔티티 (알려진 조직과 공유 인프라 없음)
        </div>
        <style>{ATTRIBUTION_CSS}</style>
      </div>
    );
  }

  return (
    <div className="attr" key={data.value}>
      <AttributionPanel data={data} organization={data.organization} />
      <style>{ATTRIBUTION_CSS}</style>
    </div>
  );
}

// ── 귀속 패널 (조직 연결이 있을 때의 핵심 카드) ─────────────────
function AttributionPanel({
  data,
  organization,
}: {
  data: Attribution;
  organization: string;
}) {
  const entities = data.entities ?? {
    domains: [],
    phones: [],
    accounts: [],
    ips: [],
  };

  return (
    <div className="attr-card">
      <div className="attr-head">
        <span className="attr-icon">🔗</span>
        <span className="attr-title">사기 조직 귀속</span>
        <span className="attr-org" title={organization}>
          {organization}
        </span>
      </div>

      <p className="attr-summary">{data.summary}</p>

      <div className="attr-entities">
        <EntityGroup label="도메인" values={entities.domains ?? []} />
        <EntityGroup label="전화" values={entities.phones ?? []} />
        <EntityGroup label="계좌" values={entities.accounts ?? []} />
        <EntityGroup label="IP" values={entities.ips ?? []} />
      </div>

      {data.pivots?.length > 0 && (
        <div className="attr-pivots">
          <div className="attr-pivots-label">// 공유 인프라 증거</div>
          <div className="attr-pivot-chips">
            {data.pivots.map((pivot, i) => (
              <PivotChip key={`${pivot.type}-${pivot.value}-${i}`} pivot={pivot} />
            ))}
          </div>
        </div>
      )}

      {data.sources?.length > 0 && (
        <div className="attr-sources">
          <span className="attr-sources-label">출처:</span>
          {data.sources.map((source, i) => (
            <span className="attr-source-chip" key={`${source}-${i}`}>
              {source}
            </span>
          ))}
        </div>
      )}

      <p className="attr-tagline">
        단일 기관은 이 중 하나만 봅니다. ScamGraph는 조직 전체를 복원합니다.
      </p>
    </div>
  );
}

// ── 엔티티 그룹 (라벨 + 개수, 펼치면 실제 값 목록) ─────────────
function EntityGroup({ label, values }: { label: string; values: string[] }) {
  const count = values.length;

  // 값이 없으면 펼칠 것이 없으므로 카운트만 정적으로 표시.
  if (count === 0) {
    return (
      <div className="attr-entity attr-entity-empty">
        <span className="attr-entity-k">{label}</span>
        <span className="attr-entity-n">0</span>
      </div>
    );
  }

  return (
    <details className="attr-entity">
      <summary className="attr-entity-summary">
        <span className="attr-entity-k">{label}</span>
        <span className="attr-entity-n">{count}</span>
        <span className="attr-entity-caret" aria-hidden="true">
          ▸
        </span>
      </summary>
      <ul className="attr-entity-list">
        {values.map((value, i) => (
          <li className="attr-entity-item" key={`${value}-${i}`}>
            {value}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── 공유 인프라 피벗 칩 ──────────────────────────────────────
function PivotChip({ pivot }: { pivot: Pivot }) {
  const typeLabel = PIVOT_LABEL[pivot.type] ?? pivot.type;

  return (
    <span className="attr-pivot" title={`${pivot.value} — ${pivot.sharedWith}개 대상과 공유`}>
      <span className="attr-pivot-type">공유 {typeLabel}</span>
      <span className="attr-pivot-value">{pivot.value}</span>
      <span className="attr-pivot-count">{pivot.sharedWith}개 대상 공유</span>
    </span>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const ATTRIBUTION_CSS = `
.attr {
  margin: 20px 0 8px;
  animation: attr-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes attr-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.attr-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-card);
  font-family: var(--mono); font-size: 12px; color: var(--accent);
}
.attr-loading-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent);
  animation: attr-pulse 1s ease-in-out infinite;
}
@keyframes attr-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }

.attr-none {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-card);
  font-family: var(--mono); font-size: 12px; color: var(--text-mute);
}

/* ── 핵심 귀속 카드: danger 좌측 강조선 + 카드 톤 ── */
.attr-card {
  position: relative;
  border: 1px solid var(--line);
  border-left: 3px solid var(--danger);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  padding: 22px 24px 20px;
  overflow: hidden;
}
.attr-card::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(420px 180px at 0% 0%, rgba(255, 77, 109, 0.08), transparent 70%);
  pointer-events: none;
}

.attr-head {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
  position: relative;
}
.attr-icon { font-size: 18px; }
.attr-title {
  font-size: 15px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--text);
}
.attr-org {
  font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: 0.5px;
  padding: 4px 12px; border-radius: 8px;
  color: var(--danger);
  border: 1px solid var(--danger);
  background: rgba(255, 77, 109, 0.1);
  max-width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.attr-summary {
  position: relative;
  margin: 16px 0 18px;
  font-size: clamp(1rem, 0.94rem + 0.4vw, 1.2rem);
  line-height: 1.55;
  color: var(--text);
}

/* ── 엔티티 개수 행 (펼치면 실제 값) ── */
.attr-entities {
  position: relative;
  display: flex; flex-wrap: wrap; gap: 10px;
  margin-bottom: 18px;
}
.attr-entity {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
  overflow: hidden;
  min-width: 120px;
}
.attr-entity-empty {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  opacity: 0.55;
}
.attr-entity-summary {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.attr-entity-summary::-webkit-details-marker { display: none; }
.attr-entity[open] > .attr-entity-summary { background: rgba(0, 229, 192, 0.05); }
.attr-entity-summary:hover { background: rgba(0, 229, 192, 0.06); }
.attr-entity-k {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute);
}
.attr-entity-n {
  font-size: 18px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--accent);
}
.attr-entity-caret {
  margin-left: auto;
  font-size: 10px; color: var(--text-mute);
  transition: transform 0.18s ease;
}
.attr-entity[open] .attr-entity-caret { transform: rotate(90deg); }
.attr-entity-list {
  list-style: none;
  border-top: 1px solid var(--line);
  padding: 8px 14px 10px;
  display: grid; gap: 6px;
  max-height: 200px; overflow-y: auto;
}
.attr-entity-item {
  font-family: var(--mono); font-size: 12px; color: var(--text-dim);
  word-break: break-all;
}

/* ── 공유 인프라 피벗 (조직 연결의 물증) ── */
.attr-pivots { position: relative; margin-bottom: 18px; }
.attr-pivots-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); margin-bottom: 10px;
}
.attr-pivot-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.attr-pivot {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: rgba(0, 229, 192, 0.08);
  transition: transform 0.18s ease, box-shadow 0.2s ease;
}
.attr-pivot:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px rgba(0, 229, 192, 0.18);
}
.attr-pivot-type {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
  color: var(--text-mute);
}
.attr-pivot-value {
  font-family: var(--mono); font-size: 12px; font-weight: 700;
  color: var(--accent);
}
.attr-pivot-count {
  font-family: var(--mono); font-size: 10px;
  padding: 2px 7px; border-radius: 999px;
  background: rgba(0, 229, 192, 0.12);
  color: var(--accent);
  white-space: nowrap;
}

/* ── 출처 칩 ── */
.attr-sources {
  position: relative;
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin-bottom: 16px;
}
.attr-sources-label {
  font-family: var(--mono); font-size: 11px; color: var(--text-mute);
  margin-right: 2px;
}
.attr-source-chip {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.3px;
  padding: 3px 9px; border-radius: 6px;
  border: 1px solid var(--line);
  color: var(--text-dim);
  background: var(--bg);
}

/* ── 차별점 태그라인 ── */
.attr-tagline {
  position: relative;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 13px; line-height: 1.5;
  color: var(--text-dim);
}
.attr-tagline::first-line { color: var(--accent-2); }

@media (max-width: 520px) {
  .attr-entity { min-width: 100%; }
}
`;
