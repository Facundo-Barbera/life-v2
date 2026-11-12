// HealthKit → the Mac, incrementally. Each kind of data is read from its own
// HKAnchoredObjectQuery anchor, uploaded, and only then is the anchor kept, so a
// failed upload is simply resent next time; the engine upserts everything
// (workouts and body readings by HealthKit UUID, days by date, sleep by night and
// source), so resending is harmless. Same windows and payloads as the SwiftUI
// app (which resent the whole window on every open): workouts 30 days, sleep 60
// nights, body 365 days, daily signals 30 days.
import type { PulsoApi as LifeClient } from "@/data/api";
import { addDays, dayKey, dayStart, engineNight, engineNightStart, nightEndingAt, startOfDay } from "./days";
import { DAILY_METRICS, dailyRows, daysWithoutRestingRate, restingWindow, type DailyMetric, type DailyStats, type HeartSample } from "./daily";
import { bodySample, chunks, sleepSegmentInput, wantsHeartRateSeries, workoutInput, type BodyMetric } from "./mapping";
import type { AnchoredQuantity, HealthSource } from "./source";

export const WINDOW = { workoutDays: 30, sleepNights: 60, bodyDays: 365, dailyDays: 30 } as const;
/** The contract's batch limits. */
const LIMIT = { workouts: 1000, segments: 20_000, body: 5000, days: 400 } as const;

/** Where the anchors live (the Keychain on the phone); `null` deletes. */
export type SyncStore = { get(key: string): Promise<string | null>; set(key: string, value: string | null): Promise<void> };
export type Uploader = Pick<LifeClient, "call">;

export type SyncResult = { workouts: number; nights: number; bodySamples: number; days: number };

const BODY: [AnchoredQuantity, BodyMetric][] = [
  ["bodyMass", "weight"],
  ["bodyFatPercentage", "percentBodyFat"],
];

/** Days still to recompute; kept across runs so a failure after an anchor moved loses nothing. */
const DAILY_FROM = "dailyFrom";
const anchorKey = (name: string) => `anchor.${name}`;

export async function runHealthSync(source: HealthSource, client: Uploader, store: SyncStore, now = new Date()): Promise<SyncResult> {
  const today = startOfDay(now);
  const firstDay = addDays(today, -(WINDOW.dailyDays - 1));
  const result: SyncResult = { workouts: 0, nights: 0, bodySamples: 0, days: 0 };

  let dailyFrom = await store.get(DAILY_FROM);
  const touch = async (dates: Iterable<string>) => {
    let earliest = dailyFrom;
    for (const d of dates) if (!earliest || d < earliest) earliest = d;
    if (earliest !== dailyFrom) await store.set(DAILY_FROM, (dailyFrom = earliest));
  };

  // Workouts: new ones only, with a heart-rate series when recent.
  const workouts = await source.workouts(await store.get(anchorKey("workouts")), addDays(today, -WINDOW.workoutDays));
  if (workouts.items.length) {
    await touch(workouts.items.flatMap((w) => [dayKey(w.start), dayKey(w.end)]));
    const inputs = [];
    for (const w of workouts.items) inputs.push(workoutInput(w, wantsHeartRateSeries(w, now) ? await source.heartRateSeries(w) : null));
    for (const batch of chunks(inputs, LIMIT.workouts)) result.workouts += (await client.call("sync_workouts", { workouts: batch })).written;
  }
  await store.set(anchorKey("workouts"), workouts.anchor);

  // Sleep: the engine replaces a whole (night, source) per batch, so every night touched goes again in full.
  const sleep = await source.sleep(await store.get(anchorKey("sleep")), addDays(today, -WINDOW.sleepNights));
  if (sleep.items.length) {
    await touch(sleep.items.map((s) => nightEndingAt(s.end)));
    const touched = new Set(sleep.items.map((s) => engineNight(s.start)));
    const earliest = [...touched].sort()[0]!;
    const samples = await source.sleepBetween(engineNightStart(earliest), now);
    const segments = samples.filter((s) => touched.has(engineNight(s.start))).flatMap((s) => sleepSegmentInput(s) ?? []);
    for (const batch of chunks(segments, LIMIT.segments)) result.nights += (await client.call("sync_sleep", { segments: batch })).nights;
  }
  await store.set(anchorKey("sleep"), sleep.anchor);

  // Body: weigh-ins and body fat, new readings only.
  for (const [type, metric] of BODY) {
    const delta = await source.quantity(type, await store.get(anchorKey(type)), addDays(today, -WINDOW.bodyDays));
    const samples = delta.items.flatMap((s) => bodySample(s, metric) ?? []);
    for (const batch of chunks(samples, LIMIT.body)) result.bodySamples += (await client.call("sync_body_samples", { samples: batch })).written;
    await store.set(anchorKey(type), delta.anchor);
  }

  // Daily signals: the anchors say which days changed; those are recomputed from
  // Health's daily statistics (plus yesterday and today, whose estimates move as the day goes).
  const metrics = Object.keys(DAILY_METRICS) as DailyMetric[];
  const moved: [string, string][] = [];
  for (const metric of metrics) {
    const delta = await source.quantity(metric, await store.get(anchorKey(metric)), firstDay);
    await touch(delta.items.flatMap((s) => [dayKey(s.start), dayKey(s.end)]));
    moved.push([anchorKey(metric), delta.anchor]);
  }
  for (const [key, anchor] of moved) await store.set(key, anchor);
  await touch([dayKey(addDays(today, -1))]);

  const from = dailyFrom && dayStart(dailyFrom) > firstDay ? dayStart(dailyFrom) : firstDay;
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(dayKey(d));
  const stats = Object.fromEntries(await Promise.all(metrics.map(async (m) => [m, await source.dailyStatistics(m, from)] as const))) as DailyStats;
  const missing = daysWithoutRestingRate(days, stats);
  const heart: HeartSample[] = missing.length ? await source.heartRate(new Date(restingWindow(missing[0]!)[0]), now) : [];
  const rows = dailyRows({
    days,
    stats,
    // A day earlier, so the first night's start is in.
    sleep: await source.sleepBetween(addDays(from, -1), now),
    heart,
    workouts: await source.workoutIntervals(from),
  });
  for (const batch of chunks(rows, LIMIT.days)) result.days += (await client.call("sync_daily_metrics", { days: batch })).written;
  await store.set(DAILY_FROM, null);
  return result;
}
