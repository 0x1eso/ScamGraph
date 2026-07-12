// ScanExamples 테스트 — 예시 칩 렌더 + onPick 위임 + disabled + 혼동문자 대조군 보존.
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScanExamples from "./ScanExamples";

describe("ScanExamples", () => {
  it("5개의 예시 칩을 버튼으로 렌더한다", () => {
    const { container } = render(<ScanExamples onPick={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    const vals = Array.from(container.querySelectorAll(".se-chip-val")).map((e) => e.textContent);
    expect(vals).toContain("secure-tosspay.info");
    expect(vals).toContain("kbstar-otp.live");
    expect(vals).toContain("naver.com");
    expect(vals).toContain("070-8890-1234");
  });

  it("혼동문자 대조군: 시각상 동일한 naver 값 2개가 실제로는 다른 문자열이다", () => {
    // 키릴 'а'가 섞인 값과 라틴 값이 둘 다 존재해야 공격이 드러난다(라틴으로 '고치면' 실패).
    const { container } = render(<ScanExamples onPick={() => {}} />);
    const vals = Array.from(container.querySelectorAll(".se-chip-val")).map((e) => e.textContent ?? "");
    const naverLike = vals.filter((v) => /^n.ver\.com$/.test(v));
    expect(naverLike).toHaveLength(2);
    expect(new Set(naverLike).size).toBe(2); // 두 문자열이 서로 다르다
  });

  it("칩 클릭 시 해당 값으로 onPick을 호출한다", () => {
    const onPick = vi.fn();
    render(<ScanExamples onPick={onPick} />);
    const btn = screen.getByText("secure-tosspay.info").closest("button");
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(onPick).toHaveBeenCalledWith("secure-tosspay.info");
  });

  it("disabled면 모든 칩이 비활성화되어 클릭이 무시된다", () => {
    const onPick = vi.fn();
    render(<ScanExamples onPick={onPick} disabled />);
    const buttons = screen.getAllByRole("button");
    for (const b of buttons) {
      expect(b).toBeDisabled();
    }
    fireEvent.click(buttons[0]);
    expect(onPick).not.toHaveBeenCalled();
  });
});
