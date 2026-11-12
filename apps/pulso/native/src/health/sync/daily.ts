// One row of daily signals per local day, from HealthKit's daily statistics,
// sleep samples and the estimates for what Health left empty. Pure: the
// SwiftUI app's HealthMetrics.recentDays + HealthEstimates.
import type { z } from "zod";
import type { DailyMetricsInput } from "@/contract";
import { dayStart, nightEndingAt } from "./days";
import { SLEEP_VALUE, type HealthSleepSample } from "./mapping";

export type DailyRow = z.input<typeof DailyMetricsInput>;

/** The statistics per day the engine stores; sums for activity, averages for the rest. */
export const DAILY_METRICS = {
  steps: { type: "HKQuantityTypeIdentifierStepCount", unit: "count", sum: true },
  activeEnergy: { type: "HKQuantityTypeIdentifierActiveEnergyBurned", unit: "kcal", sum: true },
  exerciseMinutes: { type: "HKQuantityTypeIdentifierAppleExerciseTime", unit: "min", sum: true },
  restingHeartRate: { type: "HKQuantityTypeIdentifierRestingHeartRate", unit: "count/min", sum: false },
  hrv: { type: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", unit: "ms", sum: false },
  vo2max: { type: "HKQuantityTypeIdentifierVO2Max", unit: "ml/kg*min", sum: false },
  respiratoryRate: { type: "HKQuantityTypeIdentifierRespiratoryRate", unit: "count/min", sum: false },
} as const;
export type DailyMetric = keyof typeof DAILY_METRICS;
export type DailyStats = Record<DailyMetric, Record<string, number>>;

export type HeartSample = { at: number; bpm: number };
type Interval = [start: number, end: number];

const ASLEEP: ReadonlySet<number> = new Set([SLEEP_VALUE.asleepUnspecified, SLEEP_VALUE.asleepCore, SLEEP_VALUE.asleepDeep, SLEEP_VALUE.asleepREM]);

/** Milliseconds covered by the intervals, overlaps counted once. */
export function union(intervals: readonly Interval[]): number {
  let total = 0;
  let current: Interval | null = null;
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    if (current && start <= current[1]) current = [current[0], Math.max(current[1], end)];
    else {
      if (current) total += current[1] - current[0];
      current = [start, end];
    }
  }
  return total + (current ? current[1] - current[0] : 0);
}

export type Night = { asleep: number; deep: number | null; core: number | null; rem: number | null; awake: number | null };

/** Groups samples into nights (by the morning they end on) and sums each stage in minutes; iPhone and Watch overlapping count once. */
export function nights(samples: readonly HealthSleepSample[]): Map<string, Night> {
  const byNight = new Map<string, HealthSleepSample[]>();
  for (const s of samples) {
    const key = nightEndingAt(s.end);
    byNight.set(key, [...(byNight.get(key) ?? []), s]);
  }
  const out = new Map<string, Night>();
  for (const [key, night] of byNight) {
    const minutes = (values: ReadonlySet<number>) => {
      const intervals = night.filter((s) => values.has(s.value)).map((s): Interval => [s.start.getTime(), s.end.getTime()]);
      return intervals.length ? union(intervals) / 60_000 : null;
    };
    const asleep = minutes(ASLEEP);
    if (asleep === null) continue;
    const deep = minutes(new Set([SLEEP_VALUE.asleepDeep]));
    const core = minutes(new Set([SLEEP_VALUE.asleepCore]));
    const rem = minutes(new Set([SLEEP_VALUE.asleepREM]));
    const staged = deep !== null || core !== null || rem !== null;
    out.set(key, {
      asleep,
      deep: staged ? (deep ?? 0) : null,
      core: staged ? (core ?? 0) : null,
      rem: staged ? (rem ?? 0) : null,
      awake: minutes(new Set([SLEEP_VALUE.awake])),
    });
  }
  return out;
}

/** The time actually asleep, any source or stage, per night. */
export function asleepIntervals(samples: readonly HealthSleepSample[]): Map<string, Interval[]> {
  const out = new Map<string, Interval[]>();
  for (const s of samples) {
    if (!ASLEEP.has(s.value)) continue;
    const key = nightEndingAt(s.end);
    out.set(key, [...(out.get(key) ?? []), [s.start.getTime(), s.end.getTime()]]);
  }
  return out;
}

/** Length of the rolling average. */
const WINDOW_MS = 300_000;
/** Fewest samples worth trusting: asleep (the Watch samples every few minutes) and over a whole day. */
const MIN_SLEEP_SAMPLES = 6;
const MIN_DAY_SAMPLES = 20;

