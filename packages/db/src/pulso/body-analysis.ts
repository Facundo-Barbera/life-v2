// Pure body analysis, ported from the old engine (body/projection.ts and
// body/standards.ts): a robust trend and projection per metric, and the
// InBody-style analysis of weight, muscle, fat and each segment against the
// standard for the person's height and sex.
import { round, type ScanValues, type Segmental, type SegmentKey, type ScanSource } from "./body-parse";

/** A stored scan as the analysis reads it. `measuredAt` is epoch ms. */
export type ScanView = ScanValues & {
  id: string;
  measuredAt: number;
  source: ScanSource;
  device: string | null;
  segmentalLean: Segmental | null;
  segmentalFat: Segmental | null;
};

// ---------------------------------------------------------------------------
// Projection (Theil–Sen)
// ---------------------------------------------------------------------------

export type BodyMetric = "weight" | "bodyFatMass" | "skeletalMuscleMass" | "percentBodyFat";
export const BODY_METRICS: BodyMetric[] = ["weight", "bodyFatMass", "skeletalMuscleMass", "percentBodyFat"];

const DAY = 86_400_000;
const WINDOW_DAYS = 120;
const Z80 = 1.2816;
export const HORIZON_WEEKS = [4, 8, 12];

export const METRIC_UNIT: Record<BodyMetric, "kg" | "%"> = { weight: "kg", bodyFatMass: "kg", skeletalMuscleMass: "kg", percentBodyFat: "%" };
export const METRIC_LABEL: Record<BodyMetric, string> = { weight: "Peso", bodyFatMass: "Masa grasa", skeletalMuscleMass: "Músculo", percentBodyFat: "% de grasa" };
const PHRASE: Record<BodyMetric, (v: string) => string> = {
  weight: (v) => `${v} kg`,
  bodyFatMass: (v) => `${v} kg de grasa`,
  skeletalMuscleMass: (v) => `${v} kg de músculo`,
  percentBodyFat: (v) => `${v}% de grasa`,
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

export type Reading = { at: number; value: number };

/** One point per calendar day (UTC): median value at the day's mean time. Oldest first. */
export function dailyMedians(points: Reading[]): Reading[] {
  const days = new Map<number, Reading[]>();
  for (const p of points) {
    const day = Math.floor(p.at / DAY);
    days.set(day, [...(days.get(day) ?? []), p]);
  }
  return [...days.values()]
    .map((ps) => ({ at: Math.round(ps.reduce((s, p) => s + p.at, 0) / ps.length), value: median(ps.map((p) => p.value)) }))
    .sort((a, b) => a.at - b.at);
}

export type Trend = {
  level: number;
  /** Units per day. */
  slope: number;
  lastAt: number;
  at: (days: number) => { value: number; low: number; high: number };
};

/** Theil–Sen fit. Needs ≥3 days spanning ≥7 days; otherwise null. */
export function fitTrend(points: Reading[]): Trend | null {
  if (points.length < 3) return null;
  const lastAt = points[points.length - 1]!.at;
  const xs = points.map((p) => (p.at - lastAt) / DAY);
  const ys = points.map((p) => p.value);
  if (xs[xs.length - 1]! - xs[0]! < 7) return null;
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) if (xs[j]! !== xs[i]!) slopes.push((ys[j]! - ys[i]!) / (xs[j]! - xs[i]!));
  }
  const slope = median(slopes);
  const level = median(ys.map((y, i) => y - slope * xs[i]!));
  const residuals = ys.map((y, i) => y - (level + slope * xs[i]!));
  const sigma = 1.4826 * median(residuals.map((r) => Math.abs(r - median(residuals))));
  const xMean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sxx = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const n = xs.length;
  return {
    level,
    slope,
    lastAt,
    at: (days) => {
      const value = level + slope * days;
      const spread = Z80 * sigma * Math.sqrt(1 + 1 / n + (days - xMean) ** 2 / sxx);
      return { value, low: value - spread, high: value + spread };
    },
  };
}

