/**
 * Sustancias: a private, non-judgmental log of when the person uses something
 * (Cannabis and Alcohol seeded per person; they can add their own), to see how
 * often. Ported from the old engine's substances/store.ts and summary.ts.
 * Uses reach life.hechos only when settings.substances_in_timeline is on (the
 * trigger decides). Neutral wording, never a lecture.
 */
import type { LifeClient } from "../index";
import type { Substance as SubstanceRow, SubstanceEntry as EntryRow } from "../types";
import { must, pulso, PulsoError, userId } from "./core";
import { addDays, isoWeekday, localDate, localTime, zonedInstant } from "./dates";
import { computeReadiness, listDailySignals } from "./readiness";
import { getSettings } from "./settings";
import { describeNights, nightFromRow, pickNights } from "./sleep";

export const AMOUNTS = ["poco", "normal", "mucho"] as const;
export const CONTEXTS = ["social", "solo", "dormir", "estres", "otro"] as const;
export type SubstanceAmount = (typeof AMOUNTS)[number];
export type SubstanceContext = (typeof CONTEXTS)[number];

export const AMOUNT_LABEL: Record<SubstanceAmount, string> = { poco: "Poco", normal: "Normal", mucho: "Mucho" };
export const CONTEXT_LABEL: Record<SubstanceContext, string> = { social: "Social", solo: "Solo", dormir: "Para dormir", estres: "Estrés", otro: "Otro" };

export const BUILTINS = [
  { slug: "cannabis", name: "Cannabis", unit: "sesiones", forms: ["fumado", "vapeado", "comestible", "otro"] },
  { slug: "alcohol", name: "Alcohol", unit: "tragos", forms: [] as string[] },
] as const;

export type Substance = {
  id: string;
  slug: string | null;
  name: string;
  symbol: string | null;
  unit: string;
  forms: string[];
  maxDaysPerWeek: number | null;
  archived: boolean;
  position: number;
  builtin: boolean;
};

export type SubstanceUse = {
  id: string;
  substanceId: string;
  /** Local date and time in the person's timezone. */
  date: string;
  time: string;
  usedAt: string;
  form: string | null;
  amount: SubstanceAmount;
  quantity: number | null;
  thcMg: number | null;
  context: SubstanceContext | null;
  note: string | null;
};

const toSubstance = (r: SubstanceRow): Substance => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  symbol: r.symbol,
  unit: r.unit,
  forms: r.forms ?? [],
  maxDaysPerWeek: r.max_days_per_week,
  archived: r.archived,
  position: r.position,
  builtin: r.builtin,
});

const toUse = (r: EntryRow, tz: string): SubstanceUse => ({
  id: r.id,
  substanceId: r.substance_id,
  date: r.local_date,
  time: localTime(r.used_at, tz),
  usedAt: r.used_at,
  form: r.form,
  amount: (AMOUNTS as readonly string[]).includes(r.amount) ? (r.amount as SubstanceAmount) : "normal",
  quantity: r.count === null ? null : Number(r.count),
  thcMg: r.thc_mg === null ? null : Number(r.thc_mg),
  context: (CONTEXTS as readonly string[]).includes(r.context ?? "") ? (r.context as SubstanceContext) : null,
  note: r.note,
});

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Substances ──────────────────────────────────────────────────────────────

/** Cannabis and Alcohol, once per person (an archived one stays archived). */
export async function ensureBuiltinSubstances(client: LifeClient): Promise<void> {
  const uid = await userId(client);
  const have = must(await pulso(client).from("substances").select("slug, position"));
  const slugs = new Set(have.map((s) => s.slug));
  const missing = BUILTINS.filter((b) => !slugs.has(b.slug));
  if (!missing.length) return;
  let next = have.reduce((m, s) => Math.max(m, s.position), -1) + 1;
  must(
    await pulso(client)
      .from("substances")
      .insert(missing.map((b) => ({ user_id: uid, slug: b.slug, name: b.name, unit: b.unit, forms: [...b.forms], builtin: true, position: next++ })))
      .select("id"),
  );
}

