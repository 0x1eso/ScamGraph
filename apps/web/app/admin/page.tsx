// ScamGraph — 관제 관리자 콘솔 (/admin)
// 전역 layout.tsx 와 globals.css 토큰을 상속하는 서버 컴포넌트 셸.
// 실제 대시보드(차트 + 모더레이션)는 클라이언트 아일랜드 <AdminDashboard/> 가 담당.

import Link from "next/link";
import AdminDashboard from "@/app/components/admin/AdminDashboard";

export default function AdminPage() {
  return (
    <main>
      <header className="statusbar">
        <span className="brandmark">
          SCAM<b>GRAPH</b>
        </span>
        <span className="svc">
          <span className="dot" />
          관제 관리자
        </span>
        <span className="spacer" />
        <Link href="/" className="back-link">
          ← 대시보드
        </Link>
      </header>

      <div className="wrap">
        <p className="eyebrow">OPERATOR CONSOLE</p>
        <h1 className="hero-title">
          위협 <span>관제</span> 콘솔
        </h1>
        <p className="lede">
          커뮤니티 신고를 검증하고, 등급·유형·추이 분석으로 사기 인프라의 흐름을 한눈에 관제합니다.
        </p>

        <AdminDashboard />
      </div>

      <footer>SCAMGRAPH · 관제 관리자 콘솔 · 내부 운영 전용</footer>

      <style>{`
        .back-link {
          color: var(--text-dim);
          text-decoration: none;
          font-family: var(--mono);
          font-size: 12px;
          transition: color 0.15s ease;
        }
        .back-link:hover { color: var(--accent); }
      `}</style>
    </main>
  );
}
