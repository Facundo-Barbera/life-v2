import { describe, expect, test } from "bun:test";
import { addDays } from "./dates";
import { buildSummary, MIN_SAMPLE, nightOfUse, type NightSignals, type SubstanceUse as SubstanceEntry, weekStartOf as weekStart } from "./substances";

// Thursday; its week starts Monday 2026-09-28 and the 8-week window on 2026-08-10.
const TODAY = "2026-10-01";
const FROM = "2026-08-10";

let n = 0;
const use = (date: string, time: string, amount: SubstanceEntry["amount"] = "normal"): SubstanceEntry => ({
  id: String(++n),
  substanceId: "cannabis",
  date,
  time,
  form: "fumado",
  amount,
  quantity: null,
  thcMg: null,
  context: null,
  note: null,
  usedAt: "",
});

/** Friday 22:00 and the small hours of Saturday every week, plus a Tuesday this week. */
function weekendPattern(): SubstanceEntry[] {
  const entries: SubstanceEntry[] = [];
  for (let week = 0; week < 7; week++) {
    const monday = addDays(FROM, 7 * week);
    entries.push(use(addDays(monday, 4), "22:00"), use(addDays(monday, 5), "01:00", "poco"));
  }
  entries.push(use("2026-09-29", "21:00", "mucho"));
  return entries;
}

function nights(from: string, signals: (night: string) => Partial<NightSignals>): NightSignals[] {
  const out: NightSignals[] = [];
  for (let night = from; night <= TODAY; night = addDays(night, 1)) {
    out.push({ night, sleepMinutes: null, sleepScore: null, hrv: null, restingHr: null, readiness: null, lateEating: null, ...signals(night) });
  }
  return out;
}

const isSaturdayOrUsed = (night: string) => new Date(`${night}T12:00:00Z`).getUTCDay() === 6 || night === "2026-09-30";

describe("nightOfUse", () => {
  test("noon to 05:59 belongs to the night ending next morning; a morning use has none", () => {
    expect(nightOfUse("2026-09-25", "22:00")).toBe("2026-09-26");
    expect(nightOfUse("2026-09-25", "12:00")).toBe("2026-09-26");
    expect(nightOfUse("2026-09-26", "01:00")).toBe("2026-09-26");
    expect(nightOfUse("2026-09-26", "09:00")).toBeNull();
  });
});

describe("buildSummary", () => {
  const entries = weekendPattern();
  const summary = buildSummary({
    substanceId: "cannabis",
    today: TODAY,
    entries,
    firstUse: entries[0]!.date,
    lastUse: { date: "2026-09-29", time: "21:00" },
    maxDaysPerWeek: 2,
    // Starts before the first use: those nights must not count as "without".
    nights: nights("2026-08-01", (night) => (isSaturdayOrUsed(night) ? { sleepMinutes: 400, hrv: 40 } : { sleepMinutes: 450, hrv: 50 })),
  });

  test("the heatmap runs Monday-aligned from 7 weeks ago to today, with the largest amount per day", () => {
    expect(weekStart(TODAY)).toBe("2026-09-28");
    expect(summary.days[0]!.date).toBe(FROM);
    expect(summary.days.at(-1)!.date).toBe(TODAY);
    expect(summary.days).toHaveLength(53);
    const day = (date: string) => summary.days.find((d) => d.date === date)!;
    expect(day("2026-08-14")).toEqual({ date: "2026-08-14", uses: 1, level: 2 });
    expect(day("2026-08-15")).toEqual({ date: "2026-08-15", uses: 1, level: 1 });
    expect(day("2026-09-29")).toEqual({ date: "2026-09-29", uses: 1, level: 3 });
    expect(day("2026-08-12").level).toBe(0);
  });

  test("days per week, average over full weeks, streaks and time of day", () => {
    expect(summary.weeks.map((w) => w.days)).toEqual([2, 2, 2, 2, 2, 2, 2, 1]);
    expect(summary.weeks[7]!.weekStart).toBe("2026-09-28");
    expect(summary.avgDaysPerWeek).toBe(2);
    expect(summary.daysThisWeek).toBe(1);
    expect(summary.daysWithout).toBe(2);
    expect(summary.longestWithout).toBe(5);
    expect(Object.fromEntries(summary.timeOfDay.map((b) => [b.key, b.uses]))).toEqual({ manana: 0, tarde: 0, noche: 8, madrugada: 7 });
    expect(summary.byForm).toEqual([{ form: "fumado", uses: 15 }]);
    expect(summary.goal).toEqual({ maxDaysPerWeek: 2, daysThisWeek: 1, within: true });
  });

  test("soft comparisons carry sample sizes and neutral wording", () => {
    const sleep = summary.correlations.find((c) => c.key === "sleep_minutes")!;
    expect(sleep).toMatchObject({ withUse: 400, withoutUse: 450, diff: -50, nWith: 8, nWithout: 41, enough: true });
    expect(sleep.text).toBe("En noches con consumo dormiste 50 min menos en promedio (8 con · 41 sin)");
    expect(summary.correlations.find((c) => c.key === "hrv")!.text).toBe("Tras noches con consumo tu VFC fue 10 ms más baja en promedio (8 con · 41 sin)");
    const readiness = summary.correlations.find((c) => c.key === "readiness")!;
    expect(readiness).toMatchObject({ nWith: 0, nWithout: 0, enough: false, text: null, diff: null });
  });

  test("too few nights on one side says nothing", () => {
    const few = buildSummary({
      substanceId: "cannabis",
      today: TODAY,
      entries: [use("2026-09-29", "21:00")],
      firstUse: "2026-09-29",
      lastUse: { date: "2026-09-29", time: "21:00" },
      maxDaysPerWeek: 0,
      nights: nights(FROM, () => ({ sleepMinutes: 420, lateEating: true })),
    });
    const sleep = few.correlations.find((c) => c.key === "sleep_minutes")!;
    expect(sleep.nWith).toBeLessThan(MIN_SAMPLE);
    expect(sleep.enough).toBe(false);
    expect(sleep.text).toBeNull();
    expect(few.avgDaysPerWeek).toBeNull();
    expect(few.goal).toEqual({ maxDaysPerWeek: 0, daysThisWeek: 1, within: false });
  });

  test("late eating compares shares of nights", () => {
    const entries = weekendPattern();
    const late = buildSummary({
      substanceId: "cannabis",
      today: TODAY,
      entries,
      firstUse: entries[0]!.date,
      lastUse: { date: "2026-09-29", time: "21:00" },
      maxDaysPerWeek: null,
      nights: nights(FROM, (night) => ({ lateEating: isSaturdayOrUsed(night) ? night !== "2026-09-30" : night.endsWith("1") })),
    });
    const c = late.correlations.find((x) => x.key === "late_eating")!;
    expect(c.withUse).toBe(87.5);
    expect(c.text).toStartWith("Comiste después de las 22:00 en el 88 % de las noches con consumo y en el ");
  });

  test("nothing logged yet: no streak, no average, no comparisons", () => {
    const empty = buildSummary({ substanceId: "x", today: TODAY, entries: [], firstUse: null, lastUse: null, maxDaysPerWeek: null, nights: nights(FROM, () => ({ sleepMinutes: 420 })) });
    expect(empty.daysWithout).toBeNull();
    expect(empty.longestWithout).toBe(0);
    expect(empty.avgDaysPerWeek).toBeNull();
    expect(empty.goal).toBeNull();
    expect(empty.correlations.every((c) => c.nWith === 0 && c.nWithout === 0)).toBe(true);
  });
});