/** Active ones by position, then the archived ones. */
export async function listSubstances(client: LifeClient, opts: { includeArchived?: boolean } = {}): Promise<Substance[]> {
  let q = pulso(client).from("substances").select("*");
  if (opts.includeArchived === false) q = q.eq("archived", false);
  return must(await q.order("archived").order("position").order("created_at")).map(toSubstance);
}

async function getSubstance(client: LifeClient, id: string): Promise<Substance> {
  const row = (await pulso(client).from("substances").select("*").eq("id", id).maybeSingle()).data;
  if (!row) throw new PulsoError("No existe esa sustancia.", "not_found");
  return toSubstance(row);
}

export type SubstanceInput = { name: string; symbol?: string | null; unit?: string; forms?: string[]; maxDaysPerWeek?: number | null };

function cleanFields(input: Partial<SubstanceInput>) {
  const out: Partial<SubstanceRow> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 40) throw new PulsoError("El nombre va de 1 a 40 letras.", "invalid");
    out.name = name;
  }
  if (input.symbol !== undefined) out.symbol = input.symbol?.trim().slice(0, 40) || null;
  if (input.unit !== undefined) {
    const unit = input.unit.trim();
    if (!unit || unit.length > 20) throw new PulsoError("La unidad va de 1 a 20 letras.", "invalid");
    out.unit = unit;
  }
  if (input.forms !== undefined) {
    const forms = [...new Set(input.forms.map((f) => f.trim()).filter(Boolean))];
    if (forms.length > 8 || forms.some((f) => f.length > 24)) throw new PulsoError("Hasta 8 formas, de 24 letras cada una.", "invalid");
    out.forms = forms;
  }
  if (input.maxDaysPerWeek !== undefined) {
    const m = input.maxDaysPerWeek;
    if (m !== null && (!Number.isInteger(m) || m < 0 || m > 7)) throw new PulsoError("La meta va de 0 a 7 días por semana.", "invalid");
    out.max_days_per_week = m;
  }
  return out;
}

export async function createSubstance(client: LifeClient, input: SubstanceInput): Promise<Substance> {
  const uid = await userId(client);
  const fields = cleanFields({ unit: "veces", forms: [], ...input });
  const all = await listSubstances(client);
  if (all.some((s) => fold(s.name) === fold(fields.name!))) throw new PulsoError(`Ya existe «${fields.name}».`, "conflict");
  const position = all.filter((s) => !s.archived).reduce((m, s) => Math.max(m, s.position), -1) + 1;
  return toSubstance(must(await pulso(client).from("substances").insert({ user_id: uid, name: fields.name!, symbol: fields.symbol ?? null, unit: fields.unit!, forms: fields.forms ?? [], max_days_per_week: fields.max_days_per_week ?? null, position }).select("*").single()));
}

export async function updateSubstance(client: LifeClient, id: string, patch: Partial<SubstanceInput> & { archived?: boolean }): Promise<Substance> {
  const current = await getSubstance(client, id);
  const fields = cleanFields(patch);
  const all = await listSubstances(client);
  if (fields.name && all.some((s) => s.id !== id && fold(s.name) === fold(fields.name!))) throw new PulsoError(`Ya existe «${fields.name}».`, "conflict");
  if (patch.archived !== undefined) fields.archived = patch.archived;
  // Unarchiving puts it back at the end of the active list.
  if (current.archived && patch.archived === false) fields.position = all.filter((s) => !s.archived).reduce((m, s) => Math.max(m, s.position), -1) + 1;
  return toSubstance(must(await pulso(client).from("substances").update(fields).eq("id", id).select("*").single()));
}

/** `ids` = every active substance in the new order. */
export async function reorderSubstances(client: LifeClient, ids: string[]): Promise<void> {
  const active = (await listSubstances(client, { includeArchived: false })).map((s) => s.id);
  if (ids.length !== active.length || !active.every((id) => ids.includes(id))) throw new PulsoError("El orden debe incluir cada sustancia activa una vez.", "invalid");
  for (const [i, id] of ids.entries()) must(await pulso(client).from("substances").update({ position: i }).eq("id", id).select("id").single());
}

