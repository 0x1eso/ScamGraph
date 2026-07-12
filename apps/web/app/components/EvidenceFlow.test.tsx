// EvidenceFlow 테스트 — 근거(reasons) 순서 보존 + 가중치 워터폴/부호 표기 + 빈 상태.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import EvidenceFlow from "./EvidenceFlow";
import type { ScanResult } from "@/lib/api";

function makeResult(reasons: ScanResult["reasons"]): ScanResult {
  return {
    target: "shinhan-otp.xyz",
    job_id: null,
    kind: "url",
    risk_score: 88,
    grade: "danger",
    reasons,
  };
}

describe("EvidenceFlow", () => {
  it("흐름 레일에 입력·유형·히트 수·최종 등급을 표시한다", () => {
    render(
      <EvidenceFlow
        result={makeResult([{ rule: "brand_impersonation", weight: 25, detail: "사칭" }])}
      />,
    );
    expect(screen.getByText("shinhan-otp.xyz")).toBeInTheDocument();
    expect(screen.getByText("URL")).toBeInTheDocument();
    expect(screen.getByText("1건")).toBeInTheDocument();
    expect(screen.getByText("위험 · 88")).toBeInTheDocument();
  });

  it("reasons를 입력 순서 그대로 워터폴 세그먼트/칩으로 렌더한다", () => {
    const { container } = render(
      <EvidenceFlow
        result={makeResult([
          { rule: "external_feed_hit", weight: 40, detail: "피드 등재" },
          { rule: "brand_impersonation", weight: 25, detail: "브랜드 사칭" },
          { rule: "known_safe_tld", weight: -10, detail: "정상 신호" },
        ])}
      />,
    );

    // 세그먼트 수 = 근거 수.
    expect(container.querySelectorAll(".evf-seg")).toHaveLength(3);

    // 칩의 규칙명이 입력 순서를 보존한다.
    const rules = Array.from(container.querySelectorAll(".evf-chip-rule")).map((e) => e.textContent);
    expect(rules).toEqual(["external_feed_hit", "brand_impersonation", "known_safe_tld"]);

    // 부호 표기: 양수는 "+", 음수는 "-".
    const weights = Array.from(container.querySelectorAll(".evf-chip-w")).map((e) => e.textContent);
    expect(weights).toEqual(["+40", "+25", "-10"]);

    // 부호로 위험/안전 톤을 나눈다(양수 → risk, 음수 → safe).
    expect(container.querySelectorAll(".evf-seg-risk")).toHaveLength(2);
    expect(container.querySelectorAll(".evf-seg-safe")).toHaveLength(1);
  });

  it("근거가 없으면 정상 판정 안내를 보여주고 워터폴을 그리지 않는다", () => {
    const { container } = render(<EvidenceFlow result={makeResult([])} />);
    expect(screen.getByText(/감지된 위험 신호 없음/)).toBeInTheDocument();
    expect(container.querySelectorAll(".evf-seg")).toHaveLength(0);
  });
});
