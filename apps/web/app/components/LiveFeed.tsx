"use client";

// ScamGraph — 실시간 신고 피드 패널
// gateway /ws/feed 로 스트리밍되는 스캔·신고 이벤트를 최신순으로 렌더한다.
// 데모 안전성: 접속 전에도 비지 않도록 시드 이벤트를 채우고, 끊기면 자동 재접속한다.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS keyframe으로 처리한다.

import { useEffect, useRef, useState } from "react";
import { subscribeFeed, type FeedEvent } from "@/lib/feed";

// 리스트에 유지할 최대 이벤트 수(오래된 항목은 잘라낸다).
const MAX_ROWS = 30;

// 등급별 점 색상(디자인 토큰 재사용). null은 등급 미판정.
const GRADE_COLOR: Record<NonNullable<FeedEvent["grade"]>, string> = {
  danger: "var(--danger)",
  warning: "var(--warn)",
  caution: "#c0cf3d",
  safe: "var(--accent-2)",
};

const KIND_LABEL: Record<FeedEvent["kind"], string> = {
  url: "URL",
  phone: "전화번호",
  account: "계좌",
};

const TYPE_LABEL: Record<FeedEvent["type"], string> = {
  scan: "스캔",
  report: "신고",
};

function gradeColor(grade: FeedEvent["grade"]): string {
  return grade ? GRADE_COLOR[grade] : "var(--text-mute)";
}

