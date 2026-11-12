import {
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  type ObjectTypeIdentifier,
} from "@kingstinct/react-native-healthkit";
import { nightWindow, summarizeNight, type Night } from "./sleep";

/**
 * Everything the tabs read, asked for once (through `askHealth`, never over a
 * modal) so the person sees one Health sheet: the SwiftUI app's `HealthSync.readTypes`. Medications
 * are per-object and stay with the Medicación import; writing (workouts, water)
 * is asked when it's first needed, as the SwiftUI app does.
 */
export const READ_TYPES = [
  "HKWorkoutTypeIdentifier",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierDistanceCycling",
  "HKQuantityTypeIdentifierDistanceSwimming",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierBodyMass",
  "HKQuantityTypeIdentifierBodyFatPercentage",
  "HKQuantityTypeIdentifierLeanBodyMass",
] as const satisfies readonly ObjectTypeIdentifier[];

export const healthAvailable = (): boolean => isHealthDataAvailable();

export const READ_ACCESS = { toRead: READ_TYPES };

/** What Watch.startWatchApp asks for natively (PulsoWatchModule.swift). */
export const WATCH_ACCESS = { toShare: ["HKWorkoutTypeIdentifier"], toRead: ["HKQuantityTypeIdentifierHeartRate"] } as const satisfies {
  toShare: readonly ObjectTypeIdentifier[];
  toRead: readonly ObjectTypeIdentifier[];
};

export type TodaySignals = {
  /** Latest HRV (SDNN) since midnight, ms. */
  hrv: number | null;
  /** Latest resting heart rate since midnight, bpm. */
  restingHeartRate: number | null;
  night: Night | null;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function latestToday(identifier: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" | "HKQuantityTypeIdentifierRestingHeartRate", unit: string) {
  const [sample] = await queryQuantitySamples(identifier, {
    limit: 1,
    ascending: false,
    unit: unit as never,
    filter: { date: { startDate: startOfToday() } },
  });
  return sample ? Math.round(sample.quantity) : null;
}

/** Today's HRV, resting heart rate and last night: what Hoy's recovery reads. A denied type reads as empty. */
export async function readToday(): Promise<TodaySignals> {
  const [hrv, restingHeartRate, sleep] = await Promise.all([
    latestToday("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "ms").catch(() => null),
    latestToday("HKQuantityTypeIdentifierRestingHeartRate", "count/min").catch(() => null),
    queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", { limit: 0, ascending: true, filter: { date: nightWindow() } }).catch(() => []),
  ]);
  return {
    hrv,
    restingHeartRate,
    night: summarizeNight(sleep.map((s) => ({ startDate: new Date(s.startDate), endDate: new Date(s.endDate), value: Number(s.value) }))),
  };
}