/** Moves one active substance up (-1) or down (+1). */
export async function moveSubstance(client: LifeClient, id: string, delta: -1 | 1): Promise<void> {
  const ids = (await listSubstances(client, { includeArchived: false })).map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await reorderSubstances(client, ids);
}

// ── Uses ────────────────────────────────────────────────────────────────────

export type UseInput = {
  substanceId?: string;
  date?: string;
  time?: string;
  /** undefined = the substance's first form; null = none. */
  form?: string | null;
  amount?: SubstanceAmount;
  quantity?: number | null;
  thcMg?: number | null;
  context?: SubstanceContext | null;
  note?: string | null;
};

function resolveForm(substance: Substance, given: string | null | undefined): string | null {
  if (!substance.forms.length || given === null) return null;
  if (given === undefined || given === "") return substance.forms[0]!;
  const match = substance.forms.find((f) => fold(f) === fold(given));
  if (!match) throw new PulsoError(`«${given}» no es una forma de ${substance.name}: ${substance.forms.join(", ")}.`, "invalid");
  return match;
}

/** THC only describes cannabis edibles. */
const thcFor = (s: Substance, form: string | null, thcMg: number | null | undefined) => (s.slug === "cannabis" && form === "comestible" ? (thcMg ?? null) : null);

function checkUse(input: UseInput) {
  if (input.date !== undefined && !DATE.test(input.date)) throw new PulsoError("Fecha inválida.", "invalid");
  if (input.time !== undefined && !TIME.test(input.time)) throw new PulsoError("Hora inválida (HH:MM).", "invalid");
  if (input.amount !== undefined && !AMOUNTS.includes(input.amount)) throw new PulsoError("Cantidad inválida.", "invalid");
  if (input.context != null && !CONTEXTS.includes(input.context)) throw new PulsoError("Contexto inválido.", "invalid");
  if (input.quantity != null && !(input.quantity > 0 && input.quantity <= 100_000)) throw new PulsoError("La cantidad tiene que ser mayor que cero.", "invalid");
  if (input.thcMg != null && !(input.thcMg > 0 && input.thcMg <= 2000)) throw new PulsoError("THC entre 0 y 2000 mg.", "invalid");
}

export async function logUse(client: LifeClient, input: UseInput): Promise<SubstanceUse> {
  checkUse(input);
  const uid = await userId(client);
  const { timezone: tz } = await getSettings(client);
  const now = new Date();
  const substanceId = input.substanceId ?? (await listSubstances(client, { includeArchived: false }))[0]?.id;
  if (!substanceId) throw new PulsoError("No hay ninguna sustancia activa.", "invalid");
  const s = await getSubstance(client, substanceId);
  const date = input.date ?? localDate(now, tz);
  const time = input.time ?? localTime(now, tz);
  const form = resolveForm(s, input.form);
  const row = must(
    await pulso(client)
      .from("substance_entries")
      .insert({
        user_id: uid,
        substance_id: s.id,
        used_at: zonedInstant(date, time, tz).toISOString(),
        local_date: date,
        form,
        amount: input.amount ?? "normal",
        count: input.quantity ?? null,
        thc_mg: thcFor(s, form, input.thcMg),
        context: input.context ?? null,
        note: input.note?.trim().slice(0, 500) || null,
      })
      .select("*")
      .single(),
  );
  return toUse(row, tz);
}

