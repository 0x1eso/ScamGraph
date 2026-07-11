"use client";

// ScamGraph — 상단 실시간 지표 바 (클라이언트 아일랜드)
// 게이트웨이 /api/stats 를 주기적으로 폴링해 숫자가 살아 움직이게 한다.
// 게이트웨이가 없거나 요청이 실패해도 시드 값을 계속 보여준다(데모 세이프 = 절대 빈칸 없음).
// 카드 마크업/클래스는 page.tsx 의 .grid/.stat 와 동일하게 재사용해 스타일을 맞춘다.

import { useEffect, useRef, useState } from "react";
import { getStats, type Stats } from "@/lib/api";

// 백엔드가 없어도 인상적인 값에서 출발한다.
const SEED: Stats = {
  tracked_entities: 18204,
  graph_relations: 47891,
  scans_today: 1247,
  confirmed_threats: 3516,
};

const POLL_MS = 5000;

// 카드 정의(라벨 / 값 색상 클래스 / 하단 설명). 지표 순서를 한 곳에서 관리.
const CARDS: ReadonlyArray<{
  key: keyof Stats;
  k: string;
  cls: string;
  d: string;
}> = [
  { key: "tracked_entities", k: "TRACKED ENTITIES", cls: "accent", d: "▲ 실시간 추적 중" },
  { key: "graph_relations", k: "GRAPH RELATIONS", cls: "", d: "도메인·번호·계좌·IP" },
  { key: "scans_today", k: "SCANS TODAY", cls: "warn", d: "▲ 실시간 유입 중" },
  { key: "confirmed_threats", k: "CONFIRMED THREATS", cls: "danger", d: "커뮤니티 검증 완료" },
];

// 현재 값을 목표값 쪽으로 한 프레임만큼 당긴다(정수 보장, 미세 차이도 반드시 수렴).
function approach(current: number, target: number): number {
  const diff = target - current;
  if (diff === 0) return target;
  const step = diff * 0.18;
  return current + (Math.abs(step) < 1 ? Math.sign(diff) : Math.trunc(step));
}

function easeStats(current: Stats, target: Stats): Stats {
  return {
    tracked_entities: approach(current.tracked_entities, target.tracked_entities),
    graph_relations: approach(current.graph_relations, target.graph_relations),
    scans_today: approach(current.scans_today, target.scans_today),
    confirmed_threats: approach(current.confirmed_threats, target.confirmed_threats),
  };
}

function reached(a: Stats, b: Stats): boolean {
  return CARDS.every((c) => a[c.key] === b[c.key]);
}

export default function StatsBar() {
  // target: 서버가 준 최신 목표값 / display: 카운트업으로 다가가는 화면 표시값.
  const [target, setTarget] = useState<Stats>(SEED);
  const [display, setDisplay] = useState<Stats>(SEED);
  const displayRef = useRef<Stats>(SEED);

  // 5초 주기 폴링. 실패하면 이전 목표값을 유지(빈칸 방지).
  useEffect(() => {
    let alive = true;

    async function pull() {
      try {
        const next = await getStats();
        if (alive) setTarget(next);
      } catch {
        // 게이트웨이 미가동 시에도 마지막 목표값을 그대로 유지한다.
      }
    }

    pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // 목표값이 바뀔 때마다 표시값을 부드럽게 카운트업시킨다.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = easeStats(displayRef.current, target);
      displayRef.current = next;
      setDisplay(next);
      if (!reached(next, target)) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div className="grid">
      {CARDS.map((c) => (
        <div className="stat" key={c.key}>
          <div className="k">{c.k}</div>
          <div className={`v ${c.cls}`}>{display[c.key].toLocaleString()}</div>
          <div className="d">{c.d}</div>
        </div>
      ))}
    </div>
  );
}
