"use client";

// ScamGraph — 공개 API 홍보 배너 (클라이언트 아일랜드)
// 다른 개발자가 위협 데이터를 조회/스캔할 수 있음을 알리고 Swagger 문서로 안내한다.
// 팔레트 토큰(globals.css)을 재사용하고, 추가 스타일은 스코프드 <style> 블록에 둔다.

import { GATEWAY } from "@/lib/api";

const CURL = `curl -X POST ${GATEWAY}/api/scan -d '{"target":"..."}'`;

export default function ApiCallout() {
  return (
    <div className="api-callout">
      <div className="api-head">
        <span className="api-title">// 공개 API</span>
        <span className="api-badge">REST</span>
      </div>

      <p className="api-lede">
        다른 개발자가 ScamGraph 위협 데이터를 조회할 수 있습니다
      </p>

      <pre className="api-snippet">
        <code>{CURL}</code>
      </pre>

      <div className="api-links">
        <a
          className="api-chip primary"
          href={`${GATEWAY}/docs`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Swagger 문서 ↗
        </a>
        <a
          className="api-chip"
          href={`${GATEWAY}/api/graph`}
          target="_blank"
          rel="noopener noreferrer"
        >
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
    radial-gradient(600px 200px at 90% -20%, rgba(0, 229, 192, 0.1), transparent 60%),
    var(--bg-card);
  position: relative;
  overflow: hidden;
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
.api-lede {
  margin-top: 12px;
  font-size: clamp(1rem, 0.95rem + 0.3vw, 1.15rem);
  color: var(--text);
  font-weight: 600;
}
.api-snippet {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  overflow-x: auto;
}
.api-snippet code {
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--accent-2);
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
  transition: border-color 0.16s ease, color 0.16s ease, transform 0.12s ease;
}
.api-chip:hover { color: var(--text); border-color: var(--accent); transform: translateY(-1px); }
.api-chip.primary {
  background: var(--accent);
  color: #04120f;
  border-color: var(--accent);
}
.api-chip.primary:hover { box-shadow: 0 8px 30px rgba(0, 229, 192, 0.25); }
`;
