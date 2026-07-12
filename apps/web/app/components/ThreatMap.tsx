"use client";

// ScamGraph — 실시간 위협 지도 (deck.gl · GPU 렌더링)
// 사기 인프라의 지리적 출발점을 점으로, 공격 궤적을 타깃(서울)으로 수렴하는
// 호(arc)로 그린다. 외부 타일/베이스맵 없이 밝은 컨테이너 위에 레이어만 얹어
// 오프라인에서도 동작한다. 색은 장식이 아니라 위험 등급의 의미로 쓴다.

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import DeckGL from "deck.gl";
import { ScatterplotLayer, ArcLayer } from "@deck.gl/layers";
import { MapView, type PickingInfo } from "@deck.gl/core";
import { mockThreats, TARGET_CENTER, type Threat } from "@/app/data/mockThreats";

// 등급 → RGB. GraphExplorer 팔레트와 동일한 의미 색.
const GRADE_RGB: Record<Threat["grade"], [number, number, number]> = {
  danger: [217, 45, 67],
  warning: [217, 119, 6],
  caution: [202, 138, 4],
  safe: [13, 159, 110],
};
const ACCENT_RGB: [number, number, number] = [79, 70, 229]; // --accent(인디고), 타깃 색

const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';

const rgb = (c: readonly [number, number, number]): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const withAlpha = (
  c: readonly [number, number, number],
  a: number,
): [number, number, number, number] => [c[0], c[1], c[2], a];

// 동아시아 중심, 살짝 기울여 호의 높이가 보이도록.
const INITIAL_VIEW_STATE = {
  longitude: 128,
  latitude: 34,
  zoom: 2.2,
  pitch: 30,
  bearing: 0,
};

// ── 애니메이션 파라미터 (GPU/compositor 레벨; 의도적으로 은은하게) ──
// 값을 만졌을 때 깜빡임이 과해지지 않도록 depth는 낮게 유지한다.
const ORIGIN_PULSE_SPEED = 2.1; // rad/s — 출발점 반지름 맥동 속도
const ORIGIN_PULSE_DEPTH = 0.22; // 반지름 ±22%
const ORIGIN_FILL_BASE = 150; // 채움 알파 기준(정적값과 동일)
const ORIGIN_FILL_DEPTH = 70; // 채움 알파 맥동 폭
const ARC_WAVE_SPEED = 2.4; // rad/s — 호 밝기 파동 속도
const ARC_WAVE_DENSITY = 0.5; // 거리→위상 계수 (서울로 수렴하는 파동)
const ARC_WIDTH_DEPTH = 0.7; // 호 굵기 ±70%
const ARC_ALPHA_DIP = 150; // 파동 골에서 어두워지는 알파 폭
const GLOW_PULSE_SPEED = 1.5; // rad/s — 타깃 헤일로 호흡 속도
const GLOW_PULSE_DEPTH = 0.16; // 헤일로 ±16%

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

// 점마다 다른 위상(좌표 시드) → 일제히 깜빡이지 않고 어른거린다.
const originWave = (t: Threat, phase: number): number =>
  Math.sin(phase * ORIGIN_PULSE_SPEED + t.lng * 0.03 + t.lat * 0.05);

// 서울(타깃)로부터의 거리로 위상을 밀어, 밝기 파동이 안쪽(서울)으로 흐르게 한다.
const arcWave = (t: Threat, phase: number): number => {
  const d = Math.hypot(t.lng - TARGET_CENTER.lng, t.lat - TARGET_CENTER.lat);
  return Math.sin(phase * ARC_WAVE_SPEED - d * ARC_WAVE_DENSITY);
};

// 파동 골(-1)에서 가장 어둡고, 마루(+1)에서 완전 불투명(255).
// a=0(정적)이면 항상 255 → 원본 호 색과 동일.
const arcAlpha = (t: Threat, phase: number, a: number): number =>
  clamp255(255 - ARC_ALPHA_DIP * (0.5 - 0.5 * arcWave(t, phase)) * a);

