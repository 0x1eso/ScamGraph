// lib/api.ts 단위 테스트 — 데모 세이프의 핵심(어떤 실패에도 시드/폴백으로 안전 응답)을 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchJson,
  getFeedStats,
  seedFeedStats,
  scan,
  getStats,
  GATEWAY,
} from "@/lib/api";

// fetch를 테스트마다 교체 가능한 목으로 스텁한다.
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 최소 Response 유사 객체 생성 헬퍼.
function res(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("fetchJson", () => {
  it("200 응답이면 파싱한 JSON을 반환한다", async () => {
    fetchMock.mockResolvedValue(res({ hello: "world" }));
    const out = await fetchJson<{ hello: string }>("/api/x", { fallback: { hello: "fb" } });
    expect(out).toEqual({ hello: "world" });
  });

  it("GATEWAY 프리픽스 + init을 그대로 fetch에 전달한다", async () => {
    fetchMock.mockResolvedValue(res({}));
    const init = { cache: "no-store" as const };
    await fetchJson("/api/y?z=1", { fallback: {}, init });
    expect(fetchMock).toHaveBeenCalledWith(`${GATEWAY}/api/y?z=1`, init);
  });

  it("비200 응답이면 예외 없이 fallback을 반환한다", async () => {
    fetchMock.mockResolvedValue(res(null, false, 503));
    const fallback = { seed: true };
    await expect(fetchJson("/api/x", { fallback })).resolves.toBe(fallback);
  });

  it("네트워크 실패(reject)여도 예외 없이 fallback을 반환한다", async () => {
    fetchMock.mockRejectedValue(new Error("gateway down"));
    const fallback = { seed: true };
    await expect(fetchJson("/api/x", { fallback })).resolves.toBe(fallback);
  });

  it("JSON 파싱 실패여도 fallback을 반환한다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("broken");
      },
    } as unknown as Response);
    const fallback = { seed: true };
    await expect(fetchJson("/api/x", { fallback })).resolves.toBe(fallback);
  });
});

describe("getFeedStats", () => {
  it("게이트웨이가 죽으면 시드 스냅샷으로 폴백한다", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const out = await getFeedStats();
    const seed = seedFeedStats();
    expect(out.total_indicators).toBe(seed.total_indicators);
    expect(out.sources.map((s) => s.id)).toEqual(seed.sources.map((s) => s.id));
  });

  it("비200이면 시드 스냅샷으로 폴백한다", async () => {
    fetchMock.mockResolvedValue(res(null, false, 500));
    const out = await getFeedStats();
    expect(out.total_indicators).toBe(seedFeedStats().total_indicators);
  });

  it("정상 응답이면 게이트웨이 값을 그대로 반환한다", async () => {
    const live = { sources: [], total_indicators: 999, updated_at: "2026-07-11T00:00:00Z" };
    fetchMock.mockResolvedValue(res(live));
    await expect(getFeedStats()).resolves.toEqual(live);
  });
});

describe("scan", () => {
  it("느슨한 /api/check 응답을 표시용 ScanResult로 정규화한다", async () => {
    // grade/kind가 이상값이고 risk_score/reasons가 잘못된 타입으로 와도 안전하게 좁혀야 한다.
    fetchMock.mockResolvedValue(
      res({
        value: "shinhan-otp.xyz",
        kind: "weird",
        grade: "unknown",
        risk_score: "not-a-number",
        reasons: "not-an-array",
      }),
    );
    const out = await scan("shinhan-otp.xyz");
    expect(out.target).toBe("shinhan-otp.xyz");
    expect(out.kind).toBe("url"); // 알 수 없는 kind → url
    expect(out.grade).toBe("caution"); // 표시 불가 grade → caution
    expect(out.risk_score).toBe(0); // 숫자가 아니면 0
    expect(out.reasons).toEqual([]); // 배열이 아니면 빈 배열
    expect(out.job_id).toBeNull();
  });

  it("정상 등급/유형은 그대로 보존한다", async () => {
    fetchMock.mockResolvedValue(
      res({
        value: "cj-delivery-check.top",
        kind: "url",
        grade: "danger",
        risk_score: 92,
        reasons: [{ rule: "external_feed_hit", weight: 40, detail: "등재" }],
      }),
    );
    const out = await scan("cj-delivery-check.top");
    expect(out.grade).toBe("danger");
    expect(out.risk_score).toBe(92);
    expect(out.reasons).toHaveLength(1);
  });

  it("비200이면 예외를 던진다(호출측이 시드 폴백을 담당)", async () => {
    fetchMock.mockResolvedValue(res(null, false, 502));
    await expect(scan("x")).rejects.toThrow();
  });
});

describe("getStats", () => {
  it("정상 응답을 반환한다", async () => {
    const stats = {
      tracked_entities: 1,
      graph_relations: 2,
      scans_today: 3,
      confirmed_threats: 4,
    };
    fetchMock.mockResolvedValue(res(stats));
    await expect(getStats()).resolves.toEqual(stats);
  });

  it("비200이면 예외를 던진다(StatsBar가 마지막 값 유지)", async () => {
    fetchMock.mockResolvedValue(res(null, false, 500));
    await expect(getStats()).rejects.toThrow();
  });
});