export async function updateUse(client: LifeClient, id: string, patch: UseInput): Promise<SubstanceUse> {
  checkUse(patch);
  const { timezone: tz } = await getSettings(client);
  const row = (await pulso(client).from("substance_entries").select("*").eq("id", id).maybeSingle()).data;
  if (!row) throw new PulsoError("No existe ese registro.", "not_found");
  const current = toUse(row, tz);
  const s = await getSubstance(client, patch.substanceId ?? current.substanceId);
  const date = patch.date ?? current.date;
  const time = patch.time ?? current.time;
  const form = patch.form === undefined && s.id === current.substanceId ? current.form : resolveForm(s, patch.form);
  const thc = patch.thcMg === undefined ? current.thcMg : patch.thcMg;
  return toUse(
    must(
      await pulso(client)
        .from("substance_entries")
        .update({
          substance_id: s.id,
          used_at: zonedInstant(date, time, tz).toISOString(),
          local_date: date,
          form,
          amount: patch.amount ?? current.amount,
          count: patch.quantity === undefined ? current.quantity : patch.quantity,
          thc_mg: thcFor(s, form, thc),
          context: patch.context === undefined ? current.context : patch.context,
          note: patch.note === undefined ? current.note : patch.note?.trim().slice(0, 500) || null,
        })
        .eq("id", id)
        .select("*")
        .single(),
    ),
    tz,
  );
}

export async function deleteUse(client: LifeClient, id: string): Promise<void> {
  const { error } = await pulso(client).from("substance_entries").delete().eq("id", id);
  if (error) throw new PulsoError(`No se pudo borrar: ${error.message}`);
}

async function listUses(client: LifeClient, from: string, to: string, ids: string[], tz: string): Promise<SubstanceUse[]> {
  if (!ids.length) return [];
  const rows = must(await pulso(client).from("substance_entries").select("*").in("substance_id", ids).gte("local_date", from).lte("local_date", to).order("used_at", { ascending: false }));
  return rows.map((r) => toUse(r, tz));
}

// ── Summary (pure) ──────────────────────────────────────────────────────────

export const MIN_SAMPLE = 3;
export const WEEKS = 8;
const LATE_HOUR = 22;
const LEVEL = { poco: 1, normal: 2, mucho: 3 } as const;

export type NightSignals = {
  night: string;
  sleepMinutes: number | null;
  sleepScore: number | null;
  hrv: number | null;
  restingHr: number | null;
  readiness: number | null;
  lateEating: boolean | null;
};

export type SubstanceCorrelation = {
  key: "sleep_minutes" | "sleep_score" | "hrv" | "resting_hr" | "readiness" | "late_eating";
  label: string;
  unit: string;
  withUse: number | null;
  withoutUse: number | null;
  diff: number | null;
  nWith: number;
  nWithout: number;
  enough: boolean;
  text: string | null;
};

export type TimeBucket = { key: "manana" | "tarde" | "noche" | "madrugada"; label: string; uses: number };

export type SubstanceSummary = {
  substanceId: string | null;
  today: string;
  days: { date: string; uses: number; level: 0 | 1 | 2 | 3 }[];
  weeks: { weekStart: string; days: number }[];
  avgDaysPerWeek: number | null;
  daysThisWeek: number;
  daysWithout: number | null;
  longestWithout: number;
  lastUse: { date: string; time: string } | null;
  timeOfDay: TimeBucket[];
  byForm: { form: string; uses: number }[];
  byContext: { context: SubstanceContext; uses: number }[];
  bySubstance: { substanceId: string; uses: number }[];
  goal: { maxDaysPerWeek: number; daysThisWeek: number; within: boolean } | null;
  correlations: SubstanceCorrelation[];
  drinkDays?: number;
};

export const weekStartOf = (date: string) => addDays(date, 1 - isoWeekday(date));

/** The night a use belongs to (the wake date): noon to 05:59 the next morning. */
export function nightOfUse(date: string, time: string): string | null {
  if (time < "06:00") return date;
  if (time >= "12:00") return addDays(date, 1);
  return null;
}

function bucketOf(time: string): TimeBucket["key"] {
  if (time < "06:00") return "madrugada";
  if (time < "12:00") return "manana";
  if (time < "18:00") return "tarde";
  return "noche";
}

const BUCKETS: { key: TimeBucket["key"]; label: string }[] = [
  { key: "manana", label: "Mañana" },
  { key: "tarde", label: "Tarde" },
  { key: "noche", label: "Noche" },
  { key: "madrugada", label: "Madrugada" },
];

