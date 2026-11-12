import type { HeartRatePoint } from "@/contract";
import type { DailyMetric, HeartSample } from "./daily";
import type { HealthQuantitySample, HealthSleepSample, HealthWorkout } from "./mapping";

/** What came in since `anchor` (null: from `since` on), and the anchor to resume from. */
export type Delta<T> = { items: T[]; anchor: string };

/** Quantity types followed by anchor: the daily signals and the body readings. */
export type AnchoredQuantity = DailyMetric | "bodyMass" | "bodyFatPercentage";

/**
 * Everything the sync reads from HealthKit, as plain values: healthkit-source.ts
 * is the real one, the tests use a fake. Anchored reads return only what was
 * added since the anchor (HKAnchoredObjectQuery, restricted to samples from `since`).
 */
export type HealthSource = {
  workouts(anchor: string | null, since: Date): Promise<Delta<HealthWorkout>>;
  sleep(anchor: string | null, since: Date): Promise<Delta<HealthSleepSample>>;
  quantity(type: AnchoredQuantity, anchor: string | null, since: Date): Promise<Delta<HealthQuantitySample>>;
  /** Every sleep sample overlapping [from, to]. */
  sleepBetween(from: Date, to: Date): Promise<HealthSleepSample[]>;
  /** Daily sum or average per local day from `from` on, keyed `YYYY-MM-DD`. */
  dailyStatistics(metric: DailyMetric, from: Date): Promise<Record<string, number>>;
  heartRate(from: Date, to: Date): Promise<HeartSample[]>;
  /** [start, end] ms of every workout from `from` on. */
  workoutIntervals(from: Date): Promise<[number, number][]>;
  /** The workout's heart rate averaged per minute; null when Salud has none. */
  heartRateSeries(workout: HealthWorkout): Promise<HeartRatePoint[] | null>;
};
