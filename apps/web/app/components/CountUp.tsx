"use client";

// 숫자 카운트업 표시용 얇은 래퍼 — map 안에서도 훅 규칙을 지키도록 컴포넌트로 분리.
import { useCountUp } from "@/lib/useCountUp";

interface CountUpProps {
  value: number;
  className?: string;
  durationMs?: number;
}

export default function CountUp({ value, className, durationMs }: CountUpProps) {
  const n = useCountUp(value, durationMs);
  return <span className={className}>{n.toLocaleString()}</span>;
}