const fmt1 = (v: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(v);

export function formatDay(at: number, now: number): string {
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(at).replace(".", "");
}

/** When the trend reaches `target`, and a sentence for the person. Gives up past two years. */
export function goalEta(metric: BodyMetric, trend: Trend, target: number, now = Date.now()): { eta: number | null; message: string } {
  const label = PHRASE[metric](fmt1(target));
  const gap = target - trend.level;
  if (Math.abs(gap) <= 0.3) return { eta: null, message: `Ya estás en tu objetivo de ${label}.` };
  if (Math.abs(trend.slope) < 1e-6 || Math.sign(gap) !== Math.sign(trend.slope)) return { eta: null, message: `A este ritmo no te acercas a ${label}.` };
  const days = gap / trend.slope;
  if (days > 730) return { eta: null, message: `A este ritmo faltan más de dos años para ${label}.` };
  const eta = trend.lastAt + days * DAY;
  return { eta, message: `A este ritmo llegas a ${label} alrededor del ${formatDay(eta, now)}.` };
}

export type ProjectionPoint = { at: number; value: number; low: number; high: number };

export type Projection = {
  metric: BodyMetric;
  unit: "kg" | "%";
  observed: Reading[];
  current: number | null;
  slopePerWeek: number | null;
  band: ProjectionPoint[];
  horizons: (ProjectionPoint & { weeks: number })[];
  goal: { target: number; eta: number | null; message: string } | null;
  note: string;
};

const point = (trend: Trend, days: number): ProjectionPoint => {
  const p = trend.at(days);
  return { at: Math.round(trend.lastAt + days * DAY), value: round(p.value), low: round(p.low), high: round(p.high) };
};

export function project(metric: BodyMetric, readings: Reading[], goalTarget?: number | null, now = Date.now()): Projection {
  const daily = dailyMedians(readings);
  const lastAt = daily[daily.length - 1]?.at ?? 0;
  const observed = daily.filter((p) => p.at >= lastAt - WINDOW_DAYS * DAY);
  const trend = fitTrend(observed);
  const base = { metric, unit: METRIC_UNIT[metric], observed: observed.map((p) => ({ at: p.at, value: round(p.value) })) };
  if (!trend) {
    return {
      ...base, current: null, slopePerWeek: null, band: [], horizons: [], goal: null,
      note: "Hacen falta al menos 3 mediciones en días distintos, separadas por una semana o más, para proyectar.",
    };
  }
  const firstDays = (observed[0]!.at - trend.lastAt) / DAY;
  const band: ProjectionPoint[] = [];
  for (let d = firstDays; d < 84; d += 7) band.push(point(trend, d));
  band.push(point(trend, 84));
  const perWeek = trend.slope * 7;
  const unit = METRIC_UNIT[metric] === "%" ? " puntos" : " kg";
  const note = Math.abs(perWeek) < 0.05 ? "Estable." : `${perWeek < 0 ? "Bajando" : "Subiendo"} ${fmt1(Math.abs(perWeek))}${unit} por semana.`;
  return {
    ...base,
    current: round(trend.level),
    slopePerWeek: round(perWeek, 3),
    band,
    horizons: HORIZON_WEEKS.map((weeks) => ({ weeks, ...point(trend, weeks * 7) })),
    goal: goalTarget != null ? { target: goalTarget, ...goalEta(metric, trend, goalTarget, now) } : null,
    note,
  };
}

// ---------------------------------------------------------------------------
// Standards (InBody-style analysis)
// ---------------------------------------------------------------------------
// Standard weight = BMI 22 (men) / 21.5 (women) × height²; standard fat 15 % /
// 23 %; muscle-fat normal ranges in % of standard: weight 85–115, SMM 90–110,
// fat 80–160. Standard SMM ≈ standard FFM × 0.56 / 0.55. Segment standards are
// typical shares of the standard lean/fat mass. Approximations for colour and
// direction, not InBody's proprietary tables.

export type Sex = "male" | "female" | null;
export type BodyBand = "low" | "normal" | "high";
export const BAND_LABEL: Record<BodyBand, string> = { low: "Bajo", normal: "Normal", high: "Alto" };

const BY_SEX = {
  male: { bmi: 22, fat: 0.15, smm: 0.56, pbf: [10, 20], pbfTicks: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] },
  female: { bmi: 21.5, fat: 0.23, smm: 0.55, pbf: [18, 28], pbfTicks: [8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58] },
};
const SHARES = {
  male: { lean: { arm: 0.055, trunk: 0.42, leg: 0.15 }, fat: { arm: 0.06, trunk: 0.48, leg: 0.17 } },
  female: { lean: { arm: 0.047, trunk: 0.435, leg: 0.148 }, fat: { arm: 0.085, trunk: 0.43, leg: 0.19 } },
};
const mean = (a: number, b: number) => (a + b) / 2;

