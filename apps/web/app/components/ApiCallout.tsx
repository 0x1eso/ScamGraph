"use client";

// ScamGraph — 공개 API 안내 (클라이언트 아일랜드)
// 표시용 curl 은 접속 오리진 기준으로 만든다(도메인이면 도메인, 로컬이면 localhost:8080).
// 링크는 ${GATEWAY} 기준 — 도메인에선 상대경로가 되어 터널이 게이트웨이로 라우팅한다.

import { useEffect, useState } from "react";
import { GATEWAY } from "@/lib/api";

export default function ApiCallout() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setOrigin(GATEWAY || window.location.origin);
  }, []);
  // SSR·최초 렌더는 localhost:8080 로 동일하게 그려 하이드레이션 불일치를 피하고,
  // 마운트 후 실제 오리진(도메인)으로 교체한다.
  const base = origin ?? (GATEWAY || "http://localhost:8080");
  const curl = `curl -X POST ${base}/api/scan -d '{"target":"..."}'`;

  return (
    <div className="api-callout">
      <div className="api-head">
        <span className="api-title">// 공개 API</span>
        <span className="api-badge">REST</span>
      </div>

      <pre className="api-snippet">
        <code>{curl}</code>
      </pre>

      <div className="api-links">
        <a className="api-chip primary" href={`${GATEWAY}/docs`} target="_blank" rel="noopener noreferrer">
          Swagger 문서 ↗
        </a>
        <a className="api-chip" href={`${GATEWAY}/api/graph`} target="_blank" rel="noopener noreferrer">
          /api/graph ↗
        </a>
      </div>

      <style>{API_CSS}</style>
    </div>
  );
}

const API_CSS = `
.api-callout {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 24px;
  background:
    radial-gradient(600px 200px at 90% -20%, rgba(79, 70, 229, 0.07), transparent 60%),
    var(--bg-card);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.api-head { display: flex; align-items: center; gap: 12px; }
.api-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-mute);
}
.api-badge {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 1px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--line);
  color: var(--accent);
}
.api-snippet {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-sunken);
  overflow-x: auto;
}
.api-snippet code {
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre;
}
.api-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.api-chip {
  display: inline-flex;
  align-items: center;
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 9px 16px;
  border-radius: 10px;
  border: 1px solid var(--line);
  color: var(--text-dim);
  text-decoration: none;
  transition: border-color 0.16s ease, color 0.16s ease, transform 0.12s ease, box-shadow 0.2s ease;
}
.api-chip:hover { color: var(--text); border-color: var(--accent); transform: translateY(-1px); }
.api-chip.primary {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}
.api-chip.primary:hover { background: var(--accent-strong); box-shadow: var(--shadow-accent); }
`;
