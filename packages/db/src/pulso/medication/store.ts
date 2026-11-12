/**
 * Medicación on Supabase: the cabinet, logged doses (stock follows "tomada"),
 * the day's slots, adherence, upcoming doses and nudges. Dates are local in
 * settings.timezone. Track exactly what the person describes; nothing here
 * ever recommends changing a medication.
 */
import type { LifeClient } from "../../index";
import type { DoseStatus, Medication, MedicationKind, PulsoSettings } from "../../types";
import { must, pulso, PulsoError, userId } from "../core";
import { addDays, localDate, localTime, zonedInstant } from "../dates";
import { getSettings } from "../settings";
import { AS_NEEDED, normalizeSchedule, readSchedule, type ScheduleInput } from "./normalize";
import { NUDGE_LOOKBACK_DAYS, type ScheduleNudge, scheduleNudges } from "./nudges";
import { type AdherenceReport, computeAdherence, DATE, type DayFacts, type DoseEvent, type DoseMeal, HISTORY_DAYS, isSlotKey, type Med, resolveSlots, slotKey, type StatusIndex } from "./schedule";
import { type DoseSlot, slotsOn } from "./store-types";
import { todayItems, type TodayItem } from "./wording";

// ---------------------------------------------------------------------------
// Rows ↔ logic
// ---------------------------------------------------------------------------

export function toMed(row: Medication): Med {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    dose: Number(row.dose),
    unit: row.unit,
    form: row.form,
    instructions: row.instructions,
    schedule: readSchedule(row.schedule),
    startDate: row.start_date,
    endDate: row.end_date,
    stock: row.stock === null ? null : Number(row.stock),
    lowStockThreshold: row.low_stock_threshold === null ? null : Number(row.low_stock_threshold),
    lowStock: row.stock !== null && row.low_stock_threshold !== null && Number(row.stock) <= Number(row.low_stock_threshold),
    active: row.active,
    notes: row.notes,
  };
}

type DoseRow = { id: string; medication_id: string; date: string; scheduled_time: string | null; status: DoseStatus; taken_at: string | null; logged_at: string };

const toEvent = (r: DoseRow): DoseEvent => ({
  id: r.id,
  medicationId: r.medication_id,
  date: r.date,
  scheduledTime: r.scheduled_time,
  status: r.status,
  takenAt: r.taken_at ? Date.parse(r.taken_at) : null,
  loggedAt: Date.parse(r.logged_at),
});

type Clock = { tz: string; date: string; time: string; settings: PulsoSettings };

