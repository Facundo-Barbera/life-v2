import { describe, expect, test } from "bun:test";
import type { Sleep } from "../types";
import { addDays } from "./dates";
import { checkManual, clockOf, describeNights, formatDuration, nightFromRow, nightOf, pickNights, regularity, resolveManualTimes, scoreNight, summarize } from "./sleep";

const TZ = "America/Mexico_City"; // UTC−6, no DST
const iso = (date: string, localMin: number) => new Date(Date.parse(`${date}T00:00:00Z`) + (localMin + 360) * 60_000).toISOString();

type Shape = { bed?: number; core?: number; deep?: number; rem?: number; awake?: number; source?: "manual" | "healthkit" };
function row(night: string, { bed = -60, core = 270, deep = 80, rem = 110, awake = 20, source = "healthkit" }: Shape = {}): Pick<Sleep, "id" | "started_at" | "ended_at" | "source" | "night" | "asleep_min" | "stages" | "segments" | "notes"> {
  const asleep = core + deep + rem;
  const manual = source === "manual";
  return {
    id: `${night}-${source}`,
    started_at: iso(night, bed),
    ended_at: iso(night, bed + asleep + (manual ? 0 : awake)),
    source,
    night,
    asleep_min: asleep,
    stages: manual ? {} : { core, deep, rem, awake },
    segments: [],
    notes: null,
  };
}
const nights = (first: string, count: number, shape: (i: number) => Shape = () => ({})) => Array.from({ length: count }, (_, i) => nightFromRow(row(addDays(first, i), shape(i)), TZ));

describe("nights", () => {
  test("named after the local day you wake up, 18:00 → 18:00", () => {
    expect(nightOf(Date.parse(iso("2026-01-02", -60)), -360)).toBe("2026-01-02");
    expect(nightOf(Date.parse(iso("2026-01-02", 19 * 60)), -360)).toBe("2026-01-03");
  });
  test("totals, efficiency, stage shares and local clock times from a row", () => {
    const n = nightFromRow(row("2026-01-02", { core: 240, deep: 90, rem: 120, awake: 30 }), TZ);
    expect(n.minutes).toEqual({ inBed: 480, asleep: 450, awake: 30, core: 240, deep: 90, rem: 120, unspecified: 0 });
    expect(n.efficiency).toBeCloseTo(450 / 480);
    expect(n.stagePct!.deep).toBeCloseTo(0.2);
    expect(n.bedtimeMin).toBe(-60);
    expect(clockOf(n.bedtimeMin)).toBe("23:00");
  });
  test("Health beats a manual night for the same date", () => {
    const picked = pickNights([nightFromRow(row("2026-01-02", { source: "manual" }), TZ), nightFromRow(row("2026-01-02"), TZ), nightFromRow(row("2026-01-03", { source: "manual" }), TZ)]);
    expect(picked.map((n) => `${n.night}:${n.source}`)).toEqual(["2026-01-02:healthkit", "2026-01-03:manual"]);
  });
});

describe("score and summary", () => {
  test("a full, efficient, regular night scores high", () => {
    const all = nights("2026-01-01", 5, () => ({ core: 280, deep: 90, rem: 120 }));
    const score = scoreNight(all.at(-1)!, all.slice(0, -1), 480);
    expect(score.value).toBeGreaterThanOrEqual(90);
    expect(score.factors.map((f) => f.key)).toEqual(["duration", "efficiency", "restoration", "consistency"]);
    expect(score.explanation).toStartWith("Buena noche");
  });
  test("a short night is explained by its duration; manual nights skip efficiency", () => {
    const [n] = nights("2026-01-01", 1, () => ({ core: 200, deep: 60, rem: 70 }));
    expect(scoreNight(n!, [], 480).explanation).toContain("menos que tu objetivo");
    const [m] = nights("2026-01-01", 1, () => ({ source: "manual" }));
    expect(scoreNight(m!, [], 480).factors.map((f) => f.key)).toEqual(["duration"]);
  });
  test("debt, regularity and newest-first", () => {
    const described = describeNights(nights("2026-01-01", 7, () => ({ core: 240, deep: 60, rem: 60 })), 480);
    expect(described[0]!.night).toBe("2026-01-07");
    const s = summarize(described, 480, 14);
    expect(s.nights).toBe(7);
    expect(s.debtMin).toBe(7 * 120);
    expect(s.insights[0]).toContain("deuda");
    expect(regularity(described)).toBe(100);
  });
  test("formatDuration", () => {
    expect(formatDuration(440)).toBe("7 h 20 min");
    expect(formatDuration(45)).toBe("45 min");
  });
});

describe("manual nights", () => {
  test("a bedtime later than the wake clock is the evening before", () => {
    const { start, end } = resolveManualTimes("2026-01-02", "23:30", "07:00", TZ);
    expect(new Date(start).toISOString()).toBe("2026-01-02T05:30:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-01-02T13:00:00.000Z");
    expect(checkManual(start, end, TZ, end + 1000).night).toBe("2026-01-02");
  });
  test("refuses short, long, reversed and future nights", () => {
    const t = Date.parse("2026-01-02T13:00:00Z");
    expect(() => checkManual(t, t - 1, TZ, t)).toThrow(/después/);
    expect(() => checkManual(t - 30 * 60_000, t, TZ, t)).toThrow(/entre 1 y 16/);
    expect(() => checkManual(t - 8 * 3_600_000, t, TZ, t - 3_600_000)).toThrow(/todavía no llegó/);
  });
});
