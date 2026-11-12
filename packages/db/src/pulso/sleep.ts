/**
 * Sueño. Nights live in pulso.sleeps: one per night from Apple Health (the
 * phone writes them already grouped, with stages and segments) and at most one
 * logged by hand. A Health night always beats a manual one for the same date.
 * Score, insights, debt and regularity are ported from the old engine's
 * sleep/metrics.ts; the manual rules from sleep/manual.ts.
 */
import type { LifeClient } from "../index";
import type { Sleep, SleepStages } from "../types";
import { must, pulso, PulsoError, userId } from "./core";
import { addDays, localDate, tzOffsetMinutes, zonedInstant } from "./dates";
import { getSettings } from "./settings";

export const DEFAULT_TARGET_MIN = 480;
export const HISTORY_NIGHTS = 14;

const MIN = 60_000;
const DAY = 86_400_000;

type Stage = "core" | "deep" | "rem" | "asleep" | "awake" | "inBed";
const ASLEEP: ReadonlySet<Stage> = new Set(["core", "deep", "rem", "asleep"]);

export type NightSegment = { start: number; end: number; stage: Stage };

/** One night before its score (ms instants, whole minutes). */
export type BaseNight = {
  id: string;
  night: string;
  source: "manual" | "healthkit";
  tzOffsetMin: number;
  inBedStart: number;
  inBedEnd: number;
  asleepStart: number;
  asleepEnd: number;
  minutes: { inBed: number; asleep: number; awake: number; core: number; deep: number; rem: number; unspecified: number };
  efficiency: number;
  stagePct: { core: number; deep: number; rem: number } | null;
  /** Minutes from local midnight of the wake date (negative = the evening before). */
  bedtimeMin: number;
  wakeMin: number;
  segments: NightSegment[];
  note: string | null;
};

export type SleepScoreFactor = { key: "duration" | "efficiency" | "restoration" | "consistency"; label: string; maxPoints: number; points: number; detail: string };
export type SleepScore = { value: number; factors: SleepScoreFactor[]; explanation: string };
export type SleepNight = BaseNight & { score: SleepScore; insights: string[] };

export type SleepSummary = {
  nights: number;
  from: string | null;
  to: string | null;
  targetMin: number;
  avgAsleepMin: number | null;
  avgScore: number | null;
  avgEfficiency: number | null;
  avgBedtimeMin: number | null;
  avgWakeMin: number | null;
  bedtimeSdMin: number | null;
  wakeSdMin: number | null;
  regularity: number | null;
  debtMin: number;
  insights: string[];
};

/** A night runs 18:00 → 18:00 local and is named after the day you wake up. */
export function nightOf(startMs: number, tzOffsetMin: number): string {
  return new Date(startMs + tzOffsetMin * MIN + 6 * 3_600_000).toISOString().slice(0, 10);
}

const minutes = (ms: number) => Math.round(ms / MIN);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs: number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}
const midnight = (night: string) => Date.parse(`${night}T00:00:00Z`);
const localMin = (ms: number, night: string, tz: number) => minutes(ms + tz * MIN - midnight(night));