export function constants(sex: Sex) {
  if (sex) return { ...BY_SEX[sex], shares: SHARES[sex] };
  const [m, f] = [BY_SEX.male, BY_SEX.female];
  const share = (k: "lean" | "fat", s: "arm" | "trunk" | "leg") => mean(SHARES.male[k][s], SHARES.female[k][s]);
  return {
    bmi: mean(m.bmi, f.bmi),
    fat: mean(m.fat, f.fat),
    smm: mean(m.smm, f.smm),
    pbf: [mean(m.pbf[0]!, f.pbf[0]!), mean(m.pbf[1]!, f.pbf[1]!)],
    pbfTicks: m.pbfTicks.map((t, i) => mean(t, f.pbfTicks[i]!)),
    shares: {
      lean: { arm: share("lean", "arm"), trunk: share("lean", "trunk"), leg: share("lean", "leg") },
      fat: { arm: share("fat", "arm"), trunk: share("fat", "trunk"), leg: share("fat", "leg") },
    },
  };
}

/** Standard weight, fat and skeletal muscle (kg) for a height. */
export function standards(heightCm: number, sex: Sex) {
  const c = constants(sex);
  const weight = c.bmi * (heightCm / 100) ** 2;
  return { weight, fat: weight * c.fat, smm: weight * (1 - c.fat) * c.smm };
}

const AXES = {
  weight: { normal: [85, 115], ticks: [55, 70, 85, 100, 115, 130, 145, 160, 175, 190, 205] },
  skeletalMuscleMass: { normal: [90, 110], ticks: [70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170] },
  bodyFatMass: { normal: [80, 160], ticks: [40, 60, 80, 100, 160, 220, 280, 340, 400, 460, 520] },
  bmi: { normal: [18.5, 25], ticks: [10, 15, 18.5, 21, 25, 30, 35, 40, 45, 50, 55] },
  visceralFatLevel: { normal: [1, 9], ticks: [1, 5, 10, 15, 20] },
} as const;

/** 0–1 along a bar whose `ticks` are drawn evenly spaced; clamped to the ends. */
export function axisPosition(ticks: readonly number[], value: number): number {
  const last = ticks.length - 1;
  if (value <= ticks[0]!) return 0;
  if (value >= ticks[last]!) return 1;
  const i = ticks.findIndex((t) => t > value) - 1;
  return (i + (value - ticks[i]!) / (ticks[i + 1]! - ticks[i]!)) / last;
}

export const band = (value: number, low: number, high: number): BodyBand => (value < low ? "low" : value > high ? "high" : "normal");

const r1 = (n: number) => Math.round(n * 10) / 10;
const tick = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 });

export type GaugeMetric = "weight" | "skeletalMuscleMass" | "bodyFatMass" | "bmi" | "percentBodyFat" | "visceralFatLevel";

