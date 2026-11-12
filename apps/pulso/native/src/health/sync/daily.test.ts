import { describe, expect, test } from "bun:test";
import { dailyRows, estimatedRestingHeartRate, nights, percentile, union, workoutMinutes, type DailyStats } from "./daily";
import { engineNight, nightEndingAt } from "./days";
import { activityName, bodySample, sleepSegmentInput, sourceKind, wantsHeartRateSeries, type HealthWorkout } from "./mapping";

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
const sleep = (start: Date, end: Date, value: number, sourceName = "Apple Watch") => ({ uuid: `${start.getTime()}-${value}`, start, end, value, sourceName, productType: "Watch7,1" });
const empty = (): DailyStats => ({ steps: {}, activeEnergy: {}, exerciseMinutes: {}, restingHeartRate: {}, hrv: {}, vo2max: {}, respiratoryRate: {} });

describe("daily signals", () => {
  test("union counts overlaps once", () => {
    expect(union([[0, 10], [5, 20], [30, 40]])).toBe(30);
    expect(union([])).toBe(0);
  });

  test("a night merges the phone and the Watch and keeps stages only when some source has them", () => {
    const t0 = at(20, 23);
    const n = nights([
      sleep(t0, at(21, 2), 3),
      sleep(at(21, 2), at(21, 3), 4),
      sleep(t0, at(21, 3), 1, "iPhone"),
      sleep(at(20, 22), at(21, 4), 0),
    ]).get("2026-10-21")!;
    expect(n).toEqual({ asleep: 240, deep: 60, core: 180, rem: 0, awake: null });
    expect(nights([sleep(t0, at(21, 6), 1)]).get("2026-10-21")).toEqual({ asleep: 420, deep: null, core: null, rem: null, awake: null });
  });

  test("resting rate: lowest 5-minute average asleep, else the day's 5th percentile, else nothing", () => {
    const base = at(21, 2).getTime();
    const overnight = [60, 58, 52, 50, 51, 62, 64].map((bpm, i) => ({ at: base + i * 150_000, bpm }));
    const asleep: [number, number][] = [[base - 1, base + 3_600_000]];
    const day: [number, number] = [at(21, 0).getTime(), at(22, 0).getTime()];
    expect(estimatedRestingHeartRate(overnight, asleep, day)).toBeCloseTo((52 + 50 + 51) / 3);
    const daytime = Array.from({ length: 21 }, (_, i) => ({ at: at(21, 10).getTime() + i * 60_000, bpm: 60 + i }));
    expect(estimatedRestingHeartRate(daytime, [], day)).toBe(61);
    expect(estimatedRestingHeartRate(daytime.slice(0, 5), [], day)).toBeNull();
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  test("workout minutes clip to the day and count two apps recording one session once", () => {
    const day: [number, number] = [at(21, 0).getTime(), at(22, 0).getTime()];
    const a: [number, number] = [at(21, 10).getTime(), at(21, 11).getTime()];
    const b: [number, number] = [at(21, 10, 30).getTime(), at(21, 11, 30).getTime()];
    const yesterday: [number, number] = [at(20, 23, 30).getTime(), at(21, 0, 30).getTime()];
    expect(workoutMinutes([a, b, yesterday], day)).toBe(120);
    expect(workoutMinutes([], day)).toBeNull();
  });

  test("rows: measured values win, estimates are flagged, empty days left out", () => {
    const stats = empty();
    stats.steps["2026-10-21"] = 4000;
    stats.restingHeartRate["2026-10-20"] = 55;
    const rows = dailyRows({
      days: ["2026-10-19", "2026-10-20", "2026-10-21"],
      stats,
      sleep: [],
      heart: [],
      workouts: [[at(21, 7).getTime(), at(21, 7, 45).getTime()]],
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(rows[0]).toMatchObject({ restingHeartRate: 55, restingHeartRateEstimated: null });
    expect(rows[1]).toMatchObject({ steps: 4000, exerciseMinutes: 45, exerciseMinutesEstimated: true, restingHeartRate: null });
  });
});

describe("mapping", () => {
  test("activity names match the SwiftUI app's", () => {
    expect(activityName(37)).toBe("running");
    expect(activityName(50)).toBe("strength");
    expect(activityName(2)).toBe("other_2");
  });

  test("sleep samples carry their stage, source kind and offset; unknown values are dropped", () => {
    const s = sleepSegmentInput({ uuid: "a", start: at(20, 23), end: at(21, 7), value: 5, sourceName: "Apple Watch", productType: "Watch7,1" })!;
    expect(s).toMatchObject({ stage: "rem", sourceKind: "watch", tzOffsetMin: -at(20, 23).getTimezoneOffset() });
    expect(sleepSegmentInput({ uuid: "b", start: at(20, 23), end: at(21, 7), value: 9, sourceName: "x", productType: null })).toBeNull();
    expect(sourceKind("iPhone17,2")).toBe("phone");
    expect(sourceKind(null)).toBe("other");
  });

  test("body fat goes as a percentage, two decimals", () => {
    expect(bodySample({ uuid: "f", start: at(21, 8), end: at(21, 8), value: 0.18456 }, "percentBodyFat")!.value).toBe(18.46);
    expect(bodySample({ uuid: "w", start: at(21, 8), end: at(21, 8), value: 0 }, "weight")).toBeNull();
  });

  test("only recent, short, foreign workouts get a heart-rate series", () => {
    const now = at(21, 12);
    const w: HealthWorkout = { uuid: "w", activityType: 50, start: at(21, 9), end: at(21, 10), energy: null, distance: null, sourceBundle: "com.apple.health", sourceName: "Watch", externalRef: null, avgHeartRate: null, maxHeartRate: null };
    expect(wantsHeartRateSeries(w, now)).toBe(true);
    expect(wantsHeartRateSeries({ ...w, sourceBundle: "com.facundo.pulso" }, now)).toBe(false);
    expect(wantsHeartRateSeries({ ...w, start: at(10, 9), end: at(10, 10) }, now)).toBe(false);
    expect(wantsHeartRateSeries({ ...w, end: at(21, 14) }, now)).toBe(false);
  });

  test("nights: the daily metrics by wake-up morning, the engine's by start (18:00 → 18:00)", () => {
    expect(nightEndingAt(at(21, 7))).toBe("2026-10-21");
    expect(nightEndingAt(at(20, 19))).toBe("2026-10-21");
    expect(engineNight(at(20, 23))).toBe("2026-10-21");
    expect(engineNight(at(21, 1))).toBe("2026-10-21");
    expect(engineNight(at(21, 17))).toBe("2026-10-21");
  });
});