async function clock(client: LifeClient, date?: string, time?: string): Promise<Clock> {
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const now = new Date();
  return { tz, settings, date: date ?? localDate(now, tz), time: time ?? localTime(now, tz) };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Active first, then paused; by name. */
export async function listMedications(client: LifeClient, opts: { includeInactive?: boolean } = {}): Promise<Med[]> {
  let q = pulso(client).from("medications").select("*");
  if (!opts.includeInactive) q = q.eq("active", true);
  const rows = must(await q.order("active", { ascending: false }).order("name"));
  return rows.map(toMed);
}

export async function getMedication(client: LifeClient, id: string): Promise<Med> {
  const row = (await pulso(client).from("medications").select("*").eq("id", id).maybeSingle()).data;
  if (!row) throw new PulsoError("Ese medicamento ya no existe.", "not_found");
  return toMed(row);
}

export async function dosesBetween(client: LifeClient, from: string, to: string, medicationId?: string): Promise<DoseEvent[]> {
  let q = pulso(client).from("medication_doses").select("id, medication_id, date, scheduled_time, status, taken_at, logged_at").gte("date", from).lte("date", to);
  if (medicationId) q = q.eq("medication_id", medicationId);
  return must(await q.order("date").order("logged_at")).map(toEvent);
}

const MIN_WORKOUT_MS = 10 * 60_000;
const PLANNED_DEFAULT_MIN = 60;

/**
 * The day facts moment-linked slots resolve against: workouts that ended
 * (Pulso sessions, and Apple Health ones not linked to a session, ≥ 10 min,
 * not walks), a session in progress today, sessions still planned, the
 * person's meal times.
 */
export async function dayFacts(client: LifeClient, from: string, to: string, today: string, c: Pick<Clock, "tz" | "settings">): Promise<(date: string) => DayFacts> {
  const { tz, settings } = c;
  const start = zonedInstant(from, "00:00", tz).toISOString();
  const end = zonedInstant(addDays(to, 1), "00:00", tz).toISOString();
  const [done, health, planned, live] = await Promise.all([
    pulso(client).from("workouts").select("started_at, ended_at").eq("status", "done").gte("ended_at", start).lt("ended_at", end),
    pulso(client).from("health_workouts").select("activity, started_at, ended_at").is("workout_id", null).gte("ended_at", start).lt("ended_at", end),
    pulso(client).from("workouts").select("local_date, planned_at, started_at, ended_at, status").eq("status", "planned").gte("local_date", from).lte("local_date", to),
    pulso(client).from("live_sessions").select("data, updated_at").maybeSingle(),
  ]);

  const ends = new Map<string, string[]>();
  const addEnd = (iso: string) => {
    const d = localDate(iso, tz);
    ends.set(d, [...(ends.get(d) ?? []), localTime(iso, tz)]);
  };
  for (const w of done.data ?? []) if (w.ended_at) addEnd(w.ended_at);
  for (const w of health.data ?? []) {
    if (Date.parse(w.ended_at) - Date.parse(w.started_at) < MIN_WORKOUT_MS) continue;
    if (/walk|caminar/i.test(w.activity)) continue;
    addEnd(w.ended_at);
  }

  const plan = new Map<string, DayFacts["planned"]>();
  let liveToday = false;
  for (const w of planned.data ?? []) {
    if (w.started_at && !w.ended_at && localDate(w.started_at, tz) === today) liveToday = true;
    if (!w.local_date || !w.planned_at || w.started_at) continue;
    const s = localTime(w.planned_at, tz);
    const e = localTime(new Date(Date.parse(w.planned_at) + PLANNED_DEFAULT_MIN * 60_000), tz);
    plan.set(w.local_date, [...(plan.get(w.local_date) ?? []), { start: s, end: e > s ? e : "23:59" }]);
  }
  const liveStart = (live.data?.data as { startedAt?: number } | undefined)?.startedAt;
  if (typeof liveStart === "number" && localDate(liveStart, tz) === today) liveToday = true;

  const meals = Object.fromEntries(Object.entries(settings.meal_times ?? {}).filter(([k, v]) => ["desayuno", "comida", "cena"].includes(k) && typeof v === "string")) as Partial<Record<DoseMeal, string>>;

  return (date) => ({
    workoutEnds: ends.get(date) ?? [],
    live: liveToday && date === today,
    planned: plan.get(date) ?? [],
    meals,
    sleepTime: "23:00",
  });
}

export type MedicationDay = {
  date: string;
  time: string;
  /** Active medications. */
  medications: number;
  /** Scheduled slots today. */
  total: number;
  taken: number;
  slots: DoseSlot[];
  /** As-needed (and extra) intakes logged today. */
  asNeeded: DoseEvent[];
  /** First pending slot with a time at or after now (or a window still open). */
  next: DoseSlot | null;
};

/** Every slot of `date` with its status, plus as-needed intakes and the next pending dose. */
export async function getMedicationDay(client: LifeClient, date?: string, time?: string): Promise<MedicationDay> {
  const c = await clock(client, date, time);
  const [meds, events] = await Promise.all([listMedications(client), dosesBetween(client, c.date, c.date)]);
  const facts = await dayFacts(client, c.date, c.date, c.date, c);
  const slots = slotsOn(meds, [c.date], events, facts, c.date, c.time);
  const next = slots.find((s) => (s.status === "pendiente" || s.status === "pospuesta") && s.time !== null && (s.window?.end ?? s.time) >= c.time) ?? null;
  return {
    date: c.date,
    time: c.time,
    medications: meds.length,
    total: slots.length,
    taken: slots.filter((s) => s.status === "tomada").length,
    slots,
    asNeeded: events.filter((e) => e.scheduledTime === null),
    next,
  };
}

/** Slots of `days` days from today, for reminders and the "Próximas" list. */
export async function getUpcomingDoses(client: LifeClient, days = 7): Promise<DoseSlot[]> {
  const c = await clock(client);
  const to = addDays(c.date, days - 1);
  const dates = Array.from({ length: days }, (_, i) => addDays(c.date, i));
  const [meds, events] = await Promise.all([listMedications(client), dosesBetween(client, c.date, to)]);
  const facts = await dayFacts(client, c.date, to, c.date, c);
  return slotsOn(meds, dates, events, facts, c.date, c.time);
}

function statusIndex(events: DoseEvent[]): StatusIndex {
  const index: StatusIndex = new Map();
  for (const e of events) if (e.scheduledTime) index.set(slotKey(e.medicationId, e.date, e.scheduledTime), e.status);
  return index;
}

/** Adherence over the last 7/30 days and streaks over a year. Paused meds drop out. */
export async function getAdherence(client: LifeClient): Promise<AdherenceReport> {
  const c = await clock(client);
  const from = addDays(c.date, -HISTORY_DAYS);
  const [meds, events] = await Promise.all([listMedications(client), dosesBetween(client, from, c.date)]);
  const facts = await dayFacts(client, from, c.date, c.date, c);
  return { asOf: { date: c.date, time: c.time }, ...computeAdherence(meds, statusIndex(events), c.date, c.time, facts) };
}

export async function getScheduleNudges(client: LifeClient): Promise<ScheduleNudge[]> {
  const c = await clock(client);
  const [meds, events] = await Promise.all([listMedications(client), dosesBetween(client, addDays(c.date, -NUDGE_LOOKBACK_DAYS), c.date)]);
  return scheduleNudges(meds, events, c.date, c.tz);
}

export type HistoryEntry = DoseEvent & { name: string; dose: number; unit: string };

export type MedicationPage = {
  date: string;
  time: string;
  tz: string;
  today: TodayItem[];
  day: MedicationDay;
  nudges: ScheduleNudge[];
  adherence: AdherenceReport;
  /** Active first, then paused. */
  medications: Med[];
  /** Days with something logged (last 60), newest first. */
  history: { date: string; entries: HistoryEntry[] }[];
  upcoming: DoseSlot[];
};

const PAGE_HISTORY_DAYS = 60;

/** Everything the Medicación page draws, from one clock. */
export async function getMedicationPage(client: LifeClient): Promise<MedicationPage> {
  const c = await clock(client);
  const from = addDays(c.date, -HISTORY_DAYS);
  const upTo = addDays(c.date, 6);
  const [all, events, upcomingEvents] = await Promise.all([listMedications(client, { includeInactive: true }), dosesBetween(client, from, c.date), dosesBetween(client, addDays(c.date, 1), upTo)]);
  const meds = all.filter((m) => m.active);
  const facts = await dayFacts(client, from, upTo, c.date, c);
  const todays = events.filter((e) => e.date === c.date);
  const slots = slotsOn(meds, [c.date], todays, facts, c.date, c.time);
  const loose = todays.filter((e) => e.scheduledTime === null);
  const lastTaken = new Map<string, string>();
  for (const e of events) if (e.status === "tomada" && e.date < c.date && (lastTaken.get(e.medicationId) ?? "") < e.date) lastTaken.set(e.medicationId, e.date);
  const next = slots.find((s) => (s.status === "pendiente" || s.status === "pospuesta") && s.time !== null && (s.window?.end ?? s.time) >= c.time) ?? null;
  const day: MedicationDay = { date: c.date, time: c.time, medications: meds.length, total: slots.length, taken: slots.filter((s) => s.status === "tomada").length, slots, asNeeded: loose, next };

  const byId = new Map(all.map((m) => [m.id, m]));
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of events) {
    if (e.date < addDays(c.date, -(PAGE_HISTORY_DAYS - 1))) continue;
    const m = byId.get(e.medicationId);
    groups.set(e.date, [...(groups.get(e.date) ?? []), { ...e, name: m?.name ?? "Medicamento", dose: m?.dose ?? 0, unit: m?.unit ?? "" }]);
  }
  const history = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, entries]) => ({ date, entries: entries.sort((a, b) => (b.takenAt ?? b.loggedAt) - (a.takenAt ?? a.loggedAt)) }));

  const upcomingDates = Array.from({ length: 6 }, (_, i) => addDays(c.date, i + 1));
  const upcoming = slotsOn(meds, upcomingDates, upcomingEvents, facts, c.date, c.time);

  return {
    date: c.date,
    time: c.time,
    tz: c.tz,
    today: todayItems(meds, slots, loose, c.date, c.time, c.tz, lastTaken),
    day,
    nudges: scheduleNudges(meds, events.filter((e) => e.date > addDays(c.date, -NUDGE_LOOKBACK_DAYS)), c.date, c.tz),
    adherence: { asOf: { date: c.date, time: c.time }, ...computeAdherence(meds, statusIndex(events), c.date, c.time, facts) },
    medications: all,
    history,
    upcoming,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type MedicationInput = {
  name: string;
  kind?: MedicationKind;
  dose: number;
  unit: string;
  form?: string | null;
  instructions?: string | null;
  /** Omitted = as needed. */
  schedule?: ScheduleInput;
  startDate?: string;
  endDate?: string | null;
  stock?: number | null;
  lowStockThreshold?: number | null;
  active?: boolean;
  notes?: string | null;
};

const clean = (s: string | null | undefined, max: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

function checkFields(input: Partial<MedicationInput>) {
  if (input.name !== undefined && !input.name.trim()) throw new PulsoError("Ponle nombre.", "invalid");
  if (input.name && input.name.trim().length > 80) throw new PulsoError("El nombre es muy largo (máx. 80).", "invalid");
  if (input.dose !== undefined && !(input.dose > 0 && input.dose <= 100_000)) throw new PulsoError("La dosis tiene que ser mayor que cero.", "invalid");
  if (input.unit !== undefined && !input.unit.trim()) throw new PulsoError("Falta la unidad (mg, cápsula, g…).", "invalid");
  if (input.startDate && !DATE.test(input.startDate)) throw new PulsoError("Fecha de inicio inválida.", "invalid");
  if (input.endDate && !DATE.test(input.endDate)) throw new PulsoError("Fecha de fin inválida.", "invalid");
  for (const n of [input.stock, input.lowStockThreshold]) if (n != null && !(n >= 0 && n <= 100_000)) throw new PulsoError("Las existencias van de 0 a 100,000.", "invalid");
}

export async function createMedication(client: LifeClient, input: MedicationInput): Promise<Med> {
  checkFields(input);
  const uid = await userId(client);
  const c = await clock(client);
  const startDate = input.startDate ?? c.date;
  if (input.endDate && input.endDate < startDate) throw new PulsoError("La fecha de fin es antes del inicio.", "invalid");
  const schedule = input.schedule ? normalizeSchedule(input.schedule, startDate) : AS_NEEDED;
  const row = must(
    await pulso(client)
      .from("medications")
      .insert({
        user_id: uid,
        name: input.name.trim(),
        kind: input.kind ?? "medicamento",
        dose: input.dose,
        unit: input.unit.trim(),
        form: clean(input.form, 40),
        instructions: clean(input.instructions, 200),
        schedule,
        start_date: startDate,
        end_date: input.endDate ?? null,
        stock: input.stock ?? null,
        low_stock_threshold: input.lowStockThreshold ?? null,
        active: input.active ?? true,
        notes: clean(input.notes, 500),
      })
      .select("*")
      .single(),
  );
  return toMed(row);
}

/** Only the fields given; a schedule replaces the whole schedule. */
export async function updateMedication(client: LifeClient, id: string, patch: Partial<MedicationInput>): Promise<Med> {
  checkFields(patch);
  const before = await getMedication(client, id);
  const startDate = patch.startDate ?? before.startDate;
  const endDate = patch.endDate === undefined ? before.endDate : patch.endDate;
  if (endDate && endDate < startDate) throw new PulsoError("La fecha de fin es antes del inicio.", "invalid");
  const schedule = patch.schedule ? normalizeSchedule(patch.schedule, startDate) : undefined;
  const update: Partial<Medication> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.dose !== undefined) update.dose = patch.dose;
  if (patch.unit !== undefined) update.unit = patch.unit.trim();
  if (patch.form !== undefined) update.form = clean(patch.form, 40);
  if (patch.instructions !== undefined) update.instructions = clean(patch.instructions, 200);
  if (schedule) update.schedule = schedule;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.endDate !== undefined) update.end_date = patch.endDate;
  if (patch.stock !== undefined) update.stock = patch.stock;
  if (patch.lowStockThreshold !== undefined) update.low_stock_threshold = patch.lowStockThreshold;
  if (patch.active !== undefined) update.active = patch.active;
  if (patch.notes !== undefined) update.notes = clean(patch.notes, 500);
  const after = toMed(must(await pulso(client).from("medications").update(update).eq("id", id).select("*").single()));
  if (before.schedule.asNeeded && !after.schedule.asNeeded) await adoptTodaysIntakes(client, after);
  return after;
}