export type BodyGauge = {
  metric: GaugeMetric;
  measuredAt: number;
  value: number;
  previous: number | null;
  unit: string;
  normal: { low: number; high: number };
  band: BodyBand;
  /** % of the standard, for weight/muscle/fat. */
  percent: number | null;
  /** Positions 0–1 on the bar. */
  at: { value: number; previous: number | null; low: number; high: number };
  ticks: string[];
};

function gauge(metric: GaugeMetric, unit: string, scan: ScanView, previous: number | null, axis: { normal: readonly number[]; ticks: readonly number[] }, standard?: number): BodyGauge {
  const value = scan[metric]!;
  const toAxis = (v: number) => (standard ? (v / standard) * 100 : v);
  const fromAxis = (v: number) => (standard ? (v * standard) / 100 : v);
  const [low, high] = axis.normal as [number, number];
  return {
    metric,
    measuredAt: scan.measuredAt,
    value,
    previous,
    unit,
    normal: { low: r1(fromAxis(low)), high: r1(fromAxis(high)) },
    band: band(toAxis(value), low, high),
    percent: standard ? Math.round(toAxis(value)) : null,
    at: {
      value: axisPosition(axis.ticks, toAxis(value)),
      previous: previous == null ? null : axisPosition(axis.ticks, toAxis(previous)),
      low: axisPosition(axis.ticks, low),
      high: axisPosition(axis.ticks, high),
    },
    ticks: axis.ticks.map(tick),
  };
}

/** Height from the profile, else from a scan's weight and BMI. */
export function heightOf(heightCm: number | null, scans: ScanView[]): { cm: number; from: "profile" | "scan" } | null {
  if (heightCm) return { cm: heightCm, from: "profile" };
  const scan = scans.find((s) => s.weight && s.bmi);
  return scan ? { cm: r1(Math.sqrt(scan.weight! / scan.bmi!) * 100), from: "scan" } : null;
}

export type SegmentValue = { kg: number; percent: number | null; band: BodyBand | null };
const SEGMENT_KIND: Record<SegmentKey, "arm" | "trunk" | "leg"> = { rightArm: "arm", leftArm: "arm", trunk: "trunk", rightLeg: "leg", leftLeg: "leg" };

export function segmentValues(values: Segmental, whole: number | null, shares: Record<"arm" | "trunk" | "leg", number>, normal: [number, number]): Record<SegmentKey, SegmentValue> {
  const entry = (key: SegmentKey): SegmentValue => {
    const kg = values[key];
    if (!whole) return { kg, percent: null, band: null };
    const percent = Math.round((kg / (whole * shares[SEGMENT_KIND[key]])) * 100);
    return { kg, percent, band: band(percent, normal[0], normal[1]) };
  };
  return { rightArm: entry("rightArm"), leftArm: entry("leftArm"), trunk: entry("trunk"), rightLeg: entry("rightLeg"), leftLeg: entry("leftLeg") };
}

/** Left-right for arms and legs (within 5 % is even), and upper vs lower body. */
export function balance(lean: Record<SegmentKey, SegmentValue>): { text: string; even: boolean }[] {
  const pair = (plural: string, right: SegmentValue, left: SegmentValue, singular: string) => {
    const gap = Math.abs(right.kg - left.kg) / Math.max(right.kg, left.kg, 0.001);
    if (gap < 0.05) return { text: `${plural} equilibrad${plural === "Brazos" ? "os" : "as"}`, even: true };
    return { text: `${singular} ${right.kg < left.kg ? "der." : "izq."} ${Math.round(gap * 100)} % menos`, even: false };
  };
  const out = [pair("Brazos", lean.rightArm, lean.leftArm, "Brazo"), pair("Piernas", lean.rightLeg, lean.leftLeg, "Pierna")];
  const avg = (a: SegmentValue, b: SegmentValue) => (a.percent != null && b.percent != null ? (a.percent + b.percent) / 2 : null);
  const upper = avg(lean.rightArm, lean.leftArm);
  const lower = avg(lean.rightLeg, lean.leftLeg);
  if (upper != null && lower != null) {
    const gap = upper - lower;
    out.push(Math.abs(gap) <= 10 ? { text: "Tren superior e inferior a la par", even: true } : { text: gap > 0 ? "Más desarrollo arriba que abajo" : "Más desarrollo abajo que arriba", even: false });
  }
  return out;
}

