// ScamGraph — "왜 ScamGraph인가" 차별화 섹션
// 정부·통신사 서비스(112·경찰·금감원·KISA·통신사 차단)를 대체하는 게 아니라,
// 그들이 사일로에서 놓치는 신호를 하나의 사기 조직으로 잇는 "연결 계층"임을 설명한다.
// 데이터 페칭·훅 없음 → 서버 컴포넌트. 팔레트 토큰(globals.css) 재사용 + 스코프드 <style>.

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

// 차별점 5행. gov = 정부·통신사 서비스의 한계, sg = ScamGraph가 채우는 계층.
// 과장 없이 "보완/연결"로 포지셔닝 — 우리가 더 낫다가 아니라 그들이 못 하는 걸 한다.
interface CompareRow {
  item: string;
  itemSub: string;
  gov: string;
  govTone: "muted" | "no";
  sg: string;
}

const ROWS: CompareRow[] = [
  {
    item: "교차 귀속",
    itemSub: "도메인·전화·계좌·IP를 한 조직으로",
    gov: "사일로별 분리 (제한적)",
    govTone: "muted",
    sg: "하나의 그래프로 통합",
  },
  {
    item: "공개 API·연동",
    itemSub: "은행·개발자가 그 위에 구축",
    gov: "폐쇄형 앱",
    govTone: "no",
    sg: "오픈 플랫폼 (REST)",
  },
  {
    item: "설명·감사가능",
    itemSub: "근거와 연결 경로를 제시",
    gov: '"차단됨"만 통보',
    govTone: "no",
    sg: "규칙 + 근거 + 경로",
  },
  {
    item: "선제 탐지",
    itemSub: "미신고 신규를 인프라 공유로",
    gov: "반응적 (등재 후)",
    govTone: "muted",
    sg: "공유 인프라 연루로 조기 포착",
  },
  {
    item: "다출처 통합",
    itemSub: "규칙 + 커뮤니티 + 공개데이터",
    gov: "단일 기관 신고 채널",
    govTone: "muted",
    sg: "여러 출처를 한 그래프로",
  },
];

const METHODS = [
  {
    k: "링크 분석",
    en: "link analysis",
    d: "개체 사이의 연결을 추적해 숨은 관계를 드러냅니다.",
  },
  {
    k: "인프라 피벗",
    en: "infrastructure pivoting",
    d: "공유 IP·계좌·전화번호를 축으로 연루된 자산까지 확장합니다.",
  },
  {
    k: "설명가능 스코어링",
    en: "explainable scoring",
    d: "위험 점수와 함께 그 판단 근거 규칙을 나란히 제시합니다.",
  },
];

export default function WhyScamGraph() {
  return (
    <section className="why" aria-labelledby="why-heading">
      <div className="section-label">// 왜 ScamGraph인가</div>
      <h2 id="why-heading" className="why-title">
        정부·통신사가 못 채우는 <span>연결 계층</span>
      </h2>
      <p className="why-thesis">
        ScamGraph는 112·경찰·금감원·KISA·통신사 차단을 <strong>대체하지 않습니다.</strong>
        <br />
        각자 사일로에서 놓치는 신호를 하나의 사기 조직으로 잇는{" "}
        <strong>오픈 인텔리전스 레이어</strong>입니다.
      </p>

      {/* 비교 표 — 데스크톱은 3열 그리드, 좁은 화면은 행 단위 카드로 스택 */}
      <div className="cmp" role="table" aria-label="정부·통신사 서비스와 ScamGraph 비교">
        <div className="cmp-head" role="row">
          <span className="c-item" role="columnheader">
            항목
          </span>
          <span className="c-gov" role="columnheader">
            정부·통신사 서비스
          </span>
          <span className="c-sg" role="columnheader">
            ScamGraph
          </span>
        </div>

        {ROWS.map((r) => (
          <div className="cmp-row" role="row" key={r.item}>
            <span className="c-item" role="cell">
              <span className="c-item-t">{r.item}</span>
              <span className="c-item-s">{r.itemSub}</span>
            </span>
            <span className={`c-gov tone-${r.govTone}`} role="cell" data-label="정부·통신사">
              <span className="mark">{r.govTone === "no" ? "✗" : "~"}</span>
              {r.gov}
            </span>
            <span className="c-sg" role="cell" data-label="ScamGraph">
              <span className="mark ok">✓</span>
              {r.sg}
            </span>
          </div>
        ))}
      </div>

      <p className="cmp-foot">
        * ScamGraph는 공개·커뮤니티 데이터 위에서 동작하며, 공식 데이터셋과 연동 가능하도록
        설계되었습니다. 공식 서비스가 보유한 데이터를 직접 가졌다고 주장하지 않습니다.
      </p>

      {/* 방법론 — 전문가가 실제로 쓰는 기법 */}
      <div className="methods">
        {METHODS.map((m) => (
          <div className="method" key={m.k}>
            <div className="m-k">{m.k}</div>
            <div className="m-en">{m.en}</div>
            <div className="m-d">{m.d}</div>
          </div>
        ))}
      </div>

      {/* 마무리: 앱이 아니라 플랫폼 */}
      <div className="why-close">
        <span className="close-tag">앱이 아니라 플랫폼</span>
        <div className="close-links">
          <a
            className="close-chip primary"
            href={`${GATEWAY}/docs`}
            target="_blank"
            rel="noopener noreferrer"
          >
            공개 API · /docs ↗
          </a>
          <a
            className="close-chip"
            href={`${GATEWAY}/api/feed`}
            target="_blank"
            rel="noopener noreferrer"
          >
            IoC 피드 · /api/feed ↗
          </a>
        </div>
      </div>

      <style>{WHY_CSS}</style>
    </section>
  );
}

