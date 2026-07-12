"use client";

// ScamGraph — 판정 정확도 배지
// 게이트웨이 /api/accuracy(라벨셋 기반 precision/recall/F1)를 불러와 "정확하다"를 숫자로 증명.
// 실패해도 시드로 항상 렌더한다(데모 세이프). 정확도는 카운트업으로 채운다.

import { useEffect, useState } from "react";
import { useCountUp } from "@/lib/useCountUp";
import { fetchJson } from "@/lib/api";

interface Accuracy {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  samples: number;
  confusion?: { tp: number; fp: number; tn: number; fn: number };
}

// 엔진 실측 스냅샷(데모 세이프 폴백).
const SEED: Accuracy = {
  accuracy: 0.964,
  precision: 1.0,
  recall: 0.929,
  f1: 0.9634,
  samples: 165,
  confusion: { tp: 79, fp: 0, tn: 80, fn: 6 },
};

function isAccuracy(d: unknown): d is Accuracy {
  return typeof d === "object" && d !== null && typeof (d as Accuracy).accuracy === "number";
}

export default function AccuracyBadge() {
  const [m, setM] = useState<Accuracy>(SEED);

  useEffect(() => {
    let alive = true;
    // 실패(비200·네트워크·손상)면 null → 시드 유지. 유효한 응답만 병합한다(데모 세이프).
    fetchJson<unknown>("/api/accuracy", { fallback: null }).then((d) => {
      if (alive && isAccuracy(d)) {
        setM({ ...SEED, ...d });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // 95.6 을 부드럽게 카운트업(소수 1자리) — 정수 훅을 10배 스케일로 사용.
  const scaled = useCountUp(Math.round(m.accuracy * 1000));
  const pctText = (scaled / 10).toFixed(1);
  const fp = m.confusion?.fp ?? 0;

  return (
    <div className="acc" role="group" aria-label={`판정 정확도 ${pctText}퍼센트`}>
      <div className="acc-hero">
        <div className="acc-k">// 판정 정확도</div>
        <div className="acc-num">
          {pctText}
          <span className="acc-pct">%</span>
        </div>
        <div className="acc-sub">라벨 {m.samples}건 기준 · 오프라인 평가</div>
      </div>

      <div className="acc-grid">
        <Metric label="정밀도 (precision)" value={m.precision.toFixed(2)} hint="사기로 판정한 것 중 실제 사기" />
        <Metric label="재현율 (recall)" value={m.recall.toFixed(2)} hint="실제 사기 중 잡아낸 비율" />
        <Metric label="F1" value={m.f1.toFixed(2)} hint="정밀도·재현율 조화평균" />
        <Metric label="오탐 (false positive)" value={`${fp}건`} good={fp === 0} hint="정상을 사기로 오판" />
      </div>

      <style>{ACC_CSS}</style>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  good,
}: {
  label: string;
  value: string;
  hint: string;
  good?: boolean;
}) {
  return (
    <div className="acc-metric">
      <div className="acc-metric-top">
        <span className="acc-metric-label">{label}</span>
        <span className={`acc-metric-value${good ? " good" : ""}`}>{value}</span>
      </div>
      <div className="acc-metric-hint">{hint}</div>
    </div>
  );
}

const ACC_CSS = `
.acc {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(0, 1.4fr);
  gap: 22px;
  align-items: center;
  margin: 0 0 34px;
  padding: 22px 24px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background:
    radial-gradient(520px 180px at 8% -40%, rgba(0, 229, 192, 0.1), transparent 60%),
    var(--bg-card);
}
.acc-hero { border-right: 1px solid var(--line); padding-right: 20px; }
.acc-k {
  font-family: var(--mono); font-size: 11px; letter-spacing: 1px;
  color: var(--text-mute); text-transform: uppercase;
}
.acc-num {
  font-size: clamp(2.8rem, 1.6rem + 4vw, 4rem);
  font-weight: 800; letter-spacing: -0.03em; line-height: 1;
  color: var(--accent); margin: 6px 0 4px;
  font-variant-numeric: tabular-nums;
}
.acc-pct { font-size: 0.42em; font-weight: 700; margin-left: 4px; color: var(--accent-2); }
.acc-sub { font-family: var(--mono); font-size: 11px; color: var(--text-dim); }

.acc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 22px;
}
.acc-metric { min-width: 0; }
.acc-metric-top {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
}
.acc-metric-label {
  font-family: var(--mono); font-size: 11px; color: var(--text-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.acc-metric-value {
  font-family: var(--mono); font-size: 17px; font-weight: 800; color: var(--text);
  font-variant-numeric: tabular-nums;
}
.acc-metric-value.good { color: var(--accent-2); }
.acc-metric-hint {
  font-size: 11px; color: var(--text-mute); margin-top: 2px; line-height: 1.4;
}

@media (max-width: 640px) {
  .acc { grid-template-columns: 1fr; gap: 18px; }
  .acc-hero { border-right: none; border-bottom: 1px solid var(--line); padding: 0 0 16px; }
}
`;