function tally(values: (string | null)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const round = (value: number | null, decimals = 0) => (value === null ? null : Math.round(value * 10 ** decimals) / 10 ** decimals);
function duration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

type Spec = { key: SubstanceCorrelation["key"]; label: string; unit: string; pick: (n: NightSignals) => number | null; text: (diff: number, withUse: number, withoutUse: number) => string };

const SPECS: Spec[] = [
  { key: "sleep_minutes", label: "Tiempo dormido", unit: "min", pick: (n) => n.sleepMinutes, text: (diff) => (Math.abs(diff) < 5 ? "En noches con consumo dormiste más o menos lo mismo que en las demás" : `En noches con consumo dormiste ${duration(Math.abs(diff))} ${diff > 0 ? "más" : "menos"} en promedio`) },
  { key: "sleep_score", label: "Puntuación de sueño", unit: "pts", pick: (n) => n.sleepScore, text: (diff) => (Math.abs(diff) < 2 ? "En noches con consumo tu puntuación de sueño fue parecida a la de las demás" : `En noches con consumo tu puntuación de sueño fue ${Math.round(Math.abs(diff))} puntos ${diff > 0 ? "más alta" : "más baja"} en promedio`) },
  { key: "hrv", label: "VFC a la mañana siguiente", unit: "ms", pick: (n) => n.hrv, text: (diff) => (Math.abs(diff) < 2 ? "Tras noches con consumo tu VFC fue parecida a la de las demás" : `Tras noches con consumo tu VFC fue ${Math.round(Math.abs(diff))} ms ${diff > 0 ? "más alta" : "más baja"} en promedio`) },
  { key: "resting_hr", label: "Pulso en reposo a la mañana siguiente", unit: "lpm", pick: (n) => n.restingHr, text: (diff) => (Math.abs(diff) < 1 ? "Tras noches con consumo tu pulso en reposo fue parecido al de las demás" : `Tras noches con consumo tu pulso en reposo fue ${Math.round(Math.abs(diff))} lpm ${diff > 0 ? "más alto" : "más bajo"} en promedio`) },
  { key: "readiness", label: "Recuperación al día siguiente", unit: "pts", pick: (n) => n.readiness, text: (diff) => (Math.abs(diff) < 3 ? "Al día siguiente tu recuperación fue parecida a la de otros días" : `Al día siguiente tu recuperación fue ${Math.round(Math.abs(diff))} puntos ${diff > 0 ? "más alta" : "más baja"} en promedio`) },
  { key: "late_eating", label: "Comer tarde", unit: "%", pick: (n) => (n.lateEating === null ? null : n.lateEating ? 100 : 0), text: (_d, w, wo) => `Comiste después de las ${LATE_HOUR}:00 en el ${Math.round(w)} % de las noches con consumo y en el ${Math.round(wo)} % de las demás` },
];

export function correlate(nights: NightSignals[], usedNights: Set<string>): SubstanceCorrelation[] {
  return SPECS.map((spec) => {
    const withValues: number[] = [];
    const withoutValues: number[] = [];
    for (const n of nights) {
      const value = spec.pick(n);
      if (value === null) continue;
      (usedNights.has(n.night) ? withValues : withoutValues).push(value);
    }
    const withUse = mean(withValues);
    const withoutUse = mean(withoutValues);
    const diff = withUse !== null && withoutUse !== null ? withUse - withoutUse : null;
    const enough = withValues.length >= MIN_SAMPLE && withoutValues.length >= MIN_SAMPLE;
    const sample = ` (${withValues.length} con · ${withoutValues.length} sin)`;
    return { key: spec.key, label: spec.label, unit: spec.unit, withUse: round(withUse, 1), withoutUse: round(withoutUse, 1), diff: round(diff, 1), nWith: withValues.length, nWithout: withoutValues.length, enough, text: enough && diff !== null ? spec.text(diff, withUse!, withoutUse!) + sample : null };
  });
}

export type SummaryInput = {
  substanceId: string | null;
  today: string;
  entries: Pick<SubstanceUse, "date" | "time" | "amount" | "form" | "context" | "substanceId">[];
  firstUse: string | null;
  lastUse: { date: string; time: string } | null;
  maxDaysPerWeek: number | null;
  nights: NightSignals[];
  drinkDays?: number;
};

export function buildSummary(input: SummaryInput): SubstanceSummary {
  const { today, entries, firstUse } = input;
  const thisWeek = weekStartOf(today);
  const from = addDays(thisWeek, -7 * (WEEKS - 1));
  const byDay = new Map<string, SummaryInput["entries"]>();
  for (const e of entries) if (e.date >= from && e.date <= today) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const days: SubstanceSummary["days"] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const uses = byDay.get(d) ?? [];
    days.push({ date: d, uses: uses.length, level: uses.reduce<0 | 1 | 2 | 3>((max, e) => Math.max(max, LEVEL[e.amount]) as 0 | 1 | 2 | 3, 0) });
  }
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = addDays(from, 7 * i);
    const end = addDays(start, 6);
    return { weekStart: start, days: days.filter((d) => d.date >= start && d.date <= end && d.uses > 0).length };
  });
  const daysThisWeek = weeks[WEEKS - 1]!.days;
  const counted = firstUse ? weeks.slice(0, -1).filter((w) => addDays(w.weekStart, 6) >= firstUse) : [];
  const avgDaysPerWeek = round(mean(counted.map((w) => w.days)), 1);

  let daysWithout: number | null = null;
  if (input.lastUse) {
    daysWithout = 0;
    for (let d = today; d > input.lastUse.date; d = addDays(d, -1)) daysWithout++;
  }
  let longestWithout = 0;
  let run = 0;
  for (const d of days) {
    if (!firstUse || d.date < firstUse) continue;
    run = d.uses > 0 ? 0 : run + 1;
    longestWithout = Math.max(longestWithout, run);
  }

  const inWindow = entries.filter((e) => e.date >= from && e.date <= today);
  const timeOfDay = BUCKETS.map((b) => ({ ...b, uses: inWindow.filter((e) => bucketOf(e.time) === b.key).length }));
  const byForm = tally(inWindow.map((e) => e.form)).map(([form, uses]) => ({ form, uses }));
  const bySubstance = input.substanceId === null ? tally(inWindow.map((e) => e.substanceId)).map(([substanceId, uses]) => ({ substanceId, uses })) : [];
  const byContext = CONTEXTS.map((context) => ({ context, uses: inWindow.filter((e) => e.context === context).length })).filter((c) => c.uses > 0);
  const usedNights = new Set(entries.map((e) => nightOfUse(e.date, e.time)).filter((n): n is string => n !== null));
  const nights = firstUse ? input.nights.filter((n) => n.night >= firstUse && n.night <= today) : [];

  return {
    substanceId: input.substanceId,
    today,
    days,
    weeks,
    avgDaysPerWeek,
    daysThisWeek,
    daysWithout,
    longestWithout,
    lastUse: input.lastUse,
    timeOfDay,
    byForm,
    byContext,
    bySubstance,
    goal: input.maxDaysPerWeek === null ? null : { maxDaysPerWeek: input.maxDaysPerWeek, daysThisWeek, within: daysThisWeek <= input.maxDaysPerWeek },
    correlations: correlate(nights, usedNights),
    ...(input.drinkDays === undefined ? {} : { drinkDays: input.drinkDays }),
  };
}