/** "7 h 20 min", "45 min", "8 h". */
export function formatDuration(totalMin: number): string {
  const m = Math.round(Math.abs(totalMin));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "23:40" from minutes after local midnight (negative = the evening before). */
export function clockOf(min: number | null): string {
  if (min === null) return "—";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** A stored row as a night. Rows without segments get one "asleep" span (or their stages laid end to end don't matter for totals). */
export function nightFromRow(row: Pick<Sleep, "id" | "started_at" | "ended_at" | "source" | "night" | "asleep_min" | "stages" | "segments" | "notes">, tz: string): BaseNight {
  const inBedStart = Date.parse(row.started_at);
  const inBedEnd = Date.parse(row.ended_at);
  const offset = tzOffsetMinutes(new Date(inBedStart), tz);
  const night = row.night ?? nightOf(inBedStart, offset);
  const st: SleepStages = row.stages ?? {};
  const core = Math.round(st.core ?? 0);
  const deep = Math.round(st.deep ?? 0);
  const rem = Math.round(st.rem ?? 0);
  const awake = Math.round(st.awake ?? 0);
  const span = minutes(inBedEnd - inBedStart);
  const asleep = Math.round(row.asleep_min ?? (core + deep + rem > 0 ? core + deep + rem : Math.max(0, span - awake)));
  const unspecified = Math.max(0, asleep - core - deep - rem);
  const segments: NightSegment[] = (row.segments ?? [])
    .map((s) => ({ start: Date.parse(s.start), end: Date.parse(s.end), stage: s.stage as Stage }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const sleeping = segments.filter((s) => ASLEEP.has(s.stage));
  const asleepStart = sleeping.length ? Math.min(...sleeping.map((s) => s.start)) : inBedStart;
  const asleepEnd = sleeping.length ? Math.max(...sleeping.map((s) => s.end)) : inBedEnd;
  const inBed = Math.max(asleep, span);
  const staged = core + deep + rem;
  return {
    id: row.id,
    night,
    source: row.source,
    tzOffsetMin: offset,
    inBedStart,
    inBedEnd,
    asleepStart,
    asleepEnd,
    minutes: { inBed, asleep, awake, core, deep, rem, unspecified },
    efficiency: inBed ? asleep / inBed : 0,
    stagePct: staged ? { core: core / staged, deep: deep / staged, rem: rem / staged } : null,
    bedtimeMin: localMin(inBedStart, night, offset),
    wakeMin: localMin(asleepEnd, night, offset),
    segments: segments.length ? segments : [{ start: asleepStart, end: asleepEnd, stage: "asleep" }],
    note: row.notes,
  };
}

/** One night per date: Apple Health's beats the manual one. */
export function pickNights(nights: BaseNight[]): BaseNight[] {
  const by = new Map<string, BaseNight>();
  for (const n of nights) {
    const have = by.get(n.night);
    if (!have || (have.source === "manual" && n.source === "healthkit")) by.set(n.night, n);
  }
  return [...by.values()].sort((a, b) => a.night.localeCompare(b.night));
}

function historyOf(night: BaseNight, all: BaseNight[]): BaseNight[] {
  const end = midnight(night.night);
  return all.filter((n) => midnight(n.night) < end && midnight(n.night) >= end - HISTORY_NIGHTS * DAY);
}

/** 0–100 from duration (40), efficiency (20), deep+REM (20) and bedtime consistency (20). */
export function scoreNight(night: BaseNight, history: BaseNight[], targetMin: number): SleepScore {
  const m = night.minutes;
  const factors: (SleepScoreFactor & { ratio: number; issue: string })[] = [];
  const add = (key: SleepScoreFactor["key"], label: string, maxPoints: number, ratio: number, detail: string, issue: string) =>
    factors.push({ key, label, maxPoints, points: Math.round(maxPoints * ratio), detail, ratio, issue });

  add("duration", "Duración", 40, clamp01((m.asleep / targetMin - 0.5) / 0.5), `${formatDuration(m.asleep)} de ${formatDuration(targetMin)}`, `Dormiste ${formatDuration(m.asleep)}, ${formatDuration(targetMin - m.asleep)} menos que tu objetivo.`);
  const manual = night.source === "manual";
  if (!manual) {
    add("efficiency", "Eficiencia", 20, clamp01((night.efficiency - 0.75) / 0.2), `${Math.round(night.efficiency * 100)} % del tiempo en cama dormido`, `Pasaste ${formatDuration(m.inBed - m.asleep)} despierto en la cama.`);
  }
  if (night.stagePct) {
    const restorative = night.stagePct.deep + night.stagePct.rem;
    add("restoration", "Profundo + REM", 20, clamp01((restorative - 0.2) / 0.2), `${Math.round(restorative * 100)} % del sueño`, `Poco sueño profundo y REM: ${Math.round(restorative * 100)} % del total.`);
  }
  const usual = history.length >= 3 ? mean(history.map((n) => n.bedtimeMin))! : null;
  if (usual !== null) {
    const diff = Math.round(night.bedtimeMin - usual);
    add(
      "consistency",
      "Regularidad",
      20,
      clamp01(1 - Math.abs(diff) / 90),
      Math.abs(diff) < 5 ? "A tu hora de siempre" : `${Math.abs(diff)} min ${diff > 0 ? "más tarde" : "antes"} que de costumbre`,
      `Te acostaste ${formatDuration(diff)} ${diff > 0 ? "más tarde" : "antes"} que de costumbre.`,
    );
  }
  const max = factors.reduce((a, f) => a + f.maxPoints, 0);
  const value = Math.round((100 * factors.reduce((a, f) => a + f.maxPoints * f.ratio, 0)) / max);
  const weakest = [...factors].sort((a, b) => a.ratio - b.ratio)[0]!;
  const explanation =
    value >= 85 || weakest.ratio >= 0.9
      ? manual
        ? `Buena noche: ${formatDuration(m.asleep)}.`
        : `Buena noche: ${formatDuration(m.asleep)} con ${Math.round(night.efficiency * 100)} % de eficiencia.`
      : weakest.issue;
  return { value, factors: factors.map(({ ratio: _r, issue: _i, ...f }) => f), explanation };
}

export function nightInsights(night: BaseNight, history: BaseNight[], targetMin: number): string[] {
  const out: string[] = [];
  if (history.length >= 3) {
    const bed = Math.round(night.bedtimeMin - mean(history.map((n) => n.bedtimeMin))!);
    if (Math.abs(bed) >= 20) out.push(`Te acostaste ${formatDuration(bed)} ${bed > 0 ? "más tarde" : "más temprano"} que tu promedio.`);
    const slept = Math.round(night.minutes.asleep - mean(history.map((n) => n.minutes.asleep))!);
    if (Math.abs(slept) >= 20) out.push(`Dormiste ${formatDuration(slept)} ${slept > 0 ? "más" : "menos"} que tu promedio.`);
    const staged = history.filter((n) => n.stagePct);
    if (night.stagePct && staged.length >= 3) {
      const deep = Math.round((night.stagePct.deep - mean(staged.map((n) => n.stagePct!.deep))!) * 100);
      if (Math.abs(deep) >= 4) out.push(`Sueño profundo ${Math.abs(deep)} puntos ${deep > 0 ? "por encima" : "por debajo"} de lo habitual.`);
    }
  }
  if (night.minutes.asleep >= targetMin) out.push(`Llegaste a tu objetivo de ${formatDuration(targetMin)}.`);
  return out;
}

/** Score and insights for every night, each against the nights before it. Newest first. */
export function describeNights(base: BaseNight[], targetMin: number): SleepNight[] {
  const sorted = [...base].sort((a, b) => a.night.localeCompare(b.night));
  return sorted
    .map((night) => {
      const history = historyOf(night, sorted);
      return { ...night, score: scoreNight(night, history, targetMin), insights: nightInsights(night, history, targetMin) };
    })
    .reverse();
}

/** Sleep Regularity Index-like score, 0–100; null without two consecutive nights. */
export function regularity(nights: BaseNight[]): number | null {
  const sorted = [...nights].sort((a, b) => a.night.localeCompare(b.night));
  const asleepMask = (n: BaseNight) => {
    const mask = new Uint8Array(1440);
    for (const s of n.segments) {
      if (!ASLEEP.has(s.stage)) continue;
      const from = Math.max(0, localMin(s.start, n.night, n.tzOffsetMin) + 360);
      const to = Math.min(1440, localMin(s.end, n.night, n.tzOffsetMin) + 360);
      mask.fill(1, from, Math.max(from, to));
    }
    return mask;
  };
  const scores: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (midnight(b.night) - midnight(a.night) !== DAY) continue;
    const [ma, mb] = [asleepMask(a), asleepMask(b)];
    let same = 0;
    for (let m = 0; m < 1440; m++) if (ma[m] === mb[m]) same++;
    scores.push(200 * (same / 1440) - 100);
  }
  const avg = mean(scores);
  return avg === null ? null : Math.round(Math.max(0, avg));
}

/** Averages, debt and regularity over the `days` calendar days ending at the newest night. */
export function summarize(all: SleepNight[], targetMin: number, days = HISTORY_NIGHTS): SleepSummary {
  const newest = all.reduce<string | null>((a, n) => (a === null || n.night > a ? n.night : a), null);
  const nights = newest === null ? [] : all.filter((n) => midnight(n.night) > midnight(newest) - days * DAY).sort((a, b) => a.night.localeCompare(b.night));
  const round = (x: number | null) => (x === null ? null : Math.round(x));
  const debtMin = Math.max(0, nights.reduce((a, n) => a + targetMin - n.minutes.asleep, 0));
  const bedSd = sd(nights.map((n) => n.bedtimeMin));
  const reg = regularity(nights);
  const efficiency = mean(nights.filter((n) => n.source !== "manual").map((n) => n.efficiency));
  const insights: string[] = [];
  if (nights.length) {
    insights.push(debtMin >= 30 ? `Llevas ${formatDuration(debtMin)} de deuda de sueño en las últimas ${nights.length} noches.` : `Sin deuda de sueño en las últimas ${nights.length} noches.`);
  }
  if (bedSd !== null && bedSd >= 45) insights.push(`Tu hora de acostarte varía ±${Math.round(bedSd)} min de una noche a otra.`);
  if (reg !== null) insights.push(reg >= 80 ? "Tus horarios de sueño son muy regulares." : reg < 60 ? "Tus horarios de sueño son irregulares: acostarte y despertar a la misma hora ayuda." : "Tus horarios de sueño son bastante regulares.");
  return {
    nights: nights.length,
    from: nights[0]?.night ?? null,
    to: nights.at(-1)?.night ?? null,
    targetMin,
    avgAsleepMin: round(mean(nights.map((n) => n.minutes.asleep))),
    avgScore: round(mean(nights.map((n) => n.score.value))),
    avgEfficiency: efficiency === null ? null : Math.round(efficiency * 100) / 100,
    avgBedtimeMin: round(mean(nights.map((n) => n.bedtimeMin))),
    avgWakeMin: round(mean(nights.map((n) => n.wakeMin))),
    bedtimeSdMin: round(bedSd),
    wakeSdMin: round(sd(nights.map((n) => n.wakeMin))),
    regularity: reg,
    debtMin,
    insights,
  };
}

// ---------------------------------------------------------------------------
// Manual nights
// ---------------------------------------------------------------------------

export const MIN_MANUAL_MIN = 60;
export const MAX_MANUAL_MIN = 16 * 60;
const FUTURE_SLACK_MS = 5 * 60_000;
const NOTE_MAX = 280;

const dayLabel = (night: string) => new Date(`${night}T12:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * A night as the person says it the morning after: the wake time on
 * `wakeDate`, and the bedtime the last time that clock read before waking
 * (23:30 before a 07:00 wake is the previous day).
 */
export function resolveManualTimes(wakeDate: string, asleepClock: string, wakeClock: string, tz: string): { start: number; end: number } {
  const end = zonedInstant(wakeDate, wakeClock, tz).getTime();
  const same = zonedInstant(wakeDate, asleepClock, tz).getTime();
  const start = same < end ? same : zonedInstant(addDays(wakeDate, -1), asleepClock, tz).getTime();
  return { start, end };
}

/** Validates a manual night (Spanish errors) and names its night. */
export function checkManual(start: number, end: number, tz: string, now = Date.now()): { night: string } {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new PulsoError("Faltan la hora de dormir o la de despertar.", "invalid");
  if (end <= start) throw new PulsoError("La hora de despertar tiene que ser después de la de dormir.", "invalid");
  const span = (end - start) / MIN;
  if (span < MIN_MANUAL_MIN || span > MAX_MANUAL_MIN) throw new PulsoError(`Una noche tiene que durar entre 1 y 16 horas (esta dura ${formatDuration(span)}).`, "invalid");
  if (end > now + FUTURE_SLACK_MS) throw new PulsoError("La hora de despertar todavía no llegó.", "invalid");
  return { night: nightOf(start, tzOffsetMinutes(new Date(start), tz)) };
}

async function claim(client: LifeClient, night: string, self?: string) {
  const rows = must(await pulso(client).from("sleeps").select("id, source, asleep_min").eq("night", night));
  if (rows.some((r) => r.source === "healthkit")) throw new PulsoError(`Salud ya tiene medida la noche del ${dayLabel(night)}; esa es la que cuenta.`, "conflict");
  if (rows.some((r) => r.source === "manual" && r.id !== self)) throw new PulsoError(`Ya registraste a mano la noche del ${dayLabel(night)}: edítala en vez de crear otra.`, "conflict");
}

export type ManualNightInput = { start: number; end: number; note?: string | null; quality?: number | null };

export async function addManualSleep(client: LifeClient, input: ManualNightInput): Promise<Sleep> {
  const uid = await userId(client);
  const { timezone } = await getSettings(client);
  const { night } = checkManual(input.start, input.end, timezone);
  await claim(client, night);
  return must(
    await pulso(client)
      .from("sleeps")
      .insert({
        user_id: uid,
        source: "manual",
        night,
        started_at: new Date(input.start).toISOString(),
        ended_at: new Date(input.end).toISOString(),
        asleep_min: Math.round((input.end - input.start) / MIN),
        notes: input.note?.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) || null,
        quality: input.quality ?? null,
      })
      .select("*")
      .single(),
  );
}

export async function updateManualSleep(client: LifeClient, id: string, input: ManualNightInput): Promise<Sleep> {
  const { timezone } = await getSettings(client);
  const current = (await pulso(client).from("sleeps").select("id, source").eq("id", id).maybeSingle()).data;
  if (!current) throw new PulsoError("Esa noche ya no existe.", "not_found");
  if (current.source !== "manual") throw new PulsoError("Las noches de Salud no se editan aquí.", "invalid");
  const { night } = checkManual(input.start, input.end, timezone);
  await claim(client, night, id);
  return must(
    await pulso(client)
      .from("sleeps")
      .update({
        night,
        started_at: new Date(input.start).toISOString(),
        ended_at: new Date(input.end).toISOString(),
        asleep_min: Math.round((input.end - input.start) / MIN),
        notes: input.note?.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) || null,
        quality: input.quality ?? null,
      })
      .eq("id", id)
      .select("*")
      .single(),
  );
}

/** Only manual nights can be deleted here. */
export async function deleteManualSleep(client: LifeClient, id: string): Promise<void> {
  const { error } = await pulso(client).from("sleeps").delete().eq("id", id).eq("source", "manual");
  if (error) throw new PulsoError(`No se pudo borrar: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export type SleepOverview = {
  today: string;
  targetMin: number;
  /** Newest first, one per night, scored. */
  nights: SleepNight[];
  /** Manual nights hidden because Health measured the same date. */
  hidden: BaseNight[];
  last14: SleepSummary;
  last30: SleepSummary;
};

/** The last `days` nights (and the 14 before them, for scoring). */
export async function getSleepOverview(client: LifeClient, days = 30): Promise<SleepOverview> {
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const from = addDays(today, -(days + HISTORY_NIGHTS));
  const rows = must(await pulso(client).from("sleeps").select("*").gte("ended_at", zonedInstant(from, "00:00", tz).toISOString()).order("started_at"));
  const all = rows.map((r) => nightFromRow(r, tz));
  const picked = pickNights(all);
  const keep = new Set(picked.map((n) => n.id));
  const targetMin = settings.sleep_target_min ?? DEFAULT_TARGET_MIN;
  const described = describeNights(picked, targetMin).filter((n) => n.night > addDays(today, -days));
  return {
    today,
    targetMin,
    nights: described,
    hidden: all.filter((n) => !keep.has(n.id) && n.night > addDays(today, -days)),
    last14: summarize(described, targetMin, 14),
    last30: summarize(described, targetMin, 30),
  };
}

export type LastNight = {
  id: string;
  night: string;
  asleepMin: number;
  inBedMin: number;
  targetMin: number | null;
  stages: SleepStages;
  start: string;
  end: string;
  source: "manual" | "healthkit";
  score: number;
  explanation: string;
};

/** Last night (woke up today or yesterday), or null. */
export async function getLastNight(client: LifeClient): Promise<LastNight | null> {
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const from = addDays(today, -(HISTORY_NIGHTS + 1));
  const rows = must(await pulso(client).from("sleeps").select("*").gte("ended_at", zonedInstant(from, "00:00", tz).toISOString()).order("started_at"));
  const picked = pickNights(rows.map((r) => nightFromRow(r, tz)));
  const target = settings.sleep_target_min ?? DEFAULT_TARGET_MIN;
  const newest = describeNights(picked, target)[0];
  if (!newest || newest.night < addDays(today, -1)) return null;
  const m = newest.minutes;
  return {
    id: newest.id,
    night: newest.night,
    asleepMin: m.asleep,
    inBedMin: m.inBed,
    targetMin: settings.sleep_target_min,
    stages: { deep: m.deep, core: m.core, rem: m.rem, awake: m.awake },
    start: new Date(newest.inBedStart).toISOString(),
    end: new Date(newest.inBedEnd).toISOString(),
    source: newest.source,
    score: newest.score.value,
    explanation: newest.score.explanation,
  };
}
