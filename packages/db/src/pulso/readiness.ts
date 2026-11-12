/**
 * Readiness (recuperación) for a day from Apple Health's daily signals against
 * the person's own 28-day baseline (ported from the old engine's
 * daily/readiness.ts). `computeReadiness` is pure; `getReadiness` loads.
 */
import type { LifeClient } from "../index";
import type { DailyMetrics } from "../types";
import { pulso } from "./core";
import { addDays, localDate } from "./dates";
import { getSettings } from "./settings";

export const BASELINE_DAYS = 28;
export const MIN_BASELINE = 5;
export const DEFAULT_SLEEP_TARGET = 480;
export const ESTIMATE_WEIGHT = 0.7;

const WEIGHTS = { hrv: 0.4, resting_hr: 0.3, sleep: 0.3 } as const;

/** The signals readiness reads from one day (a subset of daily_metrics). */
export type DaySignals = Pick<DailyMetrics, "date" | "hrv" | "resting_heart_rate" | "sleep_minutes"> & { resting_heart_rate_estimated?: boolean };

export type ReadinessFactor = {
  key: "hrv" | "resting_hr" | "sleep";
  label: string;
  value: number | null;
  baseline: number | null;
  score: number | null;
  detail: string;
  estimated: boolean;
};

export type ReadinessLevel = "high" | "medium" | "low" | "unknown";