// ── Loaders ─────────────────────────────────────────────────────────────────

/** Sleep, recovery and late eating for every night from `from` to `to` (wake dates). */
async function nightSignals(client: LifeClient, from: string, to: string, tz: string, sleepTarget: number): Promise<NightSignals[]> {
  const [sleepRows, signals, meals] = await Promise.all([
    pulso(client).from("sleeps").select("*").gte("ended_at", zonedInstant(addDays(from, -15), "00:00", tz).toISOString()),
    listDailySignals(client, addDays(from, -28), to),
    pulso(client).from("meals").select("eaten_at").gte("eaten_at", zonedInstant(addDays(from, -1), "00:00", tz).toISOString()).lt("eaten_at", zonedInstant(addDays(to, 1), "00:00", tz).toISOString()),
  ]);
  const described = describeNights(pickNights((sleepRows.data ?? []).map((r) => nightFromRow(r, tz))), sleepTarget);
  const sleep = new Map(described.map((n) => [n.night, n]));
  const byDate = new Map(signals.map((d) => [d.date, d]));
  const evenings = new Set<string>();
  const late = new Set<string>();
  for (const m of meals.data ?? []) {
    const date = localDate(m.eaten_at, tz);
    const hour = Number(localTime(m.eaten_at, tz).slice(0, 2));
    evenings.add(date);
    if (hour >= LATE_HOUR) late.add(addDays(date, 1));
    else if (hour < 4) late.add(date);
  }
  const out: NightSignals[] = [];
  for (let night = from; night <= to; night = addDays(night, 1)) {
    const day = byDate.get(night);
    const s = sleep.get(night);
    out.push({
      night,
      sleepMinutes: s?.minutes.asleep ?? day?.sleep_minutes ?? null,
      sleepScore: s?.score.value ?? null,
      hrv: day?.hrv ?? null,
      restingHr: day?.resting_heart_rate ?? null,
      readiness: day ? computeReadiness(night, day, signals, sleepTarget).score : null,
      lateEating: late.has(night) ? true : evenings.has(addDays(night, -1)) ? false : null,
    });
  }
  return out;
}

