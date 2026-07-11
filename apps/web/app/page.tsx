// ScamGraph — 관제 대시보드 랜딩
// 스캔 콘솔·관계망 그래프·실시간 피드·지도는 CommandCenter(클라이언트)에서 배선.
// stat 카드는 StatsBar가 /api/stats 폴링(시드 폴백), 공개 API 홍보는 ApiCallout.

import CommandCenter from "./components/CommandCenter";
import StatsBar from "./components/StatsBar";
import ApiCallout from "./components/ApiCallout";
import SearchBar from "./components/SearchBar";
import WhyScamGraph from "./components/WhyScamGraph";
import DataSourcesPanel from "./components/DataSourcesPanel";
import ThreatTicker from "./components/ThreatTicker";
import Reveal from "./components/Reveal";

const SERVICES = [
  { name: "gateway", label: "API GATEWAY" },
  { name: "engine", label: "SCAN ENGINE" },
  { name: "neo4j", label: "GRAPH DB" },
  { name: "meili", label: "SEARCH" },
  { name: "worker", label: "WORKERS" },
];

const PIPE = [
  { t: "web", s: "Next.js · React", tag: "TS" },
  { t: "gateway", s: "Spring Boot · 가상스레드", tag: "JAVA 21" },
  { t: "engine", s: "FastAPI · 크롤링/규칙", tag: "PYTHON" },
  { t: "worker", s: "Celery · 비동기 적재", tag: "PYTHON" },
  { t: "neo4j", s: "관계망 그래프", tag: "CYPHER" },
  { t: "meilisearch", s: "자체 검색엔진", tag: "SEARCH" },
];

export default function Home() {
  return (
    <main>
      <div className="statusbar">
        <span className="brandmark">
          Scam<b>Graph</b>
        </span>
        <span className="svc">
          <span className="dot" aria-hidden="true" /> SYSTEM ONLINE
        </span>
        <span className="spacer" />
        {SERVICES.map((s) => (
          <span className="svc" key={s.name}>
            <span className="dot" aria-hidden="true" /> {s.label}
          </span>
        ))}
        <a className="svc" href="/admin" style={{ color: "var(--accent)", textDecoration: "none" }}>
          ◆ 관리자
        </a>
      </div>

      {/* 실시간 위협 피드 티커 — 상단 풀블리드 (관제 스트립) */}
      <ThreatTicker />

      <div className="wrap">
        <p className="eyebrow">Threat Intelligence · SDG 16</p>
        <h1 className="hero-title">
          사기의 <span>관계망</span>을<br />
          실시간으로 추적한다
        </h1>
        <p className="lede">
          의심스러운 URL·전화번호·계좌를 넣으면 규칙 엔진과 공개 데이터로 위험을
          분석하고, 사기 인프라의 연결망을 그래프와 지도로 펼쳐 보여줍니다. 블랙박스가
          아닌, 근거를 설명하는 디지털 시민 방어 플랫폼.
        </p>

        <SearchBar />

        <CommandCenter />

        <Reveal>
          <WhyScamGraph />
        </Reveal>

        <Reveal>
          <div className="section-label">// 데이터 소스</div>
          <DataSourcesPanel />
        </Reveal>

        <Reveal>
          <StatsBar />
        </Reveal>

        <Reveal>
          <div className="section-label">// 처리 파이프라인</div>
          <div className="pipe">
            {PIPE.map((n) => (
              <div className="node" key={n.t}>
                <div className="t">{n.t}</div>
                <div className="s">{n.s}</div>
                <span className="tag">{n.tag}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <ApiCallout />
        </Reveal>
      </div>

      <footer>SCAMGRAPH · 실시간 사기·피싱 위협 인텔리전스 · 데모 빌드 v0.1</footer>
    </main>
  );
}
