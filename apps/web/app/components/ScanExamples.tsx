"use client";

// ScamGraph — 가이드 데모 예시 칩 ("이런 걸 스캔해보세요")
// 스캔 콘솔 입력 아래에 클릭 가능한 예시 칩 한 줄. 클릭하면 입력을 채우고 즉시 스캔.
// 심사 킬샷을 원클릭으로 재현시키는 장치 — 각 칩은 "무엇을 보여주는지"를 라벨로 설명한다.
// framer-motion 미설치를 가정하고 진입 애니메이션은 CSS 트랜지션으로 처리한다.

interface ScanExample {
  // 실제로 스캔에 넣을 대상 문자열.
  value: string;
  // 이 예시가 무엇을 시연하는지(칩 아래 작은 라벨).
  tag: string;
  // 라벨 톤: 위험 유형은 danger, 정상 대비군은 safe.
  tone: "danger" | "safe";
}

// 데모 시나리오 5종. 첫 칩은 실제 '위험(danger)' 판정이 뜨는 브랜드 사칭 URL — 킬샷의 첫 화면.
// 실측 등급(게이트웨이 /api/scan 확인): shinhan-otp.xyz=위험73 · kbstat-secure.click=위험76 ·
//   nаver.com=경고50(혼동문자) · naver.com=안전0 · 070-8890-1234=주의20.
//   tag는 공격 유형(규칙)을 설명할 뿐 등급을 문구로 단정하지 않는다 — 경고/주의 입력을 "위험"이라 부르지 않는다.
// 주의: 2번 value의 두 번째 글자는 키릴 'а'(U+0430)로 라틴 'a'와 시각적으로 동일하다.
// 바로 아래 정상 naver.com(3번)과 나란히 두면 "육안으로 구분 불가"라는 혼동문자 공격이 즉시 드러난다.
// 절대 라틴 'a'로 '고치지' 말 것 — 이 차이가 시연의 핵심이다.
const EXAMPLES: ReadonlyArray<ScanExample> = [
  { value: "shinhan-otp.xyz", tag: "신한 사칭 · 위험", tone: "danger" },
  { value: "nаver.com", tag: "혼동 문자 · 키릴 а", tone: "danger" },
  { value: "naver.com", tag: "정상 대조군", tone: "safe" },
  { value: "kbstat-secure.click", tag: "KB 유사 도메인 · 위험", tone: "danger" },
  { value: "070-8890-1234", tag: "보이스피싱 번호", tone: "danger" },
];

interface ScanExamplesProps {
  // 예시를 고르면 콘솔이 입력을 채우고 스캔을 실행한다(기존 submit 경로 재사용).
  onPick: (value: string) => void;
  // 스캔 진행 중에는 칩을 비활성화한다(중복 요청 방지).
  disabled?: boolean;
}

export default function ScanExamples({ onPick, disabled = false }: ScanExamplesProps) {
  return (
    <div className="se">
      <span className="se-label">이런 걸 스캔해보세요</span>
      <div className="se-chips">
        {EXAMPLES.map((ex) => (
          <button
            type="button"
            key={ex.value + ex.tag}
            className={`se-chip se-${ex.tone}`}
            onClick={() => onPick(ex.value)}
            disabled={disabled}
            title={`${ex.value} — ${ex.tag}`}
          >
            <span className="se-chip-val">{ex.value}</span>
            <span className="se-chip-tag">{ex.tag}</span>
          </button>
        ))}
      </div>

      <style>{SCAN_EXAMPLES_CSS}</style>
    </div>
  );
}

// 스코프드 스타일: globals.css를 건드리지 않고 토큰만 재사용한다.
const SCAN_EXAMPLES_CSS = `
.se {
  padding: 0 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.se-label {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute);
}
.se-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.se-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg-elev);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur-fast) ease, transform var(--dur-fast) ease,
    box-shadow var(--dur-normal) ease, background var(--dur-fast) ease;
}
.se-chip:hover:not(:disabled) {
  transform: translateY(-2px);
  background: var(--bg-card);
}
.se-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.se-chip-val {
  font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--text);
}
.se-chip-tag {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.3px;
}

/* 위험 예시 — 살짝 붉은 톤 강조. 정상 대조군 — 액센트(그린)로 대비. */
.se-danger:hover:not(:disabled) {
  border-color: rgba(255, 77, 109, 0.5);
  box-shadow: 0 8px 26px rgba(255, 77, 109, 0.14);
}
.se-danger .se-chip-tag { color: var(--danger); }
.se-safe:hover:not(:disabled) {
  border-color: rgba(124, 240, 61, 0.5);
  box-shadow: 0 8px 26px rgba(124, 240, 61, 0.14);
}
.se-safe .se-chip-tag { color: var(--accent-2); }
`;
