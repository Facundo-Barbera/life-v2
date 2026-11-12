import {
  queryCategorySamples,
  queryCategorySamplesWithAnchor,
  queryQuantitySamples,
  queryQuantitySamplesWithAnchor,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  queryWorkoutSamplesWithAnchor,
  type QuantityTypeIdentifier,
  type WorkoutProxyTyped as WorkoutProxy,
} from "@kingstinct/react-native-healthkit";
import { dayKey } from "./days";
import { DAILY_METRICS } from "./daily";
import type { HealthSleepSample, HealthWorkout } from "./mapping";
import type { AnchoredQuantity, HealthSource } from "./source";

// The real HealthSource: @kingstinct/react-native-healthkit's anchored,
// sample and statistics queries, reduced to plain values for the sync.

const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const HEART = "HKQuantityTypeIdentifierHeartRate";
const BPM = "count/min";
const ALL = 0; // limit: every sample

const QUANTITY: Record<AnchoredQuantity, { type: QuantityTypeIdentifier; unit: string }> = {
  ...DAILY_METRICS,
  bodyMass: { type: "HKQuantityTypeIdentifierBodyMass", unit: "kg" },
  bodyFatPercentage: { type: "HKQuantityTypeIdentifierBodyFatPercentage", unit: "%" },
};
const DISTANCES: QuantityTypeIdentifier[] = [
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierDistanceCycling",
  "HKQuantityTypeIdentifierDistanceSwimming",
];

const anchorOf = (anchor: string | null) => (anchor ? { anchor } : {});

async function workout(w: WorkoutProxy): Promise<HealthWorkout> {
  const [energy, heart, ...distances] = await Promise.all<Awaited<ReturnType<WorkoutProxy["getStatistic"]>> | undefined>([
    w.getStatistic("HKQuantityTypeIdentifierActiveEnergyBurned", "kcal").catch(() => undefined),
    w.getStatistic(HEART, BPM).catch(() => undefined),
    ...DISTANCES.map((d) => w.getStatistic(d, "m").catch(() => undefined)),
  ]);
  const externalRef = (w.metadata as Record<string, unknown> | undefined)?.HKExternalUUID;
  return {
    uuid: w.uuid,
    activityType: w.workoutActivityType,
    start: new Date(w.startDate),
    end: new Date(w.endDate),
    energy: energy?.sumQuantity?.quantity ?? null,
    distance: distances.map((d) => d?.sumQuantity?.quantity).find((d) => d !== undefined) ?? null,
    sourceBundle: w.sourceRevision.source.bundleIdentifier,
    sourceName: w.sourceRevision.source.name,
    externalRef: typeof externalRef === "string" ? externalRef : null,
    avgHeartRate: heart?.averageQuantity?.quantity ?? null,
    maxHeartRate: heart?.maximumQuantity?.quantity ?? null,
  };
}

const sleepSample = (s: { uuid: string; startDate: Date; endDate: Date; value: unknown; sourceRevision: { source: { name: string }; productType?: string } }): HealthSleepSample => ({
  uuid: s.uuid,
  start: new Date(s.startDate),
  end: new Date(s.endDate),
  value: Number(s.value),
  sourceName: s.sourceRevision.source.name,
  productType: s.sourceRevision.productType ?? null,
});

export const healthKitSource: HealthSource = {
  async workouts(anchor, since) {
    const r = await queryWorkoutSamplesWithAnchor({ limit: ALL, filter: { date: { startDate: since } }, ...anchorOf(anchor) });
    return { items: await Promise.all(r.workouts.map(workout)), anchor: r.newAnchor };
  },

  async sleep(anchor, since) {
    const r = await queryCategorySamplesWithAnchor(SLEEP, { limit: ALL, filter: { date: { startDate: since } }, ...anchorOf(anchor) });
    return { items: r.samples.map(sleepSample), anchor: r.newAnchor };
  },

  async quantity(type, anchor, since) {
    const { type: id, unit } = QUANTITY[type];
    const r = await queryQuantitySamplesWithAnchor(id, { limit: ALL, unit, filter: { date: { startDate: since } }, ...anchorOf(anchor) } as never);
    return {
      items: r.samples.map((s) => ({ uuid: s.uuid, start: new Date(s.startDate), end: new Date(s.endDate), value: s.quantity })),
      anchor: r.newAnchor,
    };
  },

  async sleepBetween(from, to) {
    const samples = await queryCategorySamples(SLEEP, { limit: ALL, ascending: true, filter: { date: { startDate: from, endDate: to } } });
    return samples.map(sleepSample);
  },

  async dailyStatistics(metric, from) {
    const { type, unit, sum } = DAILY_METRICS[metric];
    const stats = await queryStatisticsCollectionForQuantity(type, [sum ? "cumulativeSum" : "discreteAverage"], from, { day: 1 }, {
      unit,
      filter: { date: { startDate: from } },
    } as never).catch(() => []);
    const out: Record<string, number> = {};
    for (const s of stats) {
      const value = (sum ? s.sumQuantity : s.averageQuantity)?.quantity;
      if (s.startDate && value !== undefined) out[dayKey(new Date(s.startDate))] = value;
    }
    return out;
  },

  async heartRate(from, to) {
    const samples = await queryQuantitySamples(HEART, { limit: ALL, unit: BPM, filter: { date: { startDate: from, endDate: to } } } as never).catch(() => []);
    return samples.map((s) => ({ at: new Date(s.startDate).getTime(), bpm: s.quantity }));
  },

  async workoutIntervals(from) {
    const workouts = await queryWorkoutSamples({ limit: ALL, filter: { date: { startDate: from } } }).catch(() => []);
    return workouts.map((w) => [new Date(w.startDate).getTime(), new Date(w.endDate).getTime()]);
  },

  async heartRateSeries(w) {
    const stats = await queryStatisticsCollectionForQuantity(HEART, ["discreteAverage"], w.start, { minute: 1 }, {
      unit: BPM,
      filter: { date: { startDate: w.start, endDate: w.end } },
    } as never).catch(() => []);
    const points = stats.flatMap((s) =>
      s.startDate && s.averageQuantity ? [{ at: new Date(s.startDate).getTime(), bpm: Math.round(s.averageQuantity.quantity) }] : [],
    );
    return points.length ? points.slice(0, 600) : null;
  },
};
