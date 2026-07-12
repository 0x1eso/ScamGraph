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
  danger: "#d92d43",
  warning: "#d97706",
  caution: "#ca8a04",
  safe: "#0d9f6e",
};

// 등급이 없는 노드는 타입별 중립색 — 흰 배경에서도 또렷하게 대비
const TYPE_COLORS: Record<GraphNode["type"], string> = {
  IP: "#2563eb",
  Host: "#475569",
  Campaign: "#7c3aed",
  Phone: "#0891b2",
  Account: "#0d9f6e",
  Report: "#64748b",
  Target: "#475569",
};

// HOSTED_ON 은 공유 IP로 이어지는 결정적 단서 → 인디고 액센트로 강조.
// 나머지 간선은 연한 회색으로 물러나 노드가 도드라지게 한다.
const EDGE_COLORS: Record<string, string> = {
  HOSTED_ON: "#4f46e5",
  USES: "#cbd5e1",
  RESOLVES_TO: "#cbd5e1",
  CONTACT: "#cbd5e1",
  PAYOUT: "#cbd5e1",
  REPORTS: "#cbd5e1",
};

const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';
const DIM_COLOR = "#d3d8e0";

function colorForNode(node: GraphNode): string {
  if (node.grade) return GRADE_COLORS[node.grade];
  // Registrant/Cert 등 신규 타입은 회색 폴백
  return TYPE_COLORS[node.type] ?? "#94a3b8";
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
  // 방금 스캔한 대상 id — 그래프에서 카메라 포커스 + 펄스로 킬샷을 연출한다.
  focusId?: string;
  // 노드에서 "사건 파일"을 열 때 호출(선택) — 조직 전체 인프라 도시에로 이어진다.
  onOpenCaseFile?: (value: string) => void;
}

export default function GraphExplorer({ data = mockGraph, focusId, onOpenCaseFile }: GraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  // 킬샷 연출용 — 빌드 이펙트에서 채우고, 포커스 이펙트가 재사용(재빌드 없이).
  const rendererRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const focusIdRef = useRef<string | null>(null);
  const pulseRef = useRef(1);

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
        color: EDGE_COLORS[edge.type] ?? "#cbd5e1",
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
      labelColor: { color: "#0e1526" },
      labelSize: 12,
      labelFont: MONO,
      edgeLabelColor: { color: "#64748b" },
      edgeLabelSize: 10,
      edgeLabelFont: MONO,
      defaultEdgeColor: "#dbe0e6",
      minCameraRatio: 0.4,
      maxCameraRatio: 3,
    });
    rendererRef.current = renderer;
    graphRef.current = graph;

    // hover 포커스: 이웃이 아닌 노드/간선은 흐리게 처리해 관계에 집중시킨다.
    let hovered: string | null = null;

    renderer.setSetting("nodeReducer", (node, attrs) => {
      let a = attrs;
      if (hovered && node !== hovered && !graph.areNeighbors(hovered, node)) {
        a = { ...a, color: DIM_COLOR, label: "" };
      }
      // 킬샷: 방금 스캔한 노드를 밝게 키우고 펄스 배율을 적용.
      if (focusIdRef.current && node === focusIdRef.current) {
        a = {
          ...a,
          color: "#4f46e5",
          size: (attrs.size ?? 7) * pulseRef.current,
          zIndex: 10,
          forceLabel: true,
        };
      }
      return a;
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
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (graphRef.current === graph) graphRef.current = null;
    };
  }, [data]);

  // ── 킬샷 연출 ── 방금 스캔한 노드로 카메라가 날아가고 노드가 펄스한다.
  // 그래프를 재빌드하지 않고 rendererRef 를 재사용한다. reduced-motion 이면 모션 생략.
  useEffect(() => {
    focusIdRef.current = focusId ?? null;
    const renderer = rendererRef.current;
    const graph = graphRef.current;
    if (!focusId || !renderer || !graph || !graph.hasNode(focusId)) {
      return;
    }
    if (reduceMotion) {
      renderer.refresh();
      return;
    }

    const pos = renderer.getNodeDisplayData(focusId);
    if (pos) {
      renderer.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.45 }, { duration: 700 });
    }

    let raf = 0;
    const start = performance.now();
    const DURATION = 1500;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / DURATION);
      // 3회 감쇠 펄스
      pulseRef.current = 1 + Math.sin(p * Math.PI * 3) * (1 - p) * 0.9;
      renderer.refresh();
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        pulseRef.current = 1;
        renderer.refresh();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      pulseRef.current = 1;
    };
  }, [focusId, reduceMotion]);

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
        role="img"
        aria-label={`사기 인프라 관계망 시각화 — 노드 ${data.nodes.length}개와 관계 ${data.edges.length}개로 이뤄진 위협 네트워크. 캠페인·공유 IP를 축으로 위험 대상들이 연결됩니다.`}
        style={{
          width: "100%",
          height: 520,
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "var(--bg-elev, #fafbfc)",
          overflow: "hidden",
        }}
      />

      <Legend />

      <AnimatePresence>
        {selected && (
          <NodePanel
            key={selected.id}
            node={selected}
            onClose={() => setSelectedId(null)}
            onOpenCaseFile={onOpenCaseFile}
          />
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

// ── 노드 상세 패널 ── 클릭한 노드의 타입·등급·위험점수를 보여준다
function NodePanel({
  node,
  onClose,
  onOpenCaseFile,
}: {
  node: GraphNode;
  onClose: () => void;
  onOpenCaseFile?: (value: string) => void;
}) {
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
        border: "1px solid var(--line, #e4e7ec)",
        borderLeft: `3px solid ${accent}`,
        background: "var(--bg-card, #ffffff)",
        boxShadow: "0 2px 6px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(16, 24, 40, 0.10)",
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
            color: "var(--text-mute, #5b6577)",
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
          color: "var(--text, #0e1526)",
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
            <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--text-dim, #475069)" }}>
              risk {node.risk_score}
            </span>
          )}
        </div>
      )}

      {typeof node.risk_score === "number" && (
        <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: "var(--line, #eef0f4)", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, node.risk_score))}%`,
              height: "100%",
              background: accent,
            }}
          />
        </div>
      )}

      {/* 킬샷의 결말 — 이 노드가 속한 조직의 전체 인프라를 사건 파일로 복원 */}
      {onOpenCaseFile && (
        <button
          onClick={() => onOpenCaseFile(node.label)}
          className="gx-casefile-btn"
          style={{
            marginTop: 14,
            width: "100%",
            padding: "9px 12px",
            borderRadius: 9,
            border: "1px solid var(--danger, #d92d43)",
            background: "rgba(217, 45, 67, 0.1)",
            color: "var(--danger, #d92d43)",
            fontFamily: MONO,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            cursor: "pointer",
            transition: "background 0.16s ease, transform 0.16s ease",
          }}
        >
          ◆ 사건 파일 열기
        </button>
      )}
    </motion.div>
  );
}
