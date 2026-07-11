"use client";

// 숫자 카운트업 — target 이 바뀌면 현재값에서 easeOutCubic 으로 부드럽게 수렴.
// prefers-reduced-motion 이면 즉시 목표값을 반환한다(모션 없음).

import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const curRef = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      curRef.current = target;
      setValue(target);
      return;
    }

    const from = curRef.current;
    let raf = 0;
    let start: number | null = null;

    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const v = Math.round(from + (target - from) * eased);
      curRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