export type SubstanceOverview = {
  today: string;
  tz: string;
  /** Active by position, then archived. */
  substances: Substance[];
  summary: SubstanceSummary;
  /** Last 60 days of the summarized scope, newest first. */
  entries: SubstanceUse[];
  sharedWithCalendar: boolean;
};

/** `which`: a substance id, "all" for Todas, or nothing for the first active one. Seeds the builtins on first use. */
export async function getSubstanceOverview(client: LifeClient, which?: string | null): Promise<SubstanceOverview> {
  await ensureBuiltinSubstances(client);
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const substances = await listSubstances(client);
  const active = substances.filter((s) => !s.archived);
  const chosen = which === "all" ? null : (substances.find((s) => s.id === which) ?? active[0] ?? null);
  const ids = chosen ? [chosen.id] : active.map((s) => s.id);
  const from = addDays(weekStartOf(today), -7 * (WEEKS - 1));
  const windowFrom = from < addDays(today, -59) ? from : addDays(today, -59);
  const [entries, first, nights] = await Promise.all([
    listUses(client, windowFrom, today, ids, tz),
    ids.length ? pulso(client).from("substance_entries").select("local_date").in("substance_id", ids).order("local_date").limit(1).maybeSingle() : Promise.resolve({ data: null }),
    nightSignals(client, from, today, tz, settings.sleep_target_min ?? 480),
  ]);
  const last = entries[0] ? { date: entries[0].date, time: entries[0].time } : null;
  let drinkDays: number | undefined;
  if (chosen?.slug === "alcohol") {
    const drinks = await pulso(client).from("meals").select("local_date, eaten_at").gt("alcohol_g", 0).gte("eaten_at", zonedInstant(from, "00:00", tz).toISOString());
    drinkDays = new Set((drinks.data ?? []).map((m) => m.local_date ?? localDate(m.eaten_at, tz))).size;
  }
  const summary = buildSummary({
    substanceId: chosen?.id ?? null,
    today,
    entries: entries.filter((e) => e.date >= from),
    firstUse: first.data?.local_date ?? null,
    lastUse: last,
    maxDaysPerWeek: chosen?.maxDaysPerWeek ?? null,
    nights,
    drinkDays,
  });
  return { today, tz, substances, summary, entries: entries.filter((e) => e.date >= addDays(today, -59)), sharedWithCalendar: settings.substances_in_timeline };
}
