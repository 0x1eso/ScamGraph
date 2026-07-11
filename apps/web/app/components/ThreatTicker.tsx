"use client";

// ScamGraph — 실시간 위협 티커(마퀴)
// 최근 차단된 사기 인프라(도메인·전화번호)를 주식 시세판처럼 가로로 흘려보내
// "시스템이 끊임없이 위협을 삼키고 있다"는 인상을 준다.
// 데모 안전성: 외부 연결 없이 시드 배열만으로 즉시 동작한다.
// 하이드레이션 안전성: 상대 시간은 렌더 시점 계산 없이 고정 문자열로 둔다.

// 티커에 흘려보낼 최근 차단 지표. severity 로 점 색상을 가른다
// (도메인 = danger, 경찰청 신고 번호 = warn).
interface ThreatItem {
  value: string;
  source: string;
  time: string;
  severity: "danger" | "warn";
}

const THREATS: readonly ThreatItem[] = [
  { value: "naver-security-check.xyz", source: "openphish", time: "12초 전", severity: "danger" },
  { value: "secure-tosspay.info", source: "URLhaus·abuse.ch", time: "34초 전", severity: "danger" },
  { value: "kbstar-otp.live", source: "ThreatFox·abuse.ch", time: "1분 전", severity: "danger" },
  { value: "cj-delivery-check.top", source: "openphish", time: "2분 전", severity: "danger" },
  { value: "kakao-giftbox.top", source: "openphish", time: "3분 전", severity: "danger" },
  { value: "shinhan-otp-confirm.xyz", source: "URLhaus", time: "4분 전", severity: "danger" },
  { value: "070-8890-1234", source: "경찰청", time: "6분 전", severity: "warn" },
  { value: "woori-safe-login.top", source: "URLhaus", time: "8분 전", severity: "danger" },
  { value: "toss-verify.live", source: "ThreatFox", time: "11분 전", severity: "danger" },
  { value: "coupang-event-refund.click", source: "openphish", time: "14분 전", severity: "danger" },
  { value: "1600-8877", source: "경찰청", time: "19분 전", severity: "warn" },
  { value: "kb-secure.help", source: "ThreatFox", time: "26분 전", severity: "danger" },
];

// 렌더 순서를 안정적으로 유지하기 위한 카피 인덱스(0=본체, 1=이음매용 복제).
const COPIES: readonly number[] = [0, 1];

function ThreatChip({ item, hidden }: { item: ThreatItem; hidden: boolean }) {
  return (
    <span className="tt-chip" aria-hidden={hidden || undefined}>
      <span className={`tt-dot tt-dot-${item.severity}`} aria-hidden="true" />
      <span className="tt-value">
        <span className="tt-mark" aria-hidden="true">
          ◆
        </span>{" "}
        {item.value}
      </span>
      <span className="tt-source">{item.source}</span>
      <span className="tt-time">{item.time}</span>
    </span>
  );
}

export default function ThreatTicker() {
  return (
    <div className="tt" aria-label="실시간 위협 피드 티커">
      {/* 왼쪽 고정 라벨: accent 점 + 텍스트, 오른쪽으로 그라디언트 페이드 */}
      <div className="tt-label">
        <span className="tt-live-dot" aria-hidden="true" />
        <span className="tt-live-text">LIVE 위협 피드</span>
      </div>

      {/* 마퀴: 동일 목록을 두 번 이어 붙이고 track 을 -50% 이동해 이음매 없이 순환 */}
      <div className="tt-marquee">
        <div className="tt-track">
          {COPIES.map((copy) =>
            THREATS.map((item, i) => (
              <ThreatChip key={`${copy}-${i}`} item={item} hidden={copy === 1} />
            )),
          )}
        </div>
      </div>

      {/* 오른쪽 페이드 마스크: 새 칩이 아래에서 떠오르는 인상 */}
      <div className="tt-fade-right" aria-hidden="true" />

      <style jsx global>{`
        .tt {
          position: relative;
          height: 44px;
          overflow: hidden;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          background: var(--bg-elev);
          font-family: var(--mono);
          font-size: 12px;
        }

        /* 왼쪽 라벨 — 마퀴 위에 겹쳐 두고, 칩이 그 아래로 빠져나가도록 페이드 */
        .tt-label {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 44px 0 18px;
          background: linear-gradient(
            90deg,
            var(--bg-elev) 0%,
            var(--bg-elev) 58%,
            transparent 100%
          );
          white-space: nowrap;
          pointer-events: none;
        }
        .tt-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 0 0 rgba(0, 229, 192, 0.6);
          animation: tt-pulse 1.8s infinite;
        }
        .tt-live-text {
          color: var(--accent);
          font-weight: 700;
          letter-spacing: 1px;
        }
        @keyframes tt-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(0, 229, 192, 0.5);
          }
          70% {
            box-shadow: 0 0 0 7px rgba(0, 229, 192, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(0, 229, 192, 0);
          }
        }

        /* 오른쪽 페이드 마스크 */
        .tt-fade-right {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 72px;
          z-index: 2;
          background: linear-gradient(270deg, var(--bg-elev), transparent);
          pointer-events: none;
        }

        .tt-marquee {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
        }
        .tt-track {
          display: flex;
          align-items: center;
          width: max-content;
          will-change: transform;
          animation: tt-scroll 46s linear infinite;
        }
        /* hover 시 정지(관제 화면에서 항목을 눈으로 좇을 수 있게) */
        .tt-marquee:hover .tt-track {
          animation-play-state: paused;
        }
        /* 목록을 두 번 이어 붙였으므로 -50% = 정확히 한 벌 → 이음매 없음 */
        @keyframes tt-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        .tt-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 22px;
          border-right: 1px solid var(--line);
          white-space: nowrap;
          line-height: 44px;
        }
        .tt-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex: 0 0 auto;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        }
        .tt-dot-danger {
          color: var(--danger);
        }
        .tt-dot-warn {
          color: var(--warn);
        }
        .tt-value {
          color: var(--text);
          letter-spacing: 0.2px;
        }
        .tt-mark {
          color: var(--text-mute);
        }
        .tt-source {
          color: var(--text-dim);
          letter-spacing: 0.3px;
        }
        .tt-time {
          color: var(--text-mute);
          letter-spacing: 0.3px;
        }

        /* 모션 최소화 요청 시: 스크롤 정지 → 앞쪽 몇 개 칩만 정적으로 노출 */
        @media (prefers-reduced-motion: reduce) {
          .tt-track {
            animation: none;
            transform: none;
          }
          .tt-live-dot {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