/**
 * An as-needed med just got a schedule: what was already taken today fills
 * today's first open slots, so a dose taken before the change isn't asked for
 * again (or counted as missed).
 */
async function adoptTodaysIntakes(client: LifeClient, med: Med) {
  const c = await clock(client);
  const events = await dosesBetween(client, c.date, c.date, med.id);
  const intakes = events.filter((e) => e.scheduledTime === null && e.status === "tomada").sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0));
  if (!intakes.length) return;
  const logged = new Set(events.map((e) => e.scheduledTime));
  const facts = await dayFacts(client, c.date, c.date, c.date, c);
  const open = resolveSlots(med, c.date, facts(c.date), c.date, c.time).filter((s) => !logged.has(s.slot));
  for (const [i, e] of intakes.slice(0, open.length).entries()) {
    must(await pulso(client).from("medication_doses").update({ scheduled_time: open[i]!.slot }).eq("id", e.id).select("id").single());
  }
}

export async function deleteMedication(client: LifeClient, id: string): Promise<void> {
  const { error } = await pulso(client).from("medications").delete().eq("id", id);
  if (error) throw new PulsoError(`No se pudo borrar: ${error.message}`);
}

/** Moves stock by `delta` doses, never below zero. No-op when stock isn't tracked. */
async function moveStock(client: LifeClient, medicationId: string, delta: number) {
  if (delta === 0) return;
  const med = await getMedication(client, medicationId);
  if (med.stock === null) return;
  must(await pulso(client).from("medications").update({ stock: Math.max(0, med.stock + delta) }).eq("id", medicationId).select("id").single());
}

