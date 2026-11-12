// Cuerpo: weigh-ins (morning and evening are distinct series), InBody scans,
// body goals, and the weight goal that decides the day's budget.
import type { LifeClient } from "../index";
import type { BodyGoal, BodyGoalMetric, BodyScan, GoalMode, PulsoSettings, TimeOfDay, WeighIn } from "../types";
import { bodyAnalysis, type BodyAnalysis, type BodyMetric, BODY_METRICS, project, type Projection, type Reading, type ScanView } from "./body-analysis";
import { completeScan, FIELDS, hasComposition, parseInBody, parseInBodyCsv, round, type CsvSkip, type ScanInput, type ScanValues, type Segmental, VALUE_KEYS } from "./body-parse";
import { type Budget, computeBudget } from "./budget";
import { must, PulsoError, pulso, userId } from "./core";
import { addDays, localDate, timeOfDay } from "./dates";
import { getSettings, updateSettings } from "./settings";

export * from "./body-analysis";
export * from "./body-parse";

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** A stored scan row as the analysis reads it. */
export function scanView(row: BodyScan): ScanView {
  const m = row.metrics ?? {};
  const values = Object.fromEntries(VALUE_KEYS.map((k) => [k, typeof m[k] === "number" ? m[k] : null])) as ScanValues;
  values.weight = row.weight_kg ?? values.weight;
  values.percentBodyFat = values.percentBodyFat ?? row.fat_pct;
  const seg = (s: Partial<Segmental> | undefined): Segmental | null =>
    s && ["rightArm", "leftArm", "trunk", "rightLeg", "leftLeg"].every((k) => typeof s[k as keyof Segmental] === "number") ? (s as Segmental) : null;
  return {
    ...completeScan(values),
    id: row.id,
    measuredAt: Date.parse(row.scanned_at),
    source: row.source === "inbody" ? "inbody" : "manual",
    device: row.device,
    segmentalLean: seg(row.segmental?.lean),
    segmentalFat: seg(row.segmental?.fat),
  };
}

/** A scan input as a body_scans row. Throws when it is not plausible. */
export function scanRow(input: ScanInput, uid: string) {
  const s = completeScan(input);
  if (s.weight == null && !hasComposition(s)) throw new PulsoError("Un escaneo necesita el peso, o dos de músculo, grasa (kg) o grasa (%).", "invalid");
  for (const k of VALUE_KEYS) {
    const v = s[k];
    if (v != null && (v <= 0 || v > FIELDS[k])) throw new PulsoError(`Valor fuera de rango: ${k}.`, "invalid");
  }
  const metrics: Record<string, number> = {};
  for (const k of VALUE_KEYS) if (k !== "weight" && s[k] != null) metrics[k] = s[k]!;
  const segmental: BodyScan["segmental"] = {};
  if (s.segmentalLean) segmental.lean = s.segmentalLean;
  if (s.segmentalFat) segmental.fat = s.segmentalFat;
  if (s.segmentalEcw) segmental.ecw = s.segmentalEcw;
  return {
    user_id: uid,
    scanned_at: new Date(s.measuredAt).toISOString(),
    weight_kg: s.weight,
    fat_pct: s.percentBodyFat,
    muscle_pct: s.weight && s.skeletalMuscleMass ? round((s.skeletalMuscleMass / s.weight) * 100, 2) : null,
    source: s.source,
    device: s.device,
    external_id: s.externalId,
    metrics,
    segmental,
    regions: {},
  };
}

export type DayWeights = { date: string; morning: number | null; evening: number | null; other: number | null; swing: number | null };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** One row per local date from `today - days + 1` to `today`: morning, evening (medians) and the swing (evening − morning). */
export function dailyWeights(weighIns: Pick<WeighIn, "measured_at" | "weight_kg" | "time_of_day">[], tz: string, today: string, days: number): DayWeights[] {
  const by = new Map<string, { morning: number[]; evening: number[]; other: number[] }>();
  for (const w of weighIns) {
    const d = localDate(w.measured_at, tz);
    const e = by.get(d) ?? { morning: [], evening: [], other: [] };
    (w.time_of_day === "morning" ? e.morning : w.time_of_day === "evening" ? e.evening : e.other).push(Number(w.weight_kg));
    by.set(d, e);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1);
    const e = by.get(date);
    const morning = e ? median(e.morning) : null;
    const evening = e ? median(e.evening) : null;
    return { date, morning, evening, other: e ? median(e.other) : null, swing: morning != null && evening != null ? round(evening - morning, 2) : null };
  });
}

