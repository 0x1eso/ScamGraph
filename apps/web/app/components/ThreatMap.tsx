"use client";

// ScamGraph — 실시간 위협 지도 (deck.gl · GPU 렌더링)
// 사기 인프라의 지리적 출발점을 점으로, 공격 궤적을 타깃(서울)으로 수렴하는
// 호(arc)로 그린다. 외부 타일/베이스맵 없이 다크 컨테이너 위에 레이어만 얹어
// 오프라인에서도 동작한다. 색은 장식이 아니라 위험 등급의 의미로 쓴다.

import { useEffect, useMemo, useState } from "react";
import DeckGL from "deck.gl";
import { ScatterplotLayer, ArcLayer } from "@deck.gl/layers";
import { MapView, type PickingInfo } from "@deck.gl/core";
import { mockThreats, TARGET_CENTER, type Threat } from "@/app/data/mockThreats";

// 등급 → RGB. GraphExplorer 팔레트와 동일한 의미 색.
const GRADE_RGB: Record<Threat["grade"], [number, number, number]> = {
  danger: [255, 77, 109],
  warning: [255, 176, 32],
  caution: [192, 207, 61],
  safe: [124, 240, 61],
};
const ACCENT_RGB: [number, number, number] = [0, 229, 192]; // --accent, 타깃 색

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

export default function ThreatMap() {
  // ssr:false 로 dynamic import 되지만, WebGL 캔버스는 마운트 이후에만 붙인다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const layers = useMemo(
    () => [
      // 공격 궤적 — 출발점에서 타깃(서울)으로 수렴하는 대권 호
      new ArcLayer<Threat>({
        id: "attacks",
        data: mockThreats,
        greatCircle: true,
        getSourcePosition: (t) => [t.lng, t.lat],
        getTargetPosition: () => [TARGET_CENTER.lng, TARGET_CENTER.lat],
        getSourceColor: (t) => GRADE_RGB[t.grade],
        getTargetColor: () => ACCENT_RGB,
        getWidth: (t) => Math.max(1, t.risk / 30),
        widthMinPixels: 1,
        pickable: true,
      }),

      // 출발점 — 위험도가 클수록 큰 점. 반투명 채움 + 등급색 테두리로 링 효과.
      new ScatterplotLayer<Threat>({
        id: "origins",
        data: mockThreats,
        radiusUnits: "pixels",
        getPosition: (t) => [t.lng, t.lat],
        getRadius: (t) => 5 + (t.risk / 100) * 16,
        radiusMinPixels: 4,
        radiusMaxPixels: 24,
        getFillColor: (t) => withAlpha(GRADE_RGB[t.grade], 150),
        stroked: true,
        lineWidthMinPixels: 1.5,
        getLineColor: (t) => withAlpha(GRADE_RGB[t.grade], 235),
        pickable: true,
      }),

      // 타깃 글로우 — 넓고 옅은 헤일로로 깊이감을 준다.
      new ScatterplotLayer<{ lng: number; lat: number }>({
        id: "target-glow",
        data: [TARGET_CENTER],
        radiusUnits: "pixels",
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 26,
        getFillColor: withAlpha(ACCENT_RGB, 45),
      }),

      // 타깃 코어 — 서울. 액센트 실선.
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
    ],
    [],
  );

  return (
    <div
      role="img"
      aria-label="실시간 위협 지도 — 사기 인프라의 지리적 출발점을 위험 등급 색(위험·경고·주의)의 점으로, 서울 타깃으로 수렴하는 공격 궤적을 호로 표시합니다."
      style={{
        position: "relative",
        width: "100%",
        height: 520,
        borderRadius: 14,
        border: "1px solid var(--line, #1b2231)",
        background: "var(--bg-elev, #0c1018)",
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
      background: "rgba(12, 16, 24, 0.94)",
      color: "#e7ecf4",
      border: "1px solid #1b2231",
      borderRadius: "8px",
      padding: "8px 10px",
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
        border: "1px solid var(--line, #1b2231)",
        background: "rgba(8, 11, 17, 0.72)",
        backdropFilter: "blur(8px)",
        fontFamily: MONO,
        fontSize: 12,
        letterSpacing: 1,
        color: "var(--accent, #00e5c0)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--accent-2, #7cf03d)",
          boxShadow: "0 0 8px rgba(124, 240, 61, 0.7)",
        }}
      />
      {"// 실시간 위협 지도"}
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
        border: "1px solid var(--line, #1b2231)",
        background: "rgba(8, 11, 17, 0.72)",
        backdropFilter: "blur(8px)",
        fontFamily: MONO,
        fontSize: 11,
        color: "var(--text-dim, #8a97ad)",
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
              boxShadow: `0 0 8px ${it.color}`,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