// epoch(ms) 기준 상대 시간 라벨. 데모에서 자주 보이는 초·분 단위만 다룬다.
function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 3) {
    return "방금";
  }
  if (sec < 60) {
    return `${sec}초 전`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}분 전`;
  }
  const hour = Math.floor(min / 60);
  return `${hour}시간 전`;
}

// 각 행의 본문: 신고는 note, 스캔은 위험도 요약을 우선한다.
function rowNote(event: FeedEvent): string {
  if (event.note) {
    return event.note;
  }
  if (event.risk_score !== null) {
    return `위험도 ${event.risk_score}`;
  }
  return event.type === "report" ? "신규 신고 접수" : "대상 스캔 완료";
}

// 접속 전에도 패널이 비지 않도록 채우는 시드 이벤트(데모 안전성).
function seedEvents(now: number): FeedEvent[] {
  return [
    {
      type: "report",
      target: "010-3921-7744",
      kind: "phone",
      grade: "danger",
      risk_score: 92,
      note: "대출 빙자 보이스피싱 다수 제보",
      ts: now - 4000,
    },
    {
      type: "scan",
      target: "http://kb-event-login.co",
      kind: "url",
      grade: "warning",
      risk_score: 74,
      note: null,
      ts: now - 12000,
    },
    {
      type: "report",
      target: "3333-09-882211",
      kind: "account",
      grade: "caution",
      risk_score: 58,
      note: "중고거래 미입금 신고",
      ts: now - 31000,
    },
    {
      type: "scan",
      target: "safe-shop.co.kr",
      kind: "url",
      grade: "safe",
      risk_score: 8,
      note: null,
      ts: now - 68000,
    },
  ];
}

// 동일 이벤트가 여러 번 렌더될 때 안정적인 key를 만들기 위한 시퀀스 태그.
type FeedRow = FeedEvent & { seq: number };

export default function LiveFeed() {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [connected, setConnected] = useState(false);
  // 상대 시간 재계산 기준. 실제로는 각 렌더 시점 now를 사용한다.
  const [now, setNow] = useState(() => Date.now());
  const seqRef = useRef(0);

  // 시드 채우기 + 상대 시간 갱신 타이머.
  useEffect(() => {
    const base = Date.now();
    setRows(seedEvents(base).map((event) => ({ ...event, seq: seqRef.current++ })));

    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // 피드 구독: 새 이벤트를 맨 앞에 넣고 MAX_ROWS로 잘라낸다.
  useEffect(() => {
    const unsubscribe = subscribeFeed(
      (event) => {
        setRows((prev) => {
          const next: FeedRow = { ...event, seq: seqRef.current++ };
          return [next, ...prev].slice(0, MAX_ROWS);
        });
      },
      (isConnected) => setConnected(isConnected),
    );
    return unsubscribe;
  }, []);

  return (
    <div className="lf">
      <div className="lf-head">
        <span className={`lf-live-dot ${connected ? "on" : "off"}`} aria-hidden="true" />
        <span className="lf-title">실시간 신고 피드</span>
        <span className="lf-spacer" />
        <span className={`lf-status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE · 연결됨" : "대기 · 재연결 중"}
        </span>
      </div>

      <ul className="lf-list" role="log" aria-live="polite" aria-label="실시간 신고 피드">
        {rows.map((row) => (
          <li className="lf-row" key={row.seq}>
            <span
              className="lf-grade-dot"
              style={{ background: gradeColor(row.grade) }}
              aria-hidden="true"
            />
            <div className="lf-main">
              <div className="lf-line1">
                <span className={`lf-type lf-type-${row.type}`}>{TYPE_LABEL[row.type]}</span>
                <span className="lf-target" title={row.target}>
                  {row.target}
                </span>
                <span className="lf-kind">{KIND_LABEL[row.kind]}</span>
              </div>
              <div className="lf-note">{rowNote(row)}</div>
            </div>
            <span className="lf-time">{relativeTime(row.ts, now)}</span>
          </li>
        ))}
      </ul>

      <style>{LIVE_FEED_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const LIVE_FEED_CSS = `
.lf {
  height: 520px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg-card);
  overflow: hidden;
}

.lf-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-elev);
}
.lf-title { font-weight: 700; font-size: 14px; letter-spacing: -0.01em; }
.lf-spacer { flex: 1; }
.lf-status {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.5px;
  padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line);
}
.lf-status.on { color: var(--accent-2); border-color: rgba(124, 240, 61, 0.4); }
.lf-status.off { color: var(--text-mute); }

.lf-live-dot {
  width: 9px; height: 9px; border-radius: 50%;
  flex: 0 0 auto;
}
.lf-live-dot.on {
  background: var(--accent-2);
  box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.6);
  animation: lf-pulse 1.8s infinite;
}
.lf-live-dot.off { background: var(--text-mute); }
@keyframes lf-pulse {
  0% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0.5); }
  70% { box-shadow: 0 0 0 7px rgba(124, 240, 61, 0); }
  100% { box-shadow: 0 0 0 0 rgba(124, 240, 61, 0); }
}

.lf-list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lf-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
  transition: border-color 0.18s ease, transform 0.18s ease;
  animation: lf-slide-in 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.lf-row:hover { border-color: var(--accent); transform: translateX(2px); }
@keyframes lf-slide-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.lf-grade-dot {
  width: 10px; height: 10px; border-radius: 50%;
  flex: 0 0 auto; margin-top: 5px;
  box-shadow: 0 0 8px currentColor;
}

.lf-main { flex: 1; min-width: 0; }
.lf-line1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lf-type {
  font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
  padding: 2px 7px; border-radius: 6px; flex: 0 0 auto;
}
.lf-type-report { color: var(--danger); background: rgba(255, 77, 109, 0.1); }
.lf-type-scan { color: var(--accent); background: rgba(0, 229, 192, 0.1); }
.lf-target {
  font-family: var(--mono); font-size: 13px; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.lf-kind {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.5px;
  padding: 2px 7px; border-radius: 6px;
  border: 1px solid var(--line); color: var(--text-dim); flex: 0 0 auto;
}
.lf-note {
  font-size: 12px; color: var(--text-dim); line-height: 1.5; margin-top: 5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.lf-time {
  font-family: var(--mono); font-size: 11px; color: var(--text-mute);
  flex: 0 0 auto; margin-top: 3px; white-space: nowrap;
}

.lf-list::-webkit-scrollbar { width: 8px; }
.lf-list::-webkit-scrollbar-thumb { background: var(--line); border-radius: 8px; }
.lf-list::-webkit-scrollbar-track { background: transparent; }
`;
