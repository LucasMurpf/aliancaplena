import { afterEach, describe, expect, test, vi } from "vitest";
import { hojeSemente } from "../e2e/datas-semente";

afterEach(() => {
  vi.useRealTimers();
});

describe("hojeSemente (semente E2E)", () => {
  test("usa o dia de São Paulo, não o UTC (22h30 em SP = dia seguinte em UTC)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T01:30:00Z"));
    expect(hojeSemente()).toBe("2026-03-09");
  });

  test("no meio do dia coincide com o UTC", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
    expect(hojeSemente()).toBe("2026-03-10");
  });
});
