// HealthKit records → what the engine's sync operations accept. Pure: the
// SwiftUI app's HealthSync.input / SleepHealth.input / BodyHealth.sample.
import type { BodySample, HeartRatePoint, SleepSegmentInput, SleepStage, WorkoutInput } from "@/contract";
import { tzOffsetMin } from "./days";

/** A workout as read from HealthKit, reduced to plain values (healthkit-source.ts). */
export type HealthWorkout = {
  uuid: string;
  /** `HKWorkoutActivityType` raw value. */
  activityType: number;
  start: Date;
  end: Date;
  /** kcal */
  energy: number | null;
  /** meters: walking/running, else cycling, else swimming */
  distance: number | null;
  sourceBundle: string;
  sourceName: string;
  /** `HKMetadataKeyExternalUUID` */
  externalRef: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
};

/** `HKCategoryValueSleepAnalysis` raw value with its source. */
export type HealthSleepSample = { uuid: string; start: Date; end: Date; value: number; sourceName: string; productType: string | null };
export type HealthQuantitySample = { uuid: string; start: Date; end: Date; value: number };

/** Stable lowercase names for the engine; unlisted types keep their raw value (Swift's `activityName`). */
const ACTIVITY: Record<number, string> = {
  37: "running",
  52: "walking",
  24: "hiking",
  13: "cycling",
  46: "swimming",
  50: "strength",
  20: "functional_strength",
  63: "hiit",
  57: "yoga",
  35: "rowing",
  16: "elliptical",
  59: "core",
  62: "flexibility",
  11: "cross_training",
  41: "soccer",
  44: "stair_climbing",
  68: "stairs",
  73: "mixed_cardio",
  64: "jump_rope",
  80: "cooldown",
};
export const activityName = (type: number): string => ACTIVITY[type] ?? `other_${type}`;

/** Written by this app (Debug or Release) when a session ended; not the Watch app's, which records heart rate itself. */
export const PULSO_BUNDLES = ["com.facundo.pulso", "com.facundo.pulso.dev"];
export const isPulso = (w: Pick<HealthWorkout, "sourceBundle">): boolean => PULSO_BUNDLES.includes(w.sourceBundle);

/** Workouts this recent also carry their heart rate minute by minute (the session's chart on the Mac). */
export const SERIES_DAYS = 7;
/** Longer than this is a stuck recording, not a session: no series. */
export const SERIES_MAX_SECONDS = 4 * 3600;

export function wantsHeartRateSeries(w: HealthWorkout, now: Date): boolean {
  return (
    w.start.getTime() >= now.getTime() - SERIES_DAYS * 86_400_000 &&
    !isPulso(w) &&
    w.end.getTime() - w.start.getTime() <= SERIES_MAX_SECONDS * 1000
  );
}

const round = (n: number | null) => (n === null ? null : Math.round(n));

export function workoutInput(w: HealthWorkout, heartRate: HeartRatePoint[] | null): WorkoutInput {
  return {
    externalId: w.uuid,
    activity: activityName(w.activityType),
    startedAt: w.start.getTime(),
    endedAt: w.end.getTime(),
    energy: w.energy,
    distance: w.distance,
    sourceBundle: w.sourceBundle,
    sourceName: w.sourceName,
    externalRef: w.externalRef,
    avgHeartRate: round(w.avgHeartRate),
    maxHeartRate: round(w.maxHeartRate),
    ...(heartRate?.length ? { heartRate } : {}),
  };
}

/** `HKCategoryValueSleepAnalysis` raw values. */
export const SLEEP_VALUE = { inBed: 0, asleepUnspecified: 1, awake: 2, asleepCore: 3, asleepDeep: 4, asleepREM: 5 } as const;

const STAGE: Record<number, SleepStage> = { 0: "inBed", 1: "asleep", 2: "awake", 3: "core", 4: "deep", 5: "rem" };

/** `productType` is like "Watch7,1" or "iPhone17,2". */
export function sourceKind(productType: string | null): "watch" | "phone" | "other" {
  if (productType?.startsWith("Watch")) return "watch";
  if (productType?.startsWith("iPhone")) return "phone";
  return "other";
}

export function sleepSegmentInput(s: HealthSleepSample): SleepSegmentInput | null {
  const stage = STAGE[s.value];
  if (!stage) return null;
  return {
    start: s.start.getTime(),
    end: s.end.getTime(),
    stage,
    source: s.sourceName,
    sourceKind: sourceKind(s.productType),
    tzOffsetMin: tzOffsetMin(s.start),
  };
}

export type BodyMetric = BodySample["metric"];

/** HealthKit stores body fat as a fraction; the engine wants %. Two decimals, as the SwiftUI app sent. */
export function bodySample(s: HealthQuantitySample, metric: BodyMetric): BodySample | null {
  const value = Math.round((metric === "percentBodyFat" ? s.value * 100 : s.value) * 100) / 100;
  if (!(value > 0 && value <= 400)) return null;
  return { externalId: s.uuid, metric, value, measuredAt: s.start.getTime() };
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