export default function ThreatMap() {
  // ssr:false 로 dynamic import 되지만, WebGL 캔버스는 마운트 이후에만 붙인다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 모션 최소화 사용자는 정적 레이어로(라이브 펄스/웨이브 없음).
  const reduceMotion = useReducedMotion();

  // requestAnimationFrame 위상(초). 각 accessor의 sine 펄스를 구동한다.
  // reduceMotion이면 루프를 돌리지 않아 phase가 0으로 고정 → 원본 정적 레이어와 동일.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!mounted || reduceMotion) {
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setPhase((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mounted, reduceMotion]);

  const layers = useMemo(() => {
    // 애니메이션 게이트. 0이면 모든 펄스 항이 사라져 원본 정적 레이어와 동일해진다.
    const a = reduceMotion ? 0 : 1;

    return [
      // 공격 궤적 — 출발점에서 타깃(서울)으로 수렴하는 대권 호.
      // 밝기·굵기가 서울로 수렴하는 동심 파동으로 흘러 "위협이 흐르는" 느낌을 준다.
      new ArcLayer<Threat>({
        id: "attacks",
        data: mockThreats,
        greatCircle: true,
        getSourcePosition: (t) => [t.lng, t.lat],
        getTargetPosition: () => [TARGET_CENTER.lng, TARGET_CENTER.lat],
        getSourceColor: (t) => withAlpha(GRADE_RGB[t.grade], arcAlpha(t, phase, a)),
        getTargetColor: (t) => withAlpha(ACCENT_RGB, arcAlpha(t, phase, a)),
        getWidth: (t) => Math.max(1, t.risk / 30) * (1 + ARC_WIDTH_DEPTH * arcWave(t, phase) * a),
        widthMinPixels: 1,
        pickable: true,
        updateTriggers: {
          getSourceColor: phase,
          getTargetColor: phase,
          getWidth: phase,
        },
      }),

      // 출발점 — 위험도가 클수록 큰 점. 반지름·채움 알파가 점마다 다른 위상으로 은은히 맥동.
      new ScatterplotLayer<Threat>({
        id: "origins",
        data: mockThreats,
        radiusUnits: "pixels",
        getPosition: (t) => [t.lng, t.lat],
        getRadius: (t) => (5 + (t.risk / 100) * 16) * (1 + ORIGIN_PULSE_DEPTH * originWave(t, phase) * a),
        radiusMinPixels: 4,
        radiusMaxPixels: 24,
        getFillColor: (t) =>
          withAlpha(
            GRADE_RGB[t.grade],
            clamp255(ORIGIN_FILL_BASE + ORIGIN_FILL_DEPTH * (0.5 + 0.5 * originWave(t, phase)) * a),
          ),
        stroked: true,
        lineWidthMinPixels: 1.5,
        getLineColor: (t) => withAlpha(GRADE_RGB[t.grade], 235),
        pickable: true,
        updateTriggers: {
          getRadius: phase,
          getFillColor: phase,
        },
      }),

      // 타깃 글로우 — 넓고 옅은 헤일로가 천천히 숨쉬며 깊이감을 준다.
      new ScatterplotLayer<{ lng: number; lat: number }>({
        id: "target-glow",
        data: [TARGET_CENTER],
        radiusUnits: "pixels",
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 26 * (1 + GLOW_PULSE_DEPTH * Math.sin(phase * GLOW_PULSE_SPEED) * a),
        getFillColor: withAlpha(ACCENT_RGB, 45),
        updateTriggers: { getRadius: phase },
      }),

      // 타깃 코어 — 서울. 액센트 실선(정적 앵커).
      new ScatterplotLayer<{ lng: number; lat: number }>({
        id: "target-core",
        data: [TARGET_CENTER],
        radiusUnits: "pixels",
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 7,
        getFillColor: withAlpha(ACCENT_RGB, 235),
        stroked: true,
        lineWidthMinPixels: 2,
        getLineColor: [255, 255, 255, 220],
      }),
    ];
  }, [phase, reduceMotion]);

  return (
    <div
      role="img"
      aria-label="실시간 위협 지도 — 사기 인프라의 지리적 출발점을 위험 등급 색(위험·경고·주의)의 점으로, 서울 타깃으로 수렴하는 공격 궤적을 호로 표시합니다."
      style={{
        position: "relative",
        width: "100%",
        height: 520,
        borderRadius: 14,
        border: "1px solid var(--line, #e4e7ec)",
        background: "var(--bg, #f4f5f8)",
        overflow: "hidden",
      }}
    >
      {mounted && (
        <DeckGL
          views={[new MapView({ id: "map", repeat: true })]}
          initialViewState={{ map: INITIAL_VIEW_STATE }}
          controller={true}
          layers={layers}
          getTooltip={renderTooltip}
          style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }}
        />
      )}

      <TitleChip />
      <GovBadge />
      <Legend />
    </div>
  );
}

