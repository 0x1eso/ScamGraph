"use client";

// ScamGraph — 관계망 탐색기 (Sigma.js)
// 목 데이터로 사기 인프라 네트워크를 렌더링한다. 백엔드에 의존하지 않는다.
// 상호작용: 휠 줌 / 드래그 팬 / 노드 hover 시 이웃만 강조 / 노드 클릭 시 상세 패널.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { mockGraph, type GraphData, type GraphNode } from "@/app/data/mockGraph";

// 등급 색 — page 디자인 토큰과 동일 팔레트
const GRADE_COLORS: Record<NonNullable<GraphNode["grade"]>, string> = {
  danger: "#ff4d6d",
  warning: "#ffb020",
  caution: "#c0cf3d",
  safe: "#7cf03d",
};

// 등급이 없는 노드는 타입별 중립색
const TYPE_COLORS: Record<GraphNode["type"], string> = {
  IP: "#4aa3ff",
  Host: "#8a97ad",
  Campaign: "#c58cff",
  Phone: "#00e5c0",
  Account: "#7cf03d",
  Report: "#566072",
  Target: "#8a97ad",
};

// HOSTED_ON 은 공유 IP로 이어지는 결정적 단서 → 액센트로 강조
const EDGE_COLORS: Record<string, string> = {
  HOSTED_ON: "#00e5c0",
  USES: "#33405c",
  RESOLVES_TO: "#2a3348",
  CONTACT: "#2a3348",
  PAYOUT: "#2a3348",
  REPORTS: "#2a3348",
};

const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';
const DIM_COLOR = "#20283a";

function colorForNode(node: GraphNode): string {
  if (node.grade) return GRADE_COLORS[node.grade];
  // Registrant/Cert 등 신규 타입은 회색 폴백
  return TYPE_COLORS[node.type] ?? "#5a6478";
}

// 캠페인·공유 IP·타깃을 허브로 크게, 나머지는 작게
function sizeForType(type: GraphNode["type"]): number {
  switch (type) {
    case "Campaign":
      return 18;
    case "IP":
      return 15;
    case "Target":
      return 12;
    default:
      return 7;
  }
}

export interface GraphExplorerProps {
  data?: GraphData;
}

export default function GraphExplorer({ data = mockGraph }: GraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of data.nodes) map.set(node.id, node);
    return map;
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return; // SSR / 언마운트 가드

    const graph = new Graph();

    // 결정적 초기 배치: index 기반 원형 좌표 (Math.random 미사용).
    // forceAtlas2 가 이 초기값에서 안정적으로 레이아웃을 잡는다.
    const total = data.nodes.length;
    data.nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / total;
      graph.addNode(node.id, {
        label: node.label,
        x: Math.cos(angle),
        y: Math.sin(angle),
        size: sizeForType(node.type),
        color: colorForNode(node),
      });
    });

    // mergeEdge 로 우발적 평행간선에도 안전하게. 관계명은 label 로 저장
    // (Sigma 는 "type" 속성을 간선 렌더러 이름으로 쓰므로 그 키는 피한다).
    data.edges.forEach((edge) => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      graph.mergeEdge(edge.source, edge.target, {
        label: edge.type,
        color: EDGE_COLORS[edge.type] ?? "#2a3348",
        size: edge.type === "HOSTED_ON" ? 2.4 : 1,
      });
    });

    forceAtlas2.assign(graph, {
      iterations: 300,
      settings: {
        gravity: 0.9,
        scalingRatio: 12,
        slowDown: 2,
        adjustSizes: true,
        barnesHutOptimize: false,
      },
    });

    const renderer = new Sigma(graph, container, {
      renderLabels: true,
      renderEdgeLabels: true,
      labelColor: { color: "#c7d0de" },
      labelSize: 12,
      labelFont: MONO,
      edgeLabelColor: { color: "#566072" },
      edgeLabelSize: 10,
      edgeLabelFont: MONO,
      defaultEdgeColor: "#242c3e",
      minCameraRatio: 0.4,
      maxCameraRatio: 3,
    });

    // hover 포커스: 이웃이 아닌 노드/간선은 흐리게 처리해 관계에 집중시킨다.
    let hovered: string | null = null;

    renderer.setSetting("nodeReducer", (node, attrs) => {
      if (hovered && node !== hovered && !graph.areNeighbors(hovered, node)) {
        return { ...attrs, color: DIM_COLOR, label: "" };
      }
      return attrs;
    });

    renderer.setSetting("edgeReducer", (edge, attrs) => {
      if (hovered && !graph.extremities(edge).includes(hovered)) {
        return { ...attrs, hidden: true };
      }
      return attrs;
    });

    renderer.on("enterNode", ({ node }) => {
      hovered = node;
      container.style.cursor = "pointer";
      renderer.refresh();
    });
    renderer.on("leaveNode", () => {
      hovered = null;
      container.style.cursor = "default";
      renderer.refresh();
    });
    renderer.on("clickNode", ({ node }) => setSelectedId(node));
    renderer.on("clickStage", () => setSelectedId(null));

    return () => {
      renderer.kill();
    };
  }, [data]);

  const selected = selectedId ? nodeMap.get(selectedId) ?? null : null;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: "relative" }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 520,
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "var(--bg-elev, #0c1018)",
          overflow: "hidden",
        }}
      />

      <Legend />

      <AnimatePresence>
        {selected && (
          <NodePanel key={selected.id} node={selected} onClose={() => setSelectedId(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── 범례 ── 등급 색과 공유-IP 단서를 설명 (색을 장식이 아닌 의미로 사용)
function Legend() {
  const items: Array<{ color: string; label: string }> = [
    { color: GRADE_COLORS.danger, label: "위험 타깃" },
    { color: TYPE_COLORS.Campaign, label: "캠페인" },
    { color: TYPE_COLORS.IP, label: "공유 IP" },
    { color: EDGE_COLORS.HOSTED_ON, label: "HOSTED_ON 연결" },
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
        border: "1px solid var(--line)",
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
              boxShadow: `0 0 8px ${it.color}66`,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── 노드 상세 패널 ── 클릭한 노드의 타입·등급·위험점수를 보여준다
function NodePanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const accent = node.grade ? GRADE_COLORS[node.grade] : TYPE_COLORS[node.type];
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        width: 248,
        padding: 16,
        borderRadius: 12,
        border: "1px solid var(--line)",
        borderLeft: `3px solid ${accent}`,
        background: "rgba(12, 16, 24, 0.92)",
        backdropFilter: "blur(10px)",
        fontFamily: "var(--sans, system-ui)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: accent, textTransform: "uppercase" }}>
          {node.type}
        </span>
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-mute, #566072)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text, #e7ecf4)",
          wordBreak: "break-all",
        }}
      >
        {node.label}
      </div>

      {node.grade && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 6,
              border: `1px solid ${accent}`,
              color: accent,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {node.grade}
          </span>
          {typeof node.risk_score === "number" && (
            <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-dim, #8a97ad)" }}>
              risk {node.risk_score}
            </span>
          )}
        </div>
      )}

      {typeof node.risk_score === "number" && (
        <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: "var(--line, #1b2231)", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, node.risk_score))}%`,
              height: "100%",
              background: accent,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}
