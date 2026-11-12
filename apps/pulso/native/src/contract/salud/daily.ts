/**
 * Pulso's daily Apple Health signals and readiness («Hoy»'s data), ported from
 * `@pulso/contract` `daily.ts` as zod: each type keeps its Pulso name.
 */
import { z } from "zod";
import { op } from "./operation";

const isRealDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/** Local calendar date, `YYYY-MM-DD`. */
export const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").refine(isRealDate, "expected YYYY-MM-DD").describe("A local calendar date, YYYY-MM-DD");
export type DateString = string;

const metric = (description: string) => z.number().nullable().describe(description);

/**
 * One day of Apple Health signals. Every metric is nullable: a day can lack
 * any of them (no watch worn, no sleep tracked). Sleep belongs to the morning
 * it ends on, so `date`'s sleep is "last night".
 */
export const DailyMetrics = z.object({
  date: DateString,
  steps: metric("steps"),
  activeEnergy: metric("kcal"),
  exerciseMinutes: metric("minutes"),
  /** true when the phone summed workout durations because Health had no Apple exercise time */
  exerciseMinutesEstimated: z.boolean(),
  restingHeartRate: metric("bpm"),
  /** true when the phone estimated it from heart-rate samples because Health had no resting heart rate */
  restingHeartRateEstimated: z.boolean(),
  hrv: metric("HRV, SDNN in ms"),
  sleepMinutes: metric("minutes asleep, all stages"),
  sleepDeep: metric("minutes"),
  sleepCore: metric("minutes"),
  sleepRem: metric("minutes"),
  sleepAwake: metric("minutes"),
  /** Engine → clients only: true when `sleepMinutes` is a night the person logged by hand because Health had no sleep for it (no stages then). */
  sleepManual: z.boolean().optional(),
  vo2max: metric("mL/kg/min"),
  respiratoryRate: metric("breaths/min"),
  /** epoch ms of the last write */
  updatedAt: z.number(),
});
export type DailyMetrics = z.infer<typeof DailyMetrics>;

const reading = z.number().min(0).nullable().optional();

/**
 * What the phone sends. Missing or null fields keep what the engine already had.
 * An `...Estimated` flag only applies together with its value; a missing one means false.
 */
export const DailyMetricsInput = z.object({
  date: DateString,
  steps: reading,
  activeEnergy: reading,
  exerciseMinutes: reading,
  exerciseMinutesEstimated: z.boolean().nullable().optional(),
  restingHeartRate: reading,
  restingHeartRateEstimated: z.boolean().nullable().optional(),
  hrv: reading,
  sleepMinutes: reading,
  sleepDeep: reading,
  sleepCore: reading,
  sleepRem: reading,
  sleepAwake: reading,
  vo2max: reading,
  respiratoryRate: reading,
});
/** The parsed day the store writes: every metric present (null = keep), flags resolved. */
export type DailyMetricsInput = Omit<DailyMetrics, "updatedAt" | "sleepManual">;

export const ReadinessFactorKey = z.enum(["hrv", "resting_hr", "sleep"]);
export type ReadinessFactorKey = z.infer<typeof ReadinessFactorKey>;

export const ReadinessFactor = z.object({
  key: ReadinessFactorKey,
  /** Spanish label for the UI */
  label: z.string(),
  /** today's value: ms, bpm or minutes */
  value: z.number().nullable(),
  /** 28-day mean (ms, bpm) or the sleep target in minutes */
  baseline: z.number().nullable(),
  /** 0–100, null when there is not enough data */
  score: z.number().nullable(),
  /** Spanish, e.g. "12% por encima de tu media" */
  detail: z.string(),
  /** today's value is an estimate; it counts for a little less in the score */
  estimated: z.boolean(),
});
export type ReadinessFactor = z.infer<typeof ReadinessFactor>;

export const Readiness = z.object({
  date: DateString,
  /** 0–100, null when no factor has data */
  score: z.number().nullable(),
  level: z.enum(["high", "medium", "low", "unknown"]),
  factors: z.array(ReadinessFactor),
  /** One Spanish line for the person */
  explanation: z.string(),
  /** days with HRV or resting HR in the 28-day baseline window */
  baselineDays: z.number(),
});
export type Readiness = z.infer<typeof Readiness>;

export const DailyResponse = z.object({ days: z.array(DailyMetrics), readiness: Readiness });
export type DailyResponse = z.infer<typeof DailyResponse>;

export const dailyOperations = {
  get_daily_metrics: op({
    name: "get_daily_metrics",
    description:
      "Daily Apple Health signals for local dates from–to (inclusive, max 90 days; default the last 7): steps; activeEnergy kcal; exerciseMinutes; restingHeartRate bpm; hrv ms (SDNN); " +
      "sleepMinutes, sleepDeep, sleepCore, sleepRem, sleepAwake in minutes (the night that ENDED that date; sleepManual = logged by hand, no stages); vo2max mL/kg/min; respiratoryRate breaths/min. " +
      "null = not measured; days without data are omitted. restingHeartRateEstimated / exerciseMinutesEstimated = estimated by the phone, approximate.",
    access: "read",
    method: "GET",
    path: "/daily/metrics",
    input: z.object({ from: DateString.optional(), to: DateString.optional() }),
    output: z.array(DailyMetrics),
  }),
  get_daily: op({
    name: "get_daily",
    description:
      "What the iPhone's Hoy and widgets load: the `days` (default 30, max 400) of Apple Health signals up to `to` (default today), oldest first, and readiness for `to`. Same fields as get_daily_metrics and get_readiness.",
    access: "read",
    method: "GET",
    path: "/daily",
    input: z.object({ to: DateString.optional(), days: z.number().int().min(1).max(400).default(30) }),
    output: DailyResponse,
  }),
  get_readiness: op({
    name: "get_readiness",
    description:
      "Readiness 0–100 for a local date (default today), level (high ≥75, medium ≥50, low), and factors: HRV (ms) and resting HR (bpm) vs their 28-day baseline, last night's sleep (minutes vs 8 h). " +
      "null score without data. With a Spanish one-line explanation. Check it before suggesting how hard to train today.",
    access: "read",
    method: "GET",
    path: "/daily/readiness",
    input: z.object({ date: DateString.optional() }),
    output: Readiness,
  }),
  sync_daily_metrics: op({
    name: "sync_daily_metrics",
    description:
      "The iPhone's Apple Health sync: up to 400 days of signals, upserted by date. A null or missing metric keeps the stored value, so a partial sync never erases an earlier one. Returns how many days were written. Not for logging by hand.",
    access: "write",
    method: "POST",
    path: "/daily",
    input: z.object({ days: z.array(DailyMetricsInput).max(400) }),
    output: z.object({ written: z.number() }),
    event: "daily.synced",
  }),
};
