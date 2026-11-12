import { describe, expect, test } from "bun:test";
import { formatTimer } from "./session";

describe("formatTimer", () => {
  test("counts a rest down, rounding up to the next second, and stops at zero", () => {
    expect(formatTimer({ mode: "down", endsAt: 86_000 }, 0)).toBe("1:26");
    expect(formatTimer({ mode: "down", endsAt: 1_500 }, 1_000)).toBe("0:01");
    expect(formatTimer({ mode: "down", endsAt: 1_000 }, 5_000)).toBe("0:00");
  });
  test("counts the session up, frozen while paused, with hours past 60 min", () => {
    expect(formatTimer({ mode: "up", startedAt: 0 }, 1_421_000)).toBe("23:41");
    expect(formatTimer({ mode: "up", startedAt: 0, pausedAt: 60_000 }, 999_000)).toBe("1:00");
    expect(formatTimer({ mode: "up", startedAt: 0 }, 3_730_000)).toBe("1:02:10");
  });
});