/** Readings that drive the weight trend: the morning ones, or every weigh-in while there are fewer than 3 mornings. */
export function trendReadings(weighIns: Pick<WeighIn, "measured_at" | "weight_kg" | "time_of_day">[]): Reading[] {
  const toReading = (w: Pick<WeighIn, "measured_at" | "weight_kg">) => ({ at: Date.parse(w.measured_at), value: Number(w.weight_kg) });
  const mornings = weighIns.filter((w) => w.time_of_day === "morning");
  const days = new Set(mornings.map((w) => w.measured_at.slice(0, 10)));
  return (days.size >= 3 ? mornings : weighIns).map(toReading);
}

/** Readings for a metric from scans (oldest order not required). */
export function scanReadings(scans: ScanView[], metric: BodyMetric): Reading[] {
  return scans.filter((s) => s[metric] != null).map((s) => ({ at: s.measuredAt, value: s[metric]! }));
}

/** Mean of the last N days' swings (evening − morning), or null. */
export function averageSwing(days: DayWeights[]): number | null {
  const s = days.map((d) => d.swing).filter((v): v is number => v != null);
  return s.length ? round(s.reduce((a, b) => a + b, 0) / s.length, 2) : null;
}

// ---------------------------------------------------------------------------
// Weigh-ins
// ---------------------------------------------------------------------------

export async function listWeighIns(client: LifeClient, days = 365): Promise<WeighIn[]> {
  const since = new Date(Date.now() - days * DAY).toISOString();
  return must(await pulso(client).from("weigh_ins").select("*").gte("measured_at", since).order("measured_at", { ascending: false }).limit(2000));
}

export type WeighInInput = { weightKg: number; at?: Date; timeOfDay?: TimeOfDay | null; note?: string | null };

const checkWeight = (kg: number) => {
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) throw new PulsoError("Ese peso no parece correcto.", "invalid");
};

/** Adds a weigh-in; morning/evening comes from its local hour unless given. */
export async function addWeighIn(client: LifeClient, input: WeighInInput): Promise<WeighIn> {
  checkWeight(input.weightKg);
  const uid = await userId(client);
  const s = await getSettings(client);
  const at = input.at ?? new Date();
  return must(
    await pulso(client)
      .from("weigh_ins")
      .insert({
        user_id: uid,
        measured_at: at.toISOString(),
        weight_kg: round(input.weightKg, 2),
        time_of_day: input.timeOfDay ?? timeOfDay(at, s.timezone),
        source: "manual",
        note: input.note ?? null,
      })
      .select("*")
      .single(),
  );
}

export async function updateWeighIn(client: LifeClient, id: string, input: Partial<WeighInInput>): Promise<WeighIn> {
  const patch: Partial<WeighIn> = {};
  if (input.weightKg != null) {
    checkWeight(input.weightKg);
    patch.weight_kg = round(input.weightKg, 2);
  }
  if (input.at) patch.measured_at = input.at.toISOString();
  if (input.timeOfDay) patch.time_of_day = input.timeOfDay;
  if (input.note !== undefined) patch.note = input.note;
  return must(await pulso(client).from("weigh_ins").update(patch).eq("id", id).select("*").single());
}