export type DoseLogInput = {
  medicationId: string;
  /** Local date of the slot; default today. */
  date?: string;
  /** The slot's key ("HH:MM" or a moment); null/omitted for as-needed or extra. */
  scheduledTime?: string | null;
  status: DoseStatus;
  /** Epoch ms; default now. */
  takenAt?: number | null;
};

/**
 * Records what happened to a dose. A scheduled slot has at most one event, so
 * re-logging it overwrites; as-needed intakes always add one. Stock follows
 * "tomada".
 */
export async function recordDose(client: LifeClient, input: DoseLogInput): Promise<DoseEvent> {
  const uid = await userId(client);
  const c = await clock(client);
  const med = await getMedication(client, input.medicationId);
  const date = input.date ?? c.date;
  if (!DATE.test(date)) throw new PulsoError("Fecha inválida.", "invalid");
  const slot = input.scheduledTime ?? null;
  if (slot !== null && !isSlotKey(slot)) throw new PulsoError("Toma inválida.", "invalid");
  if (slot === null && !med.schedule.asNeeded && input.status !== "tomada") throw new PulsoError("Elige cuál toma (hora o momento).", "invalid");
  const takenAt = input.status === "tomada" ? new Date(input.takenAt ?? Date.now()).toISOString() : null;

  const existing =
    slot === null
      ? null
      : (await pulso(client).from("medication_doses").select("id, medication_id, date, scheduled_time, status, taken_at, logged_at").eq("medication_id", med.id).eq("date", date).eq("scheduled_time", slot).maybeSingle()).data;
  await moveStock(client, med.id, (existing?.status === "tomada" ? 1 : 0) - (input.status === "tomada" ? 1 : 0));
  const logged = new Date().toISOString();
  const row = existing
    ? must(await pulso(client).from("medication_doses").update({ status: input.status, taken_at: takenAt, logged_at: logged }).eq("id", existing.id).select("id, medication_id, date, scheduled_time, status, taken_at, logged_at").single())
    : must(
        await pulso(client)
          .from("medication_doses")
          .insert({ user_id: uid, medication_id: med.id, date, scheduled_time: slot, status: input.status, taken_at: takenAt, logged_at: logged })
          .select("id, medication_id, date, scheduled_time, status, taken_at, logged_at")
          .single(),
      );
  return toEvent(row);
}

/** Removes a logged dose (the slot goes back to pending), returning stock if it was taken. */
export async function undoDose(client: LifeClient, doseId: string): Promise<void> {
  const row = (await pulso(client).from("medication_doses").select("id, medication_id, status").eq("id", doseId).maybeSingle()).data;
  if (!row) throw new PulsoError("Esa toma ya no existe.", "not_found");
  if (row.status === "tomada") await moveStock(client, row.medication_id, 1);
  const { error } = await pulso(client).from("medication_doses").delete().eq("id", doseId);
  if (error) throw new PulsoError(`No se pudo deshacer: ${error.message}`);
}
