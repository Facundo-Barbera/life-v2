import type { BodyGauge, BodyScan, Segmental } from "@/contract";

// Cuerpo's client-side rules (BodyModels/BodyCards.swift): the engine does the
// projections, gauges and segments; the phone only compares scans and lays
// out charts.

export type Metric = "weight" | "bodyFatMass" | "skeletalMuscleMass" | "percentBodyFat";
export const METRICS: { value: Metric; title: string; unit: string; lowerIsBetter: boolean }[] = [
  { value: "weight", title: "Peso", unit: "kg", lowerIsBetter: true },
  { value: "bodyFatMass", title: "Grasa", unit: "kg", lowerIsBetter: true },
  { value: "skeletalMuscleMass", title: "Músculo", unit: "kg", lowerIsBetter: false },
  { value: "percentBodyFat", title: "% Grasa", unit: "%", lowerIsBetter: true },
];
export const metricInfo = (m: Metric) => METRICS.find((x) => x.value === m)!;

/** Up to `d` decimals, comma, trailing zeros dropped: 82.0 → «82», 82.34 → «82,3». */
export const dec = (n: number, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace(".", ",");
/** «+0,4», «−1,2», «±0». */
export const signed = (v: number) => `${v > 0.05 ? "+" : v < -0.05 ? "−" : "±"}${dec(Math.abs(v))}`;

export type Delta = { value: number; good: boolean | null; arrow: "up" | "down" | "flat" };
/** now − before; within 0.05 reads as equal (no verdict). */
export function delta(now: number | null | undefined, before: number | null | undefined, lowerIsBetter: boolean): Delta | null {
  if (now == null || before == null) return null;
  const value = now - before;
  if (Math.abs(value) < 0.05) return { value, good: null, arrow: "flat" };
  return { value, good: value < 0 === lowerIsBetter, arrow: value < 0 ? "down" : "up" };
}

/** History rows compare each metric with the next OLDER scan that has it, not just the adjacent one. */
export function olderWith(scans: BodyScan[], index: number, key: keyof BodyScan): number | null {
  for (let i = index + 1; i < scans.length; i++) {
    const v = scans[i]![key];
    if (typeof v === "number") return v;
  }
  return null;
}

export const sourceLabel = (s: BodyScan) => (s.source === "inbody" ? `InBody${s.device ? ` ${s.device}` : ""}` : "Manual");
export const leanMass = (s: BodyScan) => (s.weight != null && s.bodyFatMass != null ? s.weight - s.bodyFatMass : null);
export const scanSummary = (s: BodyScan) =>
  [sourceLabel(s), s.percentBodyFat != null ? `${dec(s.percentBodyFat)} % grasa` : null, s.skeletalMuscleMass != null ? `${dec(s.skeletalMuscleMass)} kg músculo` : null].filter(Boolean).join(" · ");

/** The donut: muscle, fat and the rest of the lean mass (only with weight and fat mass). */
export function composition(s: BodyScan) {
  if (s.weight == null || s.bodyFatMass == null) return [];
  const muscle = s.skeletalMuscleMass ?? 0;
  return [
    { key: "muscle", title: "Músculo", kg: muscle },
    { key: "fat", title: "Grasa", kg: s.bodyFatMass },
    { key: "rest", title: "Resto magro", kg: Math.max(s.weight - s.bodyFatMass - muscle, 0) },
  ].filter((x) => x.kg > 0);
}

/** Evolution: scans with weight, muscle and fat, the last 24, oldest first, as change since the first. */
export function evolution(scans: BodyScan[]) {
  const points = scans
    .filter((s) => s.weight != null && s.skeletalMuscleMass != null && s.bodyFatMass != null)
    .slice(0, 24)
    .reverse();
  const first = points[0];
  if (!first) return [];
  return points.map((s) => ({ id: s.id, at: s.measuredAt, weight: s.weight! - first.weight!, muscle: s.skeletalMuscleMass! - first.skeletalMuscleMass!, fat: s.bodyFatMass! - first.bodyFatMass! }));
}

/** The y domain of the trend chart: observed, the projected band, and the goal, padded. */
export function trendDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.12, 0.5);
  return [lo - pad, hi + pad];
}

/** The nearest point by time. */
export const nearest = <T extends { at: number }>(points: T[], at: number): T | undefined =>
  points.reduce<T | undefined>((best, p) => (!best || Math.abs(p.at - at) < Math.abs(best.at - at) ? p : best), undefined);

