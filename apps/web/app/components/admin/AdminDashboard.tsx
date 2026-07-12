"use client";

// ScamGraph — 관제 관리자 대시보드 (클라이언트 아일랜드)
// 마운트 시 분석 지표 + 신고 목록을 병렬로 불러온다. 게이트웨이가 없거나 실패해도
// 시드 값을 계속 보여준다(데모 세이프 = 절대 빈칸 없음).
// 차트(recharts)는 SSR 폭 0 렌더를 피하려 mounted === true 이후에만 그린다.

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAnalytics,
  getReports,
  moderateReport,
  type Analytics,
  type Report,
} from "@/lib/admin";

// ── 디자인 토큰(globals.css 와 동일 팔레트) ──
const COLOR = {
  danger: "#d92d43",
  warning: "#d97706",
  caution: "#ca8a04",
  safe: "#0d9f6e",
  accent: "#4f46e5",
  grid: "#e4e7ec",
  tick: "#5b6577",
} as const;

const AXIS_TICK = { fill: COLOR.tick, fontSize: 11, fontFamily: "var(--mono)" };

// 라이트 테마 툴팁 — recharts 기본 스타일을 토큰 컬러로 덮어쓴다.
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid #e4e7ec",
  borderRadius: 10,
  boxShadow: "0 2px 6px rgba(16, 24, 40, 0.05), 0 8px 20px rgba(16, 24, 40, 0.06)",
  fontFamily: "var(--mono)",
  fontSize: 12,
  color: "#0e1526",
} as const;

// ── 데모 세이프 시드 값 — 백엔드가 없어도 그럴듯한 숫자에서 출발한다 ──
const SEED_ANALYTICS: Analytics = {
  by_grade: { danger: 1284, warning: 2031, caution: 3417, safe: 5122 },
  by_type: { url: 6120, phone: 3480, account: 2254 },
  timeline: [
    { date: "2026-07-04", count: 182 },
    { date: "2026-07-05", count: 214 },
    { date: "2026-07-06", count: 176 },
    { date: "2026-07-07", count: 258 },
    { date: "2026-07-08", count: 301 },
    { date: "2026-07-09", count: 276 },
    { date: "2026-07-10", count: 344 },
    { date: "2026-07-11", count: 389 },
  ],
  totals: { reports: 11854, scans: 41207, confirmed: 3516 },
};

const SEED_REPORTS: Report[] = [
  { id: 4821, target: "hxxp://secure-kb-login.top", kind: "url", note: "KB 사칭 로그인 피싱", status: "pending", votes: 42, ts: "2026-07-11T09:12:00Z" },
  { id: 4820, target: "010-3924-7712", kind: "phone", note: "택배 미배송 스미싱 발신", status: "pending", votes: 31, ts: "2026-07-11T08:47:00Z" },
  { id: 4818, target: "110-284-889231 우리은행", kind: "account", note: "중고거래 사기 입금 계좌", status: "pending", votes: 27, ts: "2026-07-11T08:05:00Z" },
  { id: 4815, target: "hxxp://naver-event-2026.shop", kind: "url", note: "네이버 경품 사칭", status: "confirmed", votes: 58, ts: "2026-07-10T22:31:00Z" },
  { id: 4809, target: "070-8811-2093", kind: "phone", note: "대출 권유 보이스피싱", status: "pending", votes: 19, ts: "2026-07-10T19:58:00Z" },
  { id: 4802, target: "352-9981-00212 카카오뱅크", kind: "account", note: "투자 리딩방 송금 계좌", status: "rejected", votes: 6, ts: "2026-07-10T15:22:00Z" },
];

// ── KPI 카드 정의(총 신고 / 확인된 위협 / 총 스캔) ──
type KpiKey = "reports" | "confirmed" | "scans";
const KPIS: ReadonlyArray<{ key: KpiKey; k: string; cls: string; d: string }> = [
  { key: "reports", k: "총 신고", cls: "accent", d: "커뮤니티 접수 누적" },
  { key: "confirmed", k: "확인된 위협", cls: "danger", d: "검증 완료 판정" },
  { key: "scans", k: "총 스캔", cls: "warn", d: "엔진 분석 누적" },
];

