// useCountUp 훅 테스트 — reduced-motion 즉시 수렴 + 애니메이션 최종 수렴을 고정한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCountUp } from "@/lib/useCountUp";

// window.matchMedia 를 원하는 reduced 값으로 스텁한다(jsdom 기본 미구현).
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduced,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCountUp", () => {
  it("prefers-reduced-motion 이면 애니메이션 없이 즉시 목표값을 반환한다", () => {
    stubReducedMotion(true);
    const { result } = renderHook(() => useCountUp(4200));
    expect(result.current).toBe(4200);
  });

  it("모션 허용 시 rAF 애니메이션이 목표값으로 수렴한다", () => {
    stubReducedMotion(false);
    // requestAnimationFrame 을 동기 시계로 스텁해 애니메이션을 한 번에 완주시킨다.
    let clock = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      clock += 120; // 900ms duration 을 몇 프레임 만에 통과
      cb(clock);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { result } = renderHook(() => useCountUp(100, 900));
    expect(result.current).toBe(100); // easeOutCubic 종료 시점에 정확히 목표값
  });

  it("목표값이 바뀌면 새 목표값으로 갱신된다(reduced 경로)", () => {
    stubReducedMotion(true);
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), {
      initialProps: { v: 10 },
    });
    expect(result.current).toBe(10);
    rerender({ v: 55 });
    expect(result.current).toBe(55);
  });
});
