import { describe, expect, test } from "bun:test";
import { dayKey } from "./days";
import type { DailyMetric } from "./daily";
import type { HealthQuantitySample, HealthSleepSample, HealthWorkout } from "./mapping";
import { runHealthSync, type SyncStore, type Uploader } from "./run";
import type { AnchoredQuantity, HealthSource } from "./source";

const now = new Date(2026, 9, 21, 9, 30);
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);

/** A HealthKit with anchors: each record has a sequence number, an anchor is the last one seen. */
function fakeHealth() {
  let seq = 0;
  const workouts: [number, HealthWorkout][] = [];
  const sleep: [number, HealthSleepSample][] = [];
  const quantities = new Map<AnchoredQuantity, [number, HealthQuantitySample][]>();
  const since = <T,>(rows: [number, T][], anchor: string | null) => {
    const from = anchor ? Number(anchor) : 0;
    return { items: rows.filter(([s]) => s > from).map(([, r]) => r), anchor: String(seq) };
  };
  const source: HealthSource & { reads: string[] } = {
    reads: [],
    async workouts(anchor) {
      return since(workouts, anchor);
    },
    async sleep(anchor) {
      return since(sleep, anchor);
    },
    async quantity(type, anchor) {
      return since(quantities.get(type) ?? [], anchor);
    },
    async sleepBetween(from, to) {
      return sleep.map(([, s]) => s).filter((s) => s.end >= from && s.start <= to);
    },
    async dailyStatistics(metric: DailyMetric, from) {
      source.reads.push(`stats:${metric}:${dayKey(from)}`);
      const out: Record<string, number> = {};
      for (const [, s] of quantities.get(metric) ?? []) {
        if (s.start < from) continue;
        out[dayKey(s.start)] = (out[dayKey(s.start)] ?? 0) + s.value;
      }
      return out;
    },
    async heartRate() {
      return [];
    },
    async workoutIntervals(from) {
      return workouts.map(([, w]) => w).filter((w) => w.end >= from).map((w) => [w.start.getTime(), w.end.getTime()] as [number, number]);
    },
    async heartRateSeries(w) {
      source.reads.push(`series:${w.uuid}`);
      return [{ at: w.start.getTime(), bpm: 120 }];
    },
  };
  return {
    source,
    addWorkout: (w: Partial<HealthWorkout> & { uuid: string; start: Date; end: Date }) =>
      workouts.push([++seq, { activityType: 50, energy: 200, distance: null, sourceBundle: "com.apple.health.x", sourceName: "Apple Watch", externalRef: null, avgHeartRate: 110.4, maxHeartRate: 150.6, ...w }]),
    addSleep: (s: Omit<HealthSleepSample, "sourceName" | "productType"> & Partial<HealthSleepSample>) => sleep.push([++seq, { sourceName: "Apple Watch", productType: "Watch7,1", ...s }]),
    addQuantity: (type: AnchoredQuantity, s: HealthQuantitySample) => quantities.set(type, [...(quantities.get(type) ?? []), [++seq, s]]),
  };
}

function memoryStore(): SyncStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      if (value === null) data.delete(key);
      else data.set(key, value);
    },
  };
}

type Call = { name: string; input: any };
function recordingClient(fail?: (name: string) => boolean): Uploader & { calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    calls,
    async call(name: string, input: any) {
      if (fail?.(name)) throw new Error("No se pudo conectar con tu Mac.");
      calls.push({ name, input });
      if (name === "sync_workouts") return { written: input.workouts.length };
      if (name === "sync_sleep") return { nights: new Set(input.segments.map((s: any) => s.start)).size };
      if (name === "sync_body_samples") return { written: input.samples.length };
      if (name === "sync_daily_metrics") return { written: input.days.length };
      throw new Error(name);
    },
  };
  return client as unknown as Uploader & { calls: Call[] };
}