// ── 유형 한글 라벨 ──
const TYPE_LABEL: Record<string, string> = { url: "URL", phone: "전화번호", account: "계좌" };
const GRADE_LABEL = { danger: "위험", warning: "경고", caution: "주의", safe: "안전" } as const;

// 상태 뱃지 색 클래스(확인=강조 / 반려=위험 / 대기=경고)
function statusClass(status: string): string {
  if (status === "confirmed") return "ok";
  if (status === "rejected") return "no";
  return "wait";
}
function statusLabel(status: string): string {
  if (status === "confirmed") return "확인됨";
  if (status === "rejected") return "반려됨";
  return "대기중";
}

// YYYY-MM-DD → MM.DD (축 라벨용)
function shortDate(iso: string): string {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[1]}.${parts[2]}` : iso;
}

export default function AdminDashboard() {
  const [mounted, setMounted] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics>(SEED_ANALYTICS);
  const [reports, setReports] = useState<Report[]>(SEED_REPORTS);
  const [pendingId, setPendingId] = useState<number | null>(null);

  // 마운트 이후에만 차트를 그린다(ResponsiveContainer 폭 0 SSR 렌더 회피).
  // 분석 지표 + 신고 목록은 병렬로 불러오고, 실패한 쪽만 시드 값을 유지한다.
  useEffect(() => {
    setMounted(true);
    let alive = true;

    (async () => {
      const [a, r] = await Promise.allSettled([getAnalytics(), getReports()]);
      if (!alive) return;
      if (a.status === "fulfilled") setAnalytics(a.value);
      if (r.status === "fulfilled" && r.value.length > 0) setReports(r.value);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 확인/반려 — 낙관적 업데이트: 즉시 행을 갱신하고, 실패 시 스냅샷으로 롤백.
  async function moderate(id: number, status: "confirmed" | "rejected") {
    const snapshot = reports;
    setPendingId(id);
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

    try {
      const updated = await moderateReport(id, status);
      setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      // 게이트웨이 실패 시 판정 전 상태로 되돌린다(가시적 롤백).
      setReports(snapshot);
    } finally {
      setPendingId(null);
    }
  }

  const gradeData = [
    { key: "danger", name: GRADE_LABEL.danger, value: analytics.by_grade.danger, fill: COLOR.danger },
    { key: "warning", name: GRADE_LABEL.warning, value: analytics.by_grade.warning, fill: COLOR.warning },
    { key: "caution", name: GRADE_LABEL.caution, value: analytics.by_grade.caution, fill: COLOR.caution },
    { key: "safe", name: GRADE_LABEL.safe, value: analytics.by_grade.safe, fill: COLOR.safe },
  ];

  const typeData = [
    { name: TYPE_LABEL.url, value: analytics.by_type.url },
    { name: TYPE_LABEL.phone, value: analytics.by_type.phone },
    { name: TYPE_LABEL.account, value: analytics.by_type.account },
  ];

  const timelineData = analytics.timeline.map((t) => ({ label: shortDate(t.date), count: t.count }));

  return (
    <section className="admin">
      {/* ── KPI 행 ── */}
      <div className="grid kpi">
        {KPIS.map((c) => (
          <div className="stat" key={c.key}>
            <div className="k">{c.k}</div>
            <div className={`v ${c.cls}`}>{analytics.totals[c.key].toLocaleString()}</div>
            <div className="d">{c.d}</div>
          </div>
        ))}
      </div>

      {/* ── 차트 3종 ── */}
      <p className="section-label">위협 분석</p>
      <div className="charts">
        <div className="card">
          <div className="card-h">등급별 분포</div>
          <div className="chart-box">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={gradeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {gradeData.map((d) => (
                      <Cell key={d.key} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#0e1526" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="legend">
            {gradeData.map((d) => (
              <span key={d.key} className="lg">
                <i style={{ background: d.fill }} />
                {d.name}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">유형별 신고</div>
          <div className="chart-box">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={COLOR.grid} vertical={false} />
                  <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLOR.grid }} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    cursor={{ fill: "rgba(79,70,229,0.06)" }}
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "#0e1526" }}
                  />
                  <Bar dataKey="value" fill={COLOR.accent} radius={[6, 6, 0, 0]} maxBarSize={64} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card wide">
          <div className="card-h">위협 접수 추이</div>
          <div className="chart-box">
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="threatArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR.accent} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={COLOR.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLOR.grid} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLOR.grid }} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "#0e1526" }} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={COLOR.accent}
                    strokeWidth={2}
                    fill="url(#threatArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── 모더레이션 테이블 ── */}
      <p className="section-label">신고 모더레이션</p>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>대상</th>
              <th>유형</th>
              <th>메모</th>
              <th>상태</th>
              <th className="num">투표</th>
              <th className="act">액션</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const busy = pendingId === r.id;
              return (
                <tr key={r.id}>
                  <td className="mono target">{r.target}</td>
                  <td>
                    <span className="type">{TYPE_LABEL[r.kind] ?? r.kind}</span>
                  </td>
                  <td className="note">{r.note ?? "—"}</td>
                  <td>
                    <span className={`badge ${statusClass(r.status)}`}>{statusLabel(r.status)}</span>
                  </td>
                  <td className="num mono">{r.votes}</td>
                  <td className="act">
                    <button
                      className="mini ok"
                      disabled={busy || r.status === "confirmed"}
                      onClick={() => moderate(r.id, "confirmed")}
                    >
                      확인
                    </button>
                    <button
                      className="mini no"
                      disabled={busy || r.status === "rejected"}
                      onClick={() => moderate(r.id, "rejected")}
                    >
                      반려
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        .admin { margin-top: 40px; }
        .admin .kpi { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

        /* 차트 그리드 — 위 두 카드 나란히, 추이 카드는 전체 폭 */
        .charts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .card {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
          padding: 18px 18px 14px;
        }
        .card.wide { grid-column: 1 / -1; }
        .card-h {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 1px;
          color: var(--text-dim);
          margin-bottom: 12px;
        }
        .chart-box { height: 260px; width: 100%; }

        /* 등급 파이 범례 */
        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin-top: 8px;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--text-dim);
        }
        .legend .lg { display: inline-flex; align-items: center; gap: 6px; }
        .legend .lg i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }

        /* 모더레이션 테이블 */
        .table-card {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--bg-card);
          overflow: hidden;
          overflow-x: auto;
        }
        table { width: 100%; border-collapse: collapse; min-width: 720px; }
        thead th {
          text-align: left;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-mute);
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
          background: var(--bg-elev);
        }
        thead th.num { text-align: right; }
        thead th.act { text-align: right; }
        tbody td {
          padding: 13px 16px;
          border-bottom: 1px solid var(--line);
          font-size: 14px;
          color: var(--text);
          vertical-align: middle;
        }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:hover td { background: rgba(79, 70, 229, 0.04); }
        .mono { font-family: var(--mono); }
        td.target { color: var(--text); max-width: 260px; word-break: break-all; font-size: 13px; }
        td.note { color: var(--text-dim); font-size: 13px; max-width: 240px; }
        td.num { text-align: right; color: var(--text-dim); }
        td.act { text-align: right; white-space: nowrap; }

        .type {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--accent);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 2px 8px;
        }

        .badge {
          font-family: var(--mono);
          font-size: 11px;
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid var(--line);
        }
        .badge.ok { color: var(--accent-2); border-color: rgba(13, 159, 110, 0.4); }
        .badge.no { color: var(--danger); border-color: rgba(217, 45, 67, 0.4); }
        .badge.wait { color: var(--warn); border-color: rgba(217, 119, 6, 0.4); }

        .mini {
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          padding: 6px 12px;
          margin-left: 6px;
          border-radius: 8px;
          border: 1px solid var(--line);
          background: var(--bg-elev);
          cursor: pointer;
          transition: transform 0.12s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .mini.ok { color: var(--accent-2); }
        .mini.ok:hover:not(:disabled) { border-color: var(--accent-2); transform: translateY(-1px); }
        .mini.no { color: var(--danger); }
        .mini.no:hover:not(:disabled) { border-color: var(--danger); transform: translateY(-1px); }
        .mini:disabled { opacity: 0.38; cursor: not-allowed; }

        @media (max-width: 720px) {
          .charts { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
