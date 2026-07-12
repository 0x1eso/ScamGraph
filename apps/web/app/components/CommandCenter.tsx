"use client";

// ScamGraph — 관제 센터 (클라이언트 아일랜드)
// 스캔 콘솔 · 관계망 그래프 · 실시간 피드 · 위협 지도를 한데 배선한다.
// 스캔 성공 → 대상 노드를 그래프에 추가(킬샷). 스캔 이벤트는 게이트웨이가 WS로도
// 브로드캐스트하므로 LiveFeed에 자동 반영된다.
// Sigma/deck.gl은 브라우저 전용이라 ssr:false 로 동적 로드한다.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import ScanConsole from "./ScanConsole";
import LiveFeed from "./LiveFeed";
import AttributionCard from "./AttributionCard";
import ActionGuide from "./ActionGuide";
import ReportModal from "./ReportModal";
import { expand, getGraph, type ScanResult } from "@/lib/api";
import {
  mockGraph,
  type GraphData,
  type GraphNode,
  type GraphEdge,
} from "@/app/data/mockGraph";

const panelLoading = (label: string) => (
  <div
    role="status"
    aria-live="polite"
    className="skeleton-shimmer"
    style={{
      height: 520,
      borderRadius: 14,
      border: "1px solid var(--line)",
      background: "var(--bg-elev, #0c1018)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--mono)",
      fontSize: 12,
      color: "var(--text-mute)",
    }}
  >
    {label}
  </div>
);

const GraphExplorer = dynamic(() => import("./GraphExplorer"), {
  ssr: false,
  loading: () => panelLoading("관계망 렌더링 준비 중…"),
});

// 사건 파일 도시에는 오버레이라 뷰포트 진입 전까지 로드할 필요 없음 → 동적 로드.
const CampaignCaseFile = dynamic(() => import("./CampaignCaseFile"), { ssr: false });

const ThreatMap = dynamic(() => import("./ThreatMap"), {
  ssr: false,
  loading: () => panelLoading("위협 지도 렌더링 준비 중…"),
});

// 스캔 결과를 그래프 노드로 변환.
function nodeFromScan(result: ScanResult): GraphNode {
  const type: GraphNode["type"] =
    result.kind === "phone" ? "Phone" : result.kind === "account" ? "Account" : "Target";
  return {
    id: result.target,
    label: result.target,
    type,
    grade: result.grade,
    risk_score: result.risk_score,
  };
}

// 노드/간선을 id 기준으로 중복 없이 병합.
function mergeGraph(base: GraphData, add: GraphData): GraphData {
  const nodes: GraphNode[] = [...base.nodes];
  const seenNodes = new Set(nodes.map((n) => n.id));
  for (const node of add.nodes) {
    if (!seenNodes.has(node.id)) {
      seenNodes.add(node.id);
      nodes.push(node);
    }
  }

  const edges: GraphEdge[] = [...base.edges];
  const seenEdges = new Set(edges.map((e) => `${e.source}|${e.target}|${e.type}`));
  for (const edge of add.edges) {
    const key = `${edge.source}|${edge.target}|${edge.type}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      edges.push(edge);
    }
  }

  return { nodes, edges };
}

export default function CommandCenter() {
  const [graphData, setGraphData] = useState<GraphData>(mockGraph);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  // 그래프 노드에서 "사건 파일 열기" → 이 값으로 조직 도시에 오버레이를 띄운다.
  const [caseFileValue, setCaseFileValue] = useState<string | null>(null);

  // 마운트 시 실 관계망(Neo4j)을 불러와 교체한다. 실패하면 시드 mockGraph 유지(데모 세이프).
  useEffect(() => {
    let alive = true;
    getGraph()
      .then((live) => {
        // nodes·edges가 모두 배열일 때만 교체 — edges 누락 응답이면 GraphExplorer의
        // data.edges.forEach가 터져 아일랜드가 붕괴하므로, 그 경우 mockGraph를 유지한다(데모 세이프).
        if (
          alive &&
          live &&
          Array.isArray(live.nodes) &&
          live.nodes.length > 0 &&
          Array.isArray(live.edges)
        ) {
          setGraphData(live);
        }
      })
      .catch(() => {
        /* 게이트웨이 미가동 → mockGraph 유지 */
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleResult(result: ScanResult) {
    setLastScan(result);
    // 항상 스캔한 대상 노드를 추가(백엔드가 없어도 그래프가 자란다 = 데모 세이프).
    const own: GraphData = { nodes: [nodeFromScan(result)], edges: [] };
    let addition: GraphData = own;

    try {
      const neighbors = await expand(result.target);
      addition = mergeGraph(own, neighbors);
    } catch {
      // 게이트웨이 미가동 시에도 대상 노드만은 그래프에 등장시킨다.
    }

    setGraphData((prev) => mergeGraph(prev, addition));
  }

  return (
    <>
      <ScanConsole onResult={handleResult} />

      {lastScan && <ActionGuide kind={lastScan.kind} grade={lastScan.grade} />}
      <AttributionCard target={lastScan?.target ?? null} />
      {lastScan && <ReportModal target={lastScan.target} kind={lastScan.kind} />}

      <div className="section-label">
        // 사기 인프라 관계망 · {graphData.nodes.length} 노드 · {graphData.edges.length} 관계
      </div>

      <div className="cc-split">
        <div className="cc-graph">
          <GraphExplorer
            data={graphData}
            focusId={lastScan?.target}
            onOpenCaseFile={setCaseFileValue}
          />
        </div>
        <div className="cc-feed">
          <LiveFeed />
        </div>
      </div>

      <div className="section-label">// 실시간 위협 지도</div>
      <ThreatMap />

      {caseFileValue && (
        <CampaignCaseFile value={caseFileValue} onClose={() => setCaseFileValue(null)} />
      )}

      <style>{CC_CSS}</style>
    </>
  );
}

const CC_CSS = `
.cc-split {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}
.cc-graph, .cc-feed { min-width: 0; }
@media (max-width: 900px) {
  .cc-split { grid-template-columns: 1fr; }
}
`;