export type ReadinessDetail = {
  date: string;
  score: number | null;
  level: ReadinessLevel;
  factors: ReadinessFactor[];
  explanation: string;
  baselineDays: number;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const fromZ = (z: number) => clamp(70 + 20 * z);

function hrvFactor(value: number | null, history: number[]): ReadinessFactor {
  const base = { key: "hrv", label: "VFC", value, estimated: false } as const;
  if (history.length < MIN_BASELINE) return { ...base, baseline: null, score: null, detail: `Armando tu media (${history.length}/${MIN_BASELINE} días)` };
  const baseline = mean(history);
  if (value === null) return { ...base, baseline, score: null, detail: "Sin medición de anoche" };
  const logs = history.map(Math.log);
  const z = (Math.log(value) - mean(logs)) / Math.max(sd(logs), 0.05);
  const pct = Math.round((value / baseline - 1) * 100);
  const detail = Math.abs(pct) < 3 ? "En tu media" : `${Math.abs(pct)}% ${pct > 0 ? "por encima" : "por debajo"} de tu media`;
  return { ...base, baseline, score: fromZ(z), detail };
}

function restingFactor(value: number | null, history: number[], estimated: boolean): ReadinessFactor {
  const base = { key: "resting_hr", label: "Pulso en reposo", value, estimated: value !== null && estimated } as const;
  if (history.length < MIN_BASELINE) return { ...base, baseline: null, score: null, detail: `Armando tu media (${history.length}/${MIN_BASELINE} días)` };
  const baseline = mean(history);
  if (value === null) return { ...base, baseline, score: null, detail: "Sin medición de hoy" };
  const z = (baseline - value) / Math.max(sd(history), 1);
  const diff = Math.round(value - baseline);
  const detail = diff === 0 ? "En tu media" : `${Math.abs(diff)} lpm ${diff > 0 ? "por encima" : "por debajo"} de tu media`;
  return { ...base, baseline, score: fromZ(z), detail: base.estimated ? `${detail} (estimado)` : detail };
}

export const hoursMinutes = (minutes: number) => {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

function sleepFactor(minutes: number | null, target: number): ReadinessFactor {
  const base = { key: "sleep", label: "Sueño", value: minutes, baseline: target, estimated: false } as const;
  if (minutes === null) return { ...base, score: null, detail: "Sin datos de sueño anoche" };
  const score = clamp(100 - (Math.max(0, target - minutes) / 60) * 20);
  return { ...base, score, detail: `${hoursMinutes(minutes)} de ${hoursMinutes(target)}` };
}

const REASONS: Record<ReadinessFactor["key"], { good: string; bad: string }> = {
  hrv: { good: "tu VFC está por encima de lo habitual", bad: "tu VFC está por debajo de lo habitual" },
  resting_hr: { good: "tu pulso en reposo está bajo", bad: "tu pulso en reposo está más alto que de costumbre" },
  sleep: { good: "dormiste bien", bad: "dormiste poco" },
};

function explain(level: ReadinessLevel, scored: ReadinessFactor[]): string {
  if (level === "unknown") return "Todavía no hay datos de Salud para calcular tu recuperación.";
  const sorted = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const weakest = sorted[0]!;
  const strongest = sorted[sorted.length - 1]!;
  if (level === "high") return `Buena recuperación: ${REASONS[strongest.key].good}. Buen día para exigirse.`;
  if (level === "low") return `Recuperación baja: ${REASONS[weakest.key].bad}. Mejor algo suave hoy.`;
  if ((weakest.score ?? 100) < 60) return `Recuperación normal, aunque ${REASONS[weakest.key].bad}. Entrenamiento moderado.`;
  return "Recuperación normal: todo en tu rango habitual.";
}

/** Readiness for `date` from that day's signals and the 28 days before it. Pure. */
export function computeReadiness(date: string, today: DaySignals | undefined, history: DaySignals[], sleepTarget = DEFAULT_SLEEP_TARGET): ReadinessDetail {
  const window = history.filter((d) => d.date < date && d.date >= addDays(date, -BASELINE_DAYS));
  const values = (pick: (d: DaySignals) => number | null) => window.map(pick).filter((v): v is number => v !== null && v > 0);
  const factors = [
    hrvFactor(today?.hrv ?? null, values((d) => d.hrv)),
    restingFactor(today?.resting_heart_rate ?? null, values((d) => d.resting_heart_rate), today?.resting_heart_rate_estimated ?? false),
    sleepFactor(today?.sleep_minutes ?? null, sleepTarget),
  ];
  const scored = factors.filter((f) => f.score !== null);
  const weightOf = (f: ReadinessFactor) => WEIGHTS[f.key] * (f.estimated ? ESTIMATE_WEIGHT : 1);
  const weight = scored.reduce((a, f) => a + weightOf(f), 0);
  const score = scored.length ? clamp(scored.reduce((a, f) => a + f.score! * weightOf(f), 0) / weight) : null;
  const level: ReadinessLevel = score === null ? "unknown" : score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  const baselineDays = window.filter((d) => d.hrv !== null || d.resting_heart_rate !== null).length;
  return { date, score, level, factors, explanation: explain(level, scored), baselineDays };
}

export type Readiness = {
  date: string;
  score: number | null;
  level: ReadinessLevel;
  explanation: string;
  hrv: number | null;
  restingHr: number | null;
  sleepMin: number | null;
  factors: ReadinessFactor[];
  baselineDays: number;
  /** The last 15 days of signals, oldest first (for sparklines). */
  days: DaySignals[];
};

/** Daily signals between two dates; a day without Health sleep takes the night logged in Pulso. */
export async function listDailySignals(client: LifeClient, from: string, to: string): Promise<DaySignals[]> {
  const [metrics, nights] = await Promise.all([
    pulso(client).from("daily_metrics").select("date, hrv, resting_heart_rate, resting_heart_rate_estimated, sleep_minutes").gte("date", from).lte("date", to).order("date"),
    pulso(client).from("sleeps").select("night, source, asleep_min, started_at, ended_at").gte("night", from).lte("night", to),
  ]);
  const sleepBy = new Map<string, number>();
  for (const n of nights.data ?? []) {
    if (!n.night) continue;
    const min = n.asleep_min ?? Math.round((Date.parse(n.ended_at) - Date.parse(n.started_at)) / 60_000);
    if (n.source === "healthkit" || !sleepBy.has(n.night)) sleepBy.set(n.night, min);
  }
  const byDate = new Map<string, DaySignals>();
  for (const d of metrics.data ?? []) byDate.set(d.date, { ...d, sleep_minutes: d.sleep_minutes ?? sleepBy.get(d.date) ?? null });
  for (const [date, min] of sleepBy) if (!byDate.has(date)) byDate.set(date, { date, hrv: null, resting_heart_rate: null, sleep_minutes: min });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Today's readiness (or `date`'s). */
export async function getReadiness(client: LifeClient, date?: string): Promise<Readiness> {
  const settings = await getSettings(client);
  const day = date ?? localDate(new Date(), settings.timezone);
  const signals = await listDailySignals(client, addDays(day, -BASELINE_DAYS), day);
  const today = signals.find((d) => d.date === day);
  const r = computeReadiness(day, today, signals, settings.sleep_target_min ?? DEFAULT_SLEEP_TARGET);
  return {
    ...r,
    hrv: today?.hrv ?? null,
    restingHr: today?.resting_heart_rate ?? null,
    sleepMin: today?.sleep_minutes ?? null,
    days: signals.filter((d) => d.date > addDays(day, -15)),
  };
}