export async function deleteWeighIn(client: LifeClient, id: string): Promise<void> {
  const { error } = await pulso(client).from("weigh_ins").delete().eq("id", id);
  if (error) throw new PulsoError(error.message);
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export async function listScans(client: LifeClient, limit = 200): Promise<BodyScan[]> {
  return must(await pulso(client).from("body_scans").select("*").order("scanned_at", { ascending: false }).limit(limit));
}

/** Saves a scan; one with an external id (an InBody test) replaces the earlier copy of the same test. */
export async function saveScan(client: LifeClient, input: ScanInput): Promise<BodyScan> {
  const uid = await userId(client);
  const row = scanRow(input, uid);
  if (row.external_id) {
    const existing = await pulso(client).from("body_scans").select("id").eq("external_id", row.external_id).maybeSingle();
    if (existing.data) return must(await pulso(client).from("body_scans").update(row).eq("id", existing.data.id).select("*").single());
  }
  return must(await pulso(client).from("body_scans").insert(row).select("*").single());
}

export async function deleteScan(client: LifeClient, id: string): Promise<void> {
  const { error } = await pulso(client).from("body_scans").delete().eq("id", id);
  if (error) throw new PulsoError(error.message);
}

/** Imports an InBody/LookinBody CSV export; returns how many were saved and what was skipped. */
export async function importInBodyCsv(client: LifeClient, text: string): Promise<{ saved: number; skipped: CsvSkip[] }> {
  const s = await getSettings(client);
  const { scans, skipped } = parseInBodyCsv(text, s.timezone);
  if (!scans.length && !skipped.length) throw new PulsoError("No encontré mediciones en el archivo.", "invalid");
  for (const scan of scans) await saveScan(client, scan);
  return { saved: scans.length, skipped };
}

/** Reads the text of an InBody QR and saves it. */
export async function saveInBodyQr(client: LifeClient, text: string): Promise<BodyScan> {
  const s = await getSettings(client);
  const parsed = parseInBody(text, { tz: s.timezone });
  if (!parsed.ok) throw new PulsoError(parsed.message, "invalid");
  return saveScan(client, parsed.scan);
}

// ---------------------------------------------------------------------------
// Goals and budget
// ---------------------------------------------------------------------------

export async function listBodyGoals(client: LifeClient): Promise<BodyGoal[]> {
  return must(await pulso(client).from("body_goals").select("*"));
}

/** Sets (or, with null, clears) a metric's target. */
export async function setBodyGoal(client: LifeClient, metric: BodyGoalMetric, target: number | null): Promise<void> {
  const uid = await userId(client);
  if (target == null) {
    const { error } = await pulso(client).from("body_goals").delete().eq("metric", metric);
    if (error) throw new PulsoError(error.message);
    return;
  }
  if (!(target > 0)) throw new PulsoError("La meta debe ser mayor a cero.", "invalid");
  must(await pulso(client).from("body_goals").upsert({ user_id: uid, metric, target: round(target, 2), set_at: new Date().toISOString() }).select("*").single());
}

/** Current weight for the budget: the morning trend's level, else the latest weigh-in, else the latest scan. */
export function currentWeight(weighIns: WeighIn[], scans: ScanView[]): number | null {
  const trend = project("weight", trendReadings(weighIns));
  if (trend.current != null) return trend.current;
  const last = weighIns[0]?.weight_kg ?? scans.find((s) => s.weight != null)?.weight ?? null;
  return last == null ? null : Number(last);
}

export function budgetFor(settings: PulsoSettings, weightKg: number | null, scans: ScanView[], today: string): Budget {
  return computeBudget({ settings, weightKg, scanBmr: scans.find((s) => s.bmr != null)?.bmr ?? null, today });
}

export type WeightGoalInput = { goalWeightKg: number | null; mode: GoalMode | null; reachBy: string | null };

/**
 * Saves the weight goal; the goal decides the budget: it recomputes it and
 * stores the kcal in settings.daily_kcal_budget (and the goal weight as a body goal).
 */
export async function saveWeightGoal(client: LifeClient, input: WeightGoalInput): Promise<Budget> {
  if (input.goalWeightKg != null) checkWeight(input.goalWeightKg);
  const settings = await getSettings(client);
  const today = localDate(new Date(), settings.timezone);
  if (input.reachBy && input.reachBy <= today) throw new PulsoError("La fecha meta tiene que ser después de hoy.", "invalid");
  const [weighIns, scanRows] = await Promise.all([listWeighIns(client, 180), listScans(client, 20)]);
  const scans = scanRows.map(scanView);
  const next = { ...settings, goal_weight_kg: input.goalWeightKg, goal_mode: input.mode, goal_reach_by: input.reachBy };
  const budget = budgetFor(next, currentWeight(weighIns, scans), scans, today);
  await updateSettings(client, {
    goal_weight_kg: input.goalWeightKg,
    goal_mode: input.mode,
    goal_reach_by: input.reachBy,
    daily_kcal_budget: budget.kcal,
  });
  await setBodyGoal(client, "weight", input.goalWeightKg);
  return budget;
}

/** Sets or clears the hand-set calorie target (it wins over the goal's). */
export async function setManualKcal(client: LifeClient, kcal: number | null): Promise<void> {
  if (kcal != null && (kcal < 800 || kcal > 8000)) throw new PulsoError("Ese presupuesto no parece correcto.", "invalid");
  await updateSettings(client, { kcal_target: kcal == null ? null : Math.round(kcal) });
  await saveWeightGoal(client, await getSettings(client).then((s) => ({ goalWeightKg: s.goal_weight_kg, mode: s.goal_mode, reachBy: s.goal_reach_by })));
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type BodySummary = {
  morning: WeighIn | null;
  evening: WeighIn | null;
  trend: { level: number; slopePerWeek: number } | null;
  /** Last 7 local days' morning weight, oldest first. */
  series7: (number | null)[];
  goal: { weightKg: number | null; mode: GoalMode | null; reachBy: string | null };
  lastScan: BodyScan | null;
  budget: Budget;
};

/** What Hoy shows of the body: today's morning/evening weigh-ins, the trend, the goal and the budget it sets. */
export async function getBodySummary(client: LifeClient): Promise<BodySummary> {
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const [weighIns, scanRows] = await Promise.all([listWeighIns(client, 180), listScans(client, 10)]);
  const scans = scanRows.map(scanView);
  const todays = weighIns.filter((w) => localDate(w.measured_at, tz) === today);
  const proj = project("weight", trendReadings(weighIns));
  return {
    morning: todays.find((w) => w.time_of_day === "morning") ?? null,
    evening: todays.find((w) => w.time_of_day === "evening") ?? null,
    trend: proj.current != null && proj.slopePerWeek != null ? { level: proj.current, slopePerWeek: proj.slopePerWeek } : null,
    series7: dailyWeights(weighIns, tz, today, 7).map((d) => d.morning),
    goal: { weightKg: settings.goal_weight_kg, mode: settings.goal_mode, reachBy: settings.goal_reach_by },
    lastScan: scanRows[0] ?? null,
    budget: budgetFor(settings, currentWeight(weighIns, scans), scans, today),
  };
}

export type BodyOverview = {
  settings: PulsoSettings;
  today: string;
  weighIns: WeighIn[];
  days: DayWeights[];
  swing: number | null;
  scans: BodyScan[];
  views: ScanView[];
  goals: BodyGoal[];
  /** Weight from the morning series; fat, muscle and % fat from scans. */
  projections: Projection[];
  /** Evening weigh-ins' own trend (kept apart from the morning one). */
  eveningProjection: Projection;
  analysis: BodyAnalysis;
  budget: Budget;
  weightNow: number | null;
};

/** Everything the Cuerpo page needs. */
export async function getBodyOverview(client: LifeClient): Promise<BodyOverview> {
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const [weighIns, scans, goals] = await Promise.all([listWeighIns(client, 365), listScans(client, 200), listBodyGoals(client)]);
  const views = scans.map(scanView);
  const goalOf = (m: BodyMetric) => goals.find((g) => g.metric === m)?.target ?? (m === "weight" ? settings.goal_weight_kg : null);
  const days = dailyWeights(weighIns, tz, today, 30);
  const projections = BODY_METRICS.map((m) =>
    project(m, m === "weight" ? trendReadings(weighIns) : scanReadings(views, m), goalOf(m)),
  ).filter((p) => p.observed.length > 0);
  const evenings = weighIns.filter((w) => w.time_of_day === "evening").map((w) => ({ at: Date.parse(w.measured_at), value: Number(w.weight_kg) }));
  const weightNow = currentWeight(weighIns, views);
  return {
    settings,
    today,
    weighIns,
    days,
    swing: averageSwing(days),
    scans,
    views,
    goals,
    projections,
    eveningProjection: project("weight", evenings),
    analysis: bodyAnalysis(views, { heightCm: settings.height_cm, sex: settings.sex }),
    budget: budgetFor(settings, weightNow, views, today),
    weightNow,
  };
}