export type BodyAnalysis = {
  basis: { heightCm: number; heightFrom: "profile" | "scan"; sex: Sex; standardWeight: number } | null;
  muscleFat: { measuredAt: number; gauges: BodyGauge[] } | null;
  obesity: BodyGauge[];
  segments: {
    measuredAt: number;
    basis: "height" | "weight";
    lean: Record<SegmentKey, SegmentValue> | null;
    fat: Record<SegmentKey, SegmentValue> | null;
    balance: { text: string; even: boolean }[];
  } | null;
};

/** The InBody-style analysis for the scans (newest first). */
export function bodyAnalysis(scans: ScanView[], profile: { heightCm: number | null; sex: Sex }): BodyAnalysis {
  const sex = profile.sex;
  const c = constants(sex);
  const height = heightOf(profile.heightCm, scans);
  const std = height ? standards(height.cm, sex) : null;
  const previous = (key: GaugeMetric, after: ScanView) => scans.slice(scans.indexOf(after) + 1).find((s) => s[key] != null)?.[key] ?? null;
  const newest = (key: "bmi" | "percentBodyFat" | "visceralFatLevel") => scans.find((s) => s[key] != null);

  const full = scans.find((s) => s.weight != null && s.skeletalMuscleMass != null && s.bodyFatMass != null);
  const muscleFat =
    full && std
      ? {
          measuredAt: full.measuredAt,
          gauges: [
            gauge("weight", "kg", full, previous("weight", full), AXES.weight, std.weight),
            gauge("skeletalMuscleMass", "kg", full, previous("skeletalMuscleMass", full), AXES.skeletalMuscleMass, std.smm),
            gauge("bodyFatMass", "kg", full, previous("bodyFatMass", full), AXES.bodyFatMass, std.fat),
          ],
        }
      : null;

  const obesity: BodyGauge[] = [];
  const bmi = newest("bmi");
  if (bmi) obesity.push(gauge("bmi", "kg/m²", bmi, previous("bmi", bmi), AXES.bmi));
  const pbf = newest("percentBodyFat");
  if (pbf) obesity.push(gauge("percentBodyFat", "%", pbf, previous("percentBodyFat", pbf), { normal: c.pbf, ticks: c.pbfTicks }));
  const visceral = newest("visceralFatLevel");
  if (visceral) obesity.push(gauge("visceralFatLevel", "nivel", visceral, previous("visceralFatLevel", visceral), AXES.visceralFatLevel));

  const seg = scans.find((s) => s.segmentalLean || s.segmentalFat);
  let segments: BodyAnalysis["segments"] = null;
  if (seg) {
    const basisWeight = std?.weight ?? seg.weight;
    const lean = seg.segmentalLean && segmentValues(seg.segmentalLean, basisWeight ? basisWeight * (1 - c.fat) : null, c.shares.lean, [90, 110]);
    const fat = seg.segmentalFat && segmentValues(seg.segmentalFat, basisWeight ? basisWeight * c.fat : null, c.shares.fat, [80, 160]);
    segments = { measuredAt: seg.measuredAt, basis: std ? "height" : "weight", lean, fat, balance: lean ? balance(lean) : [] };
  }

  return {
    basis: height && std ? { heightCm: height.cm, heightFrom: height.from, sex, standardWeight: r1(std.weight) } : null,
    muscleFat,
    obesity,
    segments,
  };
}