const WHY_CSS = `
.why { margin-top: 24px; }
.why-title {
  font-size: clamp(1.9rem, 1rem + 3.4vw, 3.2rem);
  line-height: 1.04;
  letter-spacing: -0.025em;
  font-weight: 800;
  margin: 6px 0 16px;
}
.why-title span { color: var(--accent); }
.why-thesis {
  max-width: 660px;
  font-size: clamp(1rem, 0.94rem + 0.35vw, 1.18rem);
  line-height: 1.6;
  color: var(--text-dim);
  margin-bottom: 34px;
}
.why-thesis strong { color: var(--text); font-weight: 700; }

/* ── 비교 표 ── */
.cmp {
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-card);
}
.cmp-head,
.cmp-row {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1.05fr;
  align-items: stretch;
}
.cmp-head {
  background: var(--bg-elev);
  border-bottom: 1px solid var(--line);
}
.cmp-head > span {
  padding: 13px 18px;
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-mute);
}
.cmp-head .c-sg { color: var(--accent); }
.cmp-row { border-top: 1px solid var(--line); transition: background 0.16s ease; }
.cmp-row:first-of-type { border-top: none; }
.cmp-row:hover { background: rgba(0, 229, 192, 0.03); }
.cmp-row > span {
  padding: 16px 18px;
  font-size: 14px;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.c-item-t { font-weight: 700; color: var(--text); }
.c-item-s { font-family: var(--mono); font-size: 11px; color: var(--text-mute); }

.c-gov,
.c-sg {
  flex-direction: row !important;
  align-items: center;
  gap: 9px;
}
.c-gov { color: var(--text-dim); border-left: 1px solid var(--line); }
.c-gov.tone-no { color: var(--text-mute); }
.c-sg {
  color: var(--text);
  font-weight: 600;
  border-left: 1px solid var(--line);
  background: rgba(0, 229, 192, 0.045);
}
.mark {
  flex: none;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  font-family: var(--mono);
  color: var(--text-mute);
  border: 1px solid var(--line);
}
.tone-no .mark { color: var(--danger); border-color: rgba(255, 77, 109, 0.35); }
.mark.ok {
  color: #04120f;
  background: var(--accent);
  border-color: var(--accent);
}

.cmp-foot {
  margin-top: 12px;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-mute);
  max-width: 720px;
}

/* ── 방법론 ── */
.methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  margin-top: 30px;
}
.method {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px;
  background: var(--bg-elev);
  transition: border-color 0.16s ease, transform 0.12s ease;
}
.method:hover { border-color: var(--accent); transform: translateY(-1px); }
.m-k { font-weight: 700; font-size: 15px; color: var(--text); }
.m-en {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.5px;
  color: var(--accent-2);
  margin-top: 3px;
}
.m-d { font-size: 13px; line-height: 1.5; color: var(--text-dim); margin-top: 10px; }

/* ── 마무리 ── */
.why-close {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 30px;
  padding: 20px 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background:
    radial-gradient(600px 200px at 92% -30%, rgba(124, 240, 61, 0.08), transparent 60%),
    var(--bg-card);
}
.close-tag {
  font-weight: 800;
  font-size: clamp(1rem, 0.95rem + 0.3vw, 1.15rem);
  letter-spacing: -0.01em;
  color: var(--text);
}
.close-links { display: flex; flex-wrap: wrap; gap: 10px; margin-left: auto; }
.close-chip {
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
.close-chip:hover { color: var(--text); border-color: var(--accent); transform: translateY(-1px); }
.close-chip.primary {
  background: var(--accent);
  color: #04120f;
  border-color: var(--accent);
}
.close-chip.primary:hover { box-shadow: 0 8px 30px rgba(0, 229, 192, 0.25); }

/* ── 좁은 화면: 표를 행 단위 카드로 스택 ── */
@media (max-width: 640px) {
  .cmp-head { display: none; }
  .cmp-row { grid-template-columns: 1fr; }
  .cmp-row > span { padding: 14px 16px; border-left: none !important; }
  .c-item { border-bottom: 1px solid var(--line); }
  .c-gov, .c-sg { background: transparent; }
  .c-gov::before, .c-sg::before {
    content: attr(data-label);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-mute);
    margin-right: 2px;
  }
  .close-links { margin-left: 0; }
}
`;