describe("runHealthSync", () => {
  test("first run sends the window; a second run with nothing new sends only yesterday and today", async () => {
    const hk = fakeHealth();
    hk.addWorkout({ uuid: "W1", start: at(20, 18), end: at(20, 19) });
    hk.addSleep({ uuid: "S1", start: at(20, 23), end: at(21, 7), value: 3 });
    hk.addQuantity("bodyMass", { uuid: "B1", start: at(19, 8), end: at(19, 8), value: 80.123 });
    hk.addQuantity("steps", { uuid: "Q1", start: at(15, 10), end: at(15, 11), value: 5000 });
    const store = memoryStore();
    const client = recordingClient();

    const first = await runHealthSync(hk.source, client, store, now);
    expect(first.workouts).toBe(1);
    expect(first.bodySamples).toBe(1);
    expect(first.nights).toBe(1);
    const sent = client.calls.find((c) => c.name === "sync_workouts")!.input.workouts[0];
    expect(sent).toMatchObject({ externalId: "W1", activity: "strength", avgHeartRate: 110, maxHeartRate: 151, heartRate: [{ bpm: 120 }] });
    expect(client.calls.find((c) => c.name === "sync_body_samples")!.input.samples).toEqual([{ externalId: "B1", metric: "weight", value: 80.12, measuredAt: at(19, 8).getTime() }]);
    const days = client.calls.find((c) => c.name === "sync_daily_metrics")!.input.days.map((d: any) => d.date);
    // From the oldest touched day (the steps on the 15th) to today, days with data only.
    expect(days).toEqual(["2026-10-15", "2026-10-20", "2026-10-21"]);
    expect(store.data.has("dailyFrom")).toBe(false);

    client.calls.length = 0;
    hk.source.reads.length = 0;
    const second = await runHealthSync(hk.source, client, store, now);
    expect(second).toMatchObject({ workouts: 0, nights: 0, bodySamples: 0 });
    expect(client.calls.map((c) => c.name)).toEqual(["sync_daily_metrics"]);
    expect(hk.source.reads).toContain("stats:steps:2026-10-20");
    expect(hk.source.reads.some((r) => r.startsWith("series:"))).toBe(false);
  });

  test("a failed upload keeps the anchor, so the next run sends it again", async () => {
    const hk = fakeHealth();
    hk.addWorkout({ uuid: "W1", start: at(20, 18), end: at(20, 19) });
    const store = memoryStore();
    await expect(runHealthSync(hk.source, recordingClient((n) => n === "sync_workouts"), store, now)).rejects.toThrow();
    expect(store.data.has("anchor.workouts")).toBe(false);

    const client = recordingClient();
    expect((await runHealthSync(hk.source, client, store, now)).workouts).toBe(1);
  });

  test("days touched by a run that failed later are still recomputed", async () => {
    const hk = fakeHealth();
    hk.addQuantity("steps", { uuid: "Q1", start: at(10, 10), end: at(10, 11), value: 3000 });
    const store = memoryStore();
    await expect(runHealthSync(hk.source, recordingClient((n) => n === "sync_daily_metrics"), store, now)).rejects.toThrow();
    // The steps anchor moved, but the day it touched waits in dailyFrom.
    expect(store.data.get("dailyFrom")).toBe("2026-10-10");
    const client = recordingClient();
    await runHealthSync(hk.source, client, store, now);
    expect(client.calls.find((c) => c.name === "sync_daily_metrics")!.input.days[0]).toMatchObject({ date: "2026-10-10", steps: 3000 });
  });

  test("a new sleep sample resends its whole night, every source", async () => {
    const hk = fakeHealth();
    hk.addSleep({ uuid: "P1", start: at(20, 23), end: at(21, 6), value: 1, sourceName: "iPhone", productType: "iPhone17,2" });
    hk.addSleep({ uuid: "S0", start: at(19, 23), end: at(20, 7), value: 3 });
    const store = memoryStore();
    await runHealthSync(hk.source, recordingClient(), store, now);

    hk.addSleep({ uuid: "S1", start: at(21, 0, 30), end: at(21, 7), value: 4 });
    const client = recordingClient();
    await runHealthSync(hk.source, client, store, now);
    const segments = client.calls.find((c) => c.name === "sync_sleep")!.input.segments;
    // Last night's both samples (the phone's too), not the night before.
    expect(segments.map((s: any) => [s.source, s.sourceKind, s.stage])).toEqual([
      ["iPhone", "phone", "asleep"],
      ["Apple Watch", "watch", "deep"],
    ]);
  });
});