function lowestRollingAverage(sorted: readonly HeartSample[]): number | null {
  let lowest: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i; j < sorted.length && sorted[j]!.at - sorted[i]!.at <= WINDOW_MS; j++, n++) sum += sorted[j]!.bpm;
    const mean = sum / n;
    lowest = lowest === null ? mean : Math.min(lowest, mean);
  }
  return lowest;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (rank - lower);
}

/**
 * Apple derives resting heart rate from daytime Watch wear, so a Watch worn only
 * at night leaves it empty: the lowest 5-minute average while asleep, else the
 * 5th percentile of the day's samples; null with too few of either.
 */
export function estimatedRestingHeartRate(samples: readonly HeartSample[], asleep: readonly Interval[], day: Interval): number | null {
  const overnight = samples.filter((s) => asleep.some(([a, b]) => s.at >= a && s.at <= b)).sort((a, b) => a.at - b.at);
  if (overnight.length >= MIN_SLEEP_SAMPLES) {
    const lowest = lowestRollingAverage(overnight);
    if (lowest !== null) return lowest;
  }
  const daytime = samples.filter((s) => s.at >= day[0] && s.at < day[1]);
  return daytime.length >= MIN_DAY_SAMPLES ? percentile(daytime.map((s) => s.bpm), 0.05) : null;
}

/** Minutes of workouts inside `day`, overlapping sessions (two apps recording one) counted once; null when none. */
export function workoutMinutes(workouts: readonly Interval[], day: Interval): number | null {
  const inside = workouts.map(([a, b]): Interval => [Math.max(a, day[0]), Math.min(b, day[1])]).filter(([a, b]) => b > a);
  return inside.length ? union(inside) / 60_000 : null;
}

export const dayInterval = (key: string): Interval => {
  const start = dayStart(key);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()];
};

/** The window whose heart samples estimate `key`'s resting rate: from the noon before (the night ending that day). */
export const restingWindow = (key: string): Interval => {
  const [start, end] = dayInterval(key);
  return [start - 12 * 3_600_000, end];
};

export type DailyInputs = {
  /** The days to send, oldest first. */
  days: readonly string[];
  stats: DailyStats;
  sleep: readonly HealthSleepSample[];
  /** Heart-rate samples covering `restingWindow` of each day without a measured resting rate. */
  heart: readonly HeartSample[];
  workouts: readonly Interval[];
};

/** Days with no measured resting heart rate: their raw heart samples are read for an estimate. */
export const daysWithoutRestingRate = (days: readonly string[], stats: DailyStats): string[] => days.filter((d) => stats.restingHeartRate[d] === undefined);

/** One row per day that has any data; estimates fill and flag what Health left empty. */
export function dailyRows({ days, stats, sleep, heart, workouts }: DailyInputs): DailyRow[] {
  const n = nights(sleep);
  const asleep = asleepIntervals(sleep);
  const rows: DailyRow[] = [];
  for (const date of days) {
    const day = dayInterval(date);
    let restingHeartRate: number | null = stats.restingHeartRate[date] ?? null;
    let restingHeartRateEstimated: boolean | null = null;
    if (restingHeartRate === null) {
      const [from, to] = restingWindow(date);
      restingHeartRate = estimatedRestingHeartRate(heart.filter((s) => s.at >= from && s.at < to), asleep.get(date) ?? [], day);
      if (restingHeartRate !== null) restingHeartRateEstimated = true;
    }
    let exerciseMinutes: number | null = stats.exerciseMinutes[date] ?? null;
    let exerciseMinutesEstimated: boolean | null = null;
    if (exerciseMinutes === null) {
      exerciseMinutes = workoutMinutes(workouts, day);
      if (exerciseMinutes !== null) exerciseMinutesEstimated = true;
    }
    const night = n.get(date);
    const row: DailyRow = {
      date,
      steps: stats.steps[date] ?? null,
      activeEnergy: stats.activeEnergy[date] ?? null,
      exerciseMinutes,
      exerciseMinutesEstimated,
      restingHeartRate,
      restingHeartRateEstimated,
      hrv: stats.hrv[date] ?? null,
      sleepMinutes: night?.asleep ?? null,
      sleepDeep: night?.deep ?? null,
      sleepCore: night?.core ?? null,
      sleepRem: night?.rem ?? null,
      sleepAwake: night?.awake ?? null,
      vo2max: stats.vo2max[date] ?? null,
      respiratoryRate: stats.respiratoryRate[date] ?? null,
    };
    const { date: _, exerciseMinutesEstimated: __, restingHeartRateEstimated: ___, ...values } = row;
    if (Object.values(values).some((v) => v !== null && v !== undefined)) rows.push(row);
  }
  return rows;
}