export const GAUGE_TITLES: Record<BodyGauge["metric"], string> = {
  weight: "Peso",
  skeletalMuscleMass: "Músculo esquelético",
  bodyFatMass: "Masa grasa",
  bmi: "IMC",
  percentBodyFat: "Grasa corporal",
  visceralFatLevel: "Grasa visceral",
};
export const BAND_TITLES = { low: "Bajo", normal: "Normal", high: "Alto" } as const;
/** Normal is good; more muscle is good; high elsewhere is a warning; low is neutral. */
export function gaugeGood(g: Pick<BodyGauge, "metric" | "band">): boolean | null {
  if (g.band === "normal") return true;
  if (g.metric === "skeletalMuscleMass") return g.band === "high";
  return g.band === "high" ? false : null;
}

export const shortDate = (ms: number) => new Date(ms).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

type NumKey = { [K in keyof BodyScan]: BodyScan[K] extends number | null ? K : never }[keyof BodyScan];

/** A value carried forward: the newest scan that measured it, and the one before that did. */
export type Carried = { value: number; at: number; previous: number | null; fresh: boolean };
/** The newest scan with `key`, so a manual weigh-in doesn't blank the last known composition. */
export function carried(scans: BodyScan[], key: NumKey): Carried | null {
  const i = scans.findIndex((s) => typeof s[key] === "number");
  if (i < 0) return null;
  return { value: scans[i]![key] as number, at: scans[i]!.measuredAt, previous: olderWith(scans, i, key), fresh: i === 0 };
}

const DAY = 86_400_000;
const startOfDay = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();
/** «hoy», «ayer», «hace 3 días», «hace 2 sem», «hace 3 meses» (calendar days). */
export function ago(ms: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.floor(days / 7)} sem`;
  const months = Math.floor(days / 30);
  return months < 24 ? `hace ${months} meses` : `hace ${Math.floor(days / 365)} años`;
}

/** A full scan (InBody, or a manual entry with composition) vs a plain weigh-in. */
export const isFullScan = (s: BodyScan) => s.source === "inbody" || s.skeletalMuscleMass != null || s.bodyFatMass != null || s.percentBodyFat != null;
/** History split: rich rows for full scans, a compact list for weigh-ins; both newest first. */
export function splitHistory(scans: BodyScan[]) {
  return { full: scans.filter(isFullScan), weighIns: scans.filter((s) => !isFullScan(s)) };
}

export type Seg = keyof Segmental;
export const SEGMENTS: Seg[] = ["rightArm", "leftArm", "trunk", "rightLeg", "leftLeg"];
export const SEG_TITLES: Record<Seg, string> = { rightArm: "Brazo der.", leftArm: "Brazo izq.", trunk: "Tronco", rightLeg: "Pierna der.", leftLeg: "Pierna izq." };

/** The scan the segment analysis came from and the newest older one with the same kind of segment data, for per-segment change. */
export function segmentScans(scans: BodyScan[], measuredAt: number, kind: "segmentalLean" | "segmentalFat" | "segmentalEcw") {
  const i = scans.findIndex((s) => s.measuredAt === measuredAt && s[kind]);
  if (i < 0) return { current: null, previous: null };
  return { current: scans[i]!, previous: scans.slice(i + 1).find((s) => s[kind]) ?? null };
}

/** Right vs left of a pair, as InBody reads it: the difference as % of the larger, even under 5 %. */
export function pairBalance(right: number, left: number) {
  const diff = right - left;
  const pct = Math.max(right, left) > 0 ? (Math.abs(diff) / Math.max(right, left)) * 100 : 0;
  return { diff, pct, even: pct < 5, stronger: Math.abs(diff) < 0.005 ? null : diff > 0 ? ("right" as const) : ("left" as const) };
}

/** Segment ECW ratio band: InBody's normal is up to 0.390, 0.360 the floor. */
export const ecwBand = (ratio: number): "low" | "normal" | "high" => (ratio > 0.39 ? "high" : ratio < 0.36 ? "low" : "normal");

/** InBody's body composition analysis: weight = water + protein + minerals + fat (only when all four are there). */
export function waterProteinMineralFat(s: BodyScan) {
  if (s.totalBodyWater == null || s.protein == null || s.mineral == null || s.bodyFatMass == null) return null;
  return [
    { key: "water", title: "Agua", kg: s.totalBodyWater },
    { key: "protein", title: "Proteína", kg: s.protein },
    { key: "mineral", title: "Minerales", kg: s.mineral },
    { key: "fat", title: "Grasa", kg: s.bodyFatMass },
  ];
}