// hover 툴팁 — 라벨과 위험도. 목 데이터라 사용자 입력이 아니므로 안전하다.
function renderTooltip(info: PickingInfo) {
  const object = info.object as Threat | undefined;
  if (!object || typeof object.risk !== "number") return null;
  return {
    html: `<b>${object.label}</b><br/>risk ${object.risk} · ${object.grade}`,
    style: {
      background: "#ffffff",
      color: "#0e1526",
      border: "1px solid #e4e7ec",
      borderRadius: "8px",
      padding: "8px 10px",
      boxShadow: "0 2px 6px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(16, 24, 40, 0.10)",
      fontFamily: MONO,
      fontSize: "11px",
    },
  };
}

// ── 제목 칩 ── 좌상단, 콘솔 헤더 톤을 재사용
function TitleChip() {
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 10,
        border: "1px solid var(--line, #e4e7ec)",
        background: "var(--bg-card, #ffffff)",
        boxShadow: "0 2px 6px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(16, 24, 40, 0.06)",
        fontFamily: MONO,
        fontSize: 12,
        letterSpacing: 1,
        color: "var(--accent, #4f46e5)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--accent-2, #0d9f6e)",
          boxShadow: "0 0 8px rgba(13, 159, 110, 0.45)",
        }}
      />
      {"// 실시간 위협 지도"}
    </div>
  );
}

// ── 정부 데이터 배지 ── 우상단. 경찰청 등 정부 데이터가 포함됨을 알린다(정적).
function GovBadge() {
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 12px",
        borderRadius: 10,
        border: "1px solid var(--line, #e4e7ec)",
        background: "var(--bg-card, #ffffff)",
        boxShadow: "0 2px 6px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(16, 24, 40, 0.06)",
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: 0.5,
        color: "var(--text-dim, #475069)",
      }}
    >
      <span style={{ color: "var(--accent, #4f46e5)" }} aria-hidden="true">
        ◆
      </span>
      정부 데이터 · 경찰청
    </div>
  );
}

// ── 범례 ── 등급 색 + 수렴 타깃. 색을 의미로 설명한다.
function Legend() {
  const items: Array<{ color: string; label: string }> = [
    { color: rgb(GRADE_RGB.danger), label: "위험" },
    { color: rgb(GRADE_RGB.warning), label: "경고" },
    { color: rgb(GRADE_RGB.caution), label: "주의" },
    { color: rgb(ACCENT_RGB), label: "타깃 · 서울" },
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        bottom: 14,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid var(--line, #e4e7ec)",
        background: "var(--bg-card, #ffffff)",
        boxShadow: "0 2px 6px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(16, 24, 40, 0.06)",
        fontFamily: MONO,
        fontSize: 11,
        color: "var(--text-dim, #475069)",
      }}
    >
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: it.color,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
