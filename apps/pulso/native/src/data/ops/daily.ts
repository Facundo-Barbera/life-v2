import type { DailyMetrics as DailyRow } from "@life/db";
import { addDays, localDate } from "@life/db/pulso";
import type { DailyMetrics } from "@/contract";
import { BASELINE_DAYS, computeReadiness } from "../logic/readiness";
import { ms, ok, P, rows } from "./db";
import type { Ctx, OpTable } from "./types";

export const today = (ctx: Ctx) => localDate(new Date(), ctx.tz);

const COLUMNS = {
  steps: "steps",
  activeEnergy: "active_energy",
  exerciseMinutes: "exercise_minutes",
  restingHeartRate: "resting_heart_rate",
  hrv: "hrv",
  sleepMinutes: "sleep_minutes",
  sleepDeep: "sleep_deep",
  sleepCore: "sleep_core",
  sleepRem: "sleep_rem",
  sleepAwake: "sleep_awake",
  vo2max: "vo2max",
  respiratoryRate: "respiratory_rate",
} as const satisfies Record<string, keyof DailyRow>;
const FIELDS = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function toMetrics(row: DailyRow): DailyMetrics {
  const m = { date: row.date, updatedAt: ms(row.updated_at), exerciseMinutesEstimated: row.exercise_minutes_estimated, restingHeartRateEstimated: row.resting_heart_rate_estimated } as DailyMetrics;
  for (const f of FIELDS) m[f] = num(row[COLUMNS[f]]);
  return m;
}

const EMPTY: Omit<DailyMetrics, "date" | "updatedAt"> = {
  steps: null, activeEnergy: null, exerciseMinutes: null, exerciseMinutesEstimated: false, restingHeartRate: null, restingHeartRateEstimated: false,
  hrv: null, sleepMinutes: null, sleepDeep: null, sleepCore: null, sleepRem: null, sleepAwake: null, vo2max: null, respiratoryRate: null,
};

/**
 * Days in [from, to], oldest first. A night logged by hand (pulso.sleeps,
 * source manual) fills `sleepMinutes` where Health had none, flagged `sleepManual`.
 */
export async function listDaily(ctx: Ctx, from: string, to: string): Promise<DailyMetrics[]> {
  const [days, manual] = await Promise.all([
    P(ctx).from("daily_metrics").select("*").gte("date", from).lte("date", to).order("date"),
    P(ctx).from("sleeps").select("night, started_at, ended_at, asleep_min, updated_at").eq("source", "manual").gte("night", from).lte("night", to),
  ]);
  const byDate = new Map(rows(days).map((r) => [r.date, toMetrics(r)]));
  for (const night of rows(manual)) {
    if (!night.night) continue;
    const day = byDate.get(night.night);
    if (day?.sleepMinutes != null) continue;
    const minutes = night.asleep_min ?? Math.round((ms(night.ended_at) - ms(night.started_at)) / 60_000);
    byDate.set(night.night, { ...EMPTY, date: night.night, updatedAt: ms(night.updated_at), ...day, sleepMinutes: minutes, sleepManual: true });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function readinessFor(ctx: Ctx, date: string) {
  const history = await listDaily(ctx, addDays(date, -BASELINE_DAYS), date);
  return computeReadiness(date, history.find((d) => d.date === date), history.filter((d) => d.date < date));
}

export const dailyOps: OpTable = {
  async get_daily_metrics(ctx, { from, to }) {
    const end = to ?? today(ctx);
    return listDaily(ctx, from ?? addDays(end, -6), end);
  },
  async get_daily(ctx, { to, days }) {
    const end = to ?? today(ctx);
    const span = Math.max(days, BASELINE_DAYS + 1);
    const all = await listDaily(ctx, addDays(end, -(span - 1)), end);
    const readiness = computeReadiness(end, all.find((d) => d.date === end), all.filter((d) => d.date < end));
    const from = addDays(end, -(days - 1));
    return { days: all.filter((d) => d.date >= from), readiness };
  },
  async get_readiness(ctx, { date }) {
    return readinessFor(ctx, date ?? today(ctx));
  },
  async sync_daily_metrics(ctx, { days }) {
    if (!days.length) return { written: 0 };
    const dates = days.map((d) => d.date);
    const existing = new Map(rows(await P(ctx).from("daily_metrics").select("*").in("date", dates)).map((r) => [r.date, r]));
    const now = new Date().toISOString();
    const upserts = days.map((d) => {
      const prev = existing.get(d.date);
      const row: Record<string, unknown> = { user_id: ctx.userId, date: d.date, updated_at: now };
      for (const f of FIELDS) {
        const v = d[f];
        row[COLUMNS[f]] = v ?? prev?.[COLUMNS[f]] ?? null;
      }
      row.resting_heart_rate_estimated = d.restingHeartRate != null ? !!d.restingHeartRateEstimated : (prev?.resting_heart_rate_estimated ?? false);
      row.exercise_minutes_estimated = d.exerciseMinutes != null ? !!d.exerciseMinutesEstimated : (prev?.exercise_minutes_estimated ?? false);
      return row as DailyRow;
    });
    ok(await P(ctx).from("daily_metrics").upsert(upserts, { onConflict: "user_id,date" }));
    return { written: upserts.length };
  },
};

