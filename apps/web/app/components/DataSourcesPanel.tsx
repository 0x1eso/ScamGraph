"use client";

// ScamGraph — 데이터 소스 패널 (클라이언트 아일랜드)
// 연결된 외부 위협 피드(글로벌·정부)의 등재 지표 수와 갱신 상태를 보여준다.
// 게이트웨이 /api/feeds/stats 를 ~15초 주기로 폴링하되, 실패해도 시드로 항상 렌더한다(데모 세이프).
// "실제 외부 위협 데이터에 근거한다"는 신뢰 신호를 전면에 세운다.

import { useEffect, useState } from "react";
import { getFeedStats, seedFeedStats, type FeedSource, type FeedStats } from "@/lib/api";
import CountUp from "./CountUp";

const POLL_MS = 15000;

// kind 별 그룹 표시 순서/라벨. 글로벌(라이브·대량)을 먼저, 정부(신뢰 앵커)를 뒤에.
const GROUPS: ReadonlyArray<{ kind: FeedSource["kind"]; label: string; hint: string }> = [
  { kind: "global", label: "글로벌 위협 피드", hint: "OpenPhish · URLhaus · ThreatFox" },
  { kind: "gov", label: "정부 데이터", hint: "공식 등재 기반" },
];

// ISO 문자열 → "n분 전 갱신". null(정적 스냅샷)이면 갱신 대신 상태를 표기한다.
// 시드는 고정 오프셋으로 생성되므로 서버/클라이언트 상대 표현이 일치한다(하이드레이션 안전).
function relativeUpdated(iso: string | null, now: number): string {
  if (!iso) {
    return "정적 스냅샷";
  }
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return "정적 스냅샷";
  }
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) {
    return "방금 갱신";
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}분 전 갱신`;
  }
  const hour = Math.floor(min / 60);
  if (hour < 24) {
    return `${hour}시간 전 갱신`;
  }
  return `${Math.floor(hour / 24)}일 전 갱신`;
}

export default function DataSourcesPanel() {
  // 초기값도 시드로 채워 최초 렌더에서 빈칸이 없게 한다(항상 렌더 = 데모 세이프).
  const [stats, setStats] = useState<FeedStats>(() => seedFeedStats());

  useEffect(() => {
    let alive = true;
    async function pull() {
      const next = await getFeedStats(); // 실패해도 내부에서 시드로 폴백(예외 없음).
      if (alive) {
        setStats(next);
      }
    }
    pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const now = Date.now();
  const liveCount = stats.sources.filter((s) => s.status === "live").length;

  return (
    <div className="ds" role="region" aria-label="연결된 외부 위협 데이터 소스 현황">
      <div className="ds-head">
        <div className="ds-head-left">
          <div className="ds-k">// 총 등재 지표</div>
          <div className="ds-total"><CountUp value={stats.total_indicators} /></div>
          <div className="ds-sub">
            {stats.sources.length}개 소스 연결 · <span className="ds-live">{liveCount} LIVE</span>
          </div>
        </div>
        <span className="ds-live-dot" aria-hidden="true" />
      </div>

      {GROUPS.map((group) => {
        const rows = stats.sources.filter((s) => s.kind === group.kind);
        if (rows.length === 0) {
          return null;
        }
        return (
          <div className="ds-group" key={group.kind}>
            <div className="ds-group-head">
              <span className="ds-group-label">{group.label}</span>
              <span className="ds-group-hint">{group.hint}</span>
            </div>
            <ul className="ds-list">
              {rows.map((source) => (
                <li className="ds-row" key={source.id}>
                  <span className={`ds-dot ds-dot-${source.status}`} aria-hidden="true" />
                  <span className="ds-label">{source.label}</span>
                  <CountUp value={source.count} className="ds-count" />
                  <span className="ds-updated">{relativeUpdated(source.last_updated, now)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <style>{DATA_SOURCES_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const DATA_SOURCES_CSS = `
.ds {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-elev);
  padding: 20px 22px 22px;
}

.ds-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 18px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--line);
}
.ds-k {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); text-transform: uppercase;
}
.ds-total {
  font-size: clamp(2.2rem, 1.4rem + 2vw, 2.8rem);
  font-weight: 800; letter-spacing: -0.02em; line-height: 1.05;
  margin-top: 6px; color: var(--accent);
}
.ds-sub {
  font-family: var(--mono); font-size: 11px; color: var(--text-dim); margin-top: 6px;
}
.ds-live { color: var(--accent-2); font-weight: 700; }
.ds-live-dot {
  width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; margin-top: 4px;
  background: var(--accent-2);
  box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.6);
  animation: ds-pulse 1.8s infinite;
}
@keyframes ds-pulse {
  0% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.5); }
  70% { box-shadow: 0 0 0 7px rgba(124, 240, 61, 0); }
  100% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0); }
}

.ds-group { margin-top: 18px; }
.ds-group-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.ds-group-label { font-weight: 700; font-size: 13px; letter-spacing: -0.01em; }
.ds-group-hint {
  font-family: var(--mono); font-size: 10px; color: var(--text-mute); letter-spacing: 0.5px;
}

.ds-list { list-style: none; display: grid; gap: 8px; }
.ds-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-card);
  transition: border-color 0.18s ease, transform 0.18s ease;
}
.ds-row:hover { border-color: var(--accent); transform: translateX(2px); }
.ds-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.ds-dot-live { background: var(--accent); box-shadow: 0 0 8px rgba(0, 229, 192, 0.85); }
.ds-dot-seed { background: var(--warn); box-shadow: 0 0 8px rgba(255, 176, 32, 0.6); }
.ds-label {
  font-size: 13px; color: var(--text); font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ds-count {
  font-family: var(--mono); font-size: 14px; font-weight: 700;
  color: var(--text); text-align: right; font-variant-numeric: tabular-nums;
}
.ds-updated {
  font-family: var(--mono); font-size: 10px; color: var(--text-mute);
  text-align: right; white-space: nowrap; min-width: 78px;
}

@media (max-width: 480px) {
  .ds-row { grid-template-columns: auto 1fr auto; }
  .ds-updated { grid-column: 2 / 4; text-align: left; margin-top: 2px; }
}
`;
