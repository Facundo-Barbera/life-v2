import type { Medication as MedRow, MedicationDose as DoseRow } from "@life/db";
import { localDate, localTime } from "@life/db/pulso";
import { DAY_PART_RANGES, DEFAULT_ANY_TIME_REMINDER, type DoseEvent, type DoseSlot, type Medication, type MedicationSchedule, type MedicationScheduleInput } from "@/contract";
import { NUDGE_LOOKBACK_DAYS, scheduleNudges } from "../logic/med-nudges";
import { addDays, computeAdherence, HISTORY_DAYS, isoWeekday, NO_FACTS, resolveSlots, slotKey, type DayFacts, type StatusIndex } from "../logic/med-schedule";
import { today } from "./daily";
import { iso, maybe, ms, n, nn, ok, one, P, rows } from "./db";
import type { Ctx, OpTable } from "./types";

const EMPTY: Omit<MedicationSchedule, "asNeeded"> = { times: [], days: [], interval: null, monthDay: null, training: null, meals: [], bedtime: false, windows: [], anyTime: false, reminder: null };
const AS_NEEDED: MedicationSchedule = { asNeeded: true, ...EMPTY };

const readSchedule = (raw: unknown): MedicationSchedule => ({ ...AS_NEEDED, ...((raw ?? {}) as Partial<MedicationSchedule>) });

export const toMedication = (row: MedRow): Medication => {
  const stock = nn(row.stock);
  const low = nn(row.low_stock_threshold);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    dose: n(row.dose),
    unit: row.unit,
    form: row.form,
    instructions: row.instructions,
    schedule: readSchedule(row.schedule),
    startDate: row.start_date,
    endDate: row.end_date,
    stock,
    lowStockThreshold: low,
    lowStock: stock !== null && low !== null && stock <= low,
    active: row.active,
    notes: row.notes,
    createdAt: ms(row.created_at),
    updatedAt: ms(row.updated_at),
  };
};

const toDose = (row: DoseRow): DoseEvent => ({
  id: row.id,
  medicationId: row.medication_id,
  date: row.date,
  scheduledTime: row.scheduled_time,
  status: row.status,
  takenAt: row.taken_at ? ms(row.taken_at) : null,
  loggedAt: ms(row.logged_at),
});

/** As the old engine's normalizeSchedule: one frequency, sorted, defaults filled; as-needed drops everything else. */
export function normalizeSchedule(s: MedicationScheduleInput, startDate: string): MedicationSchedule {
  if (s.asNeeded) return AS_NEEDED;
  const windows = (s.windows ?? []).map((w) => ({ part: w.part, start: w.start ?? DAY_PART_RANGES[w.part].start, end: w.end ?? DAY_PART_RANGES[w.part].end }));
  const meals = s.meals ?? [];
  if (s.times.length === 0 && meals.length === 0 && !s.bedtime && !s.training && windows.length === 0 && !s.anyTime)
    throw new Error("Un medicamento con horario necesita una hora, una parte del día, «cualquier hora», una comida, dormir o entreno.");
  if (new Set(windows.map((w) => w.part)).size < windows.length) throw new Error("Cada parte del día (mañana, tarde, noche) va una sola vez.");
  if (windows.some((w) => w.start >= w.end)) throw new Error("El inicio de una franja va antes de su fin.");
  const monthDay = s.monthDay ?? null;
  const interval = monthDay || !s.interval ? null : { ...s.interval, start: s.interval.start ?? startDate };
  let days = [...new Set(s.days)].sort();
  if (monthDay || interval?.unit === "day" || (!interval && days.length === 7)) days = [];
  if (interval?.unit === "week" && days.length === 0) days = [isoWeekday(interval.start)];
  const keepInterval = interval && interval.every > 1 ? interval : null;
  const anyTime = s.anyTime ?? false;
  return {
    asNeeded: false,
    times: [...new Set(s.times)].sort(),
    days,
    interval: keepInterval,
    monthDay,
    training: s.training ?? null,
    meals: (["desayuno", "comida", "cena"] as const).filter((m) => meals.includes(m)),
    bedtime: s.bedtime ?? false,
    windows: (["manana", "tarde", "noche"] as const).flatMap((part) => windows.filter((w) => w.part === part)),
    anyTime,
    reminder: anyTime ? (s.reminder === undefined ? DEFAULT_ANY_TIME_REMINDER : s.reminder) : null,
  };
}

async function listMeds(ctx: Ctx, all = false): Promise<Medication[]> {
  let q = P(ctx).from("medications").select("*");
  if (!all) q = q.eq("active", true);
  const meds = rows(await q).map(toMedication);
  return meds.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"));
}

async function getMed(ctx: Ctx, id: string): Promise<Medication> {
  return toMedication(one(await P(ctx).from("medications").select("*").eq("id", id).single(), "El medicamento"));
}

async function dosesBetween(ctx: Ctx, from: string, to: string, medicationId?: string): Promise<DoseEvent[]> {
  let q = P(ctx).from("medication_doses").select("*").gte("date", from).lte("date", to);
  if (medicationId) q = q.eq("medication_id", medicationId);
  return rows(await q.order("date").order("scheduled_time")).map(toDose);
}

const hm = (at: string | null | undefined, tz: string) => (at ? localTime(at, tz) : null);

/**
 * What each day looks like for slots tied to moments: workouts that ended
 * (Pulso sessions and Apple Health), one in progress, planned sessions, the
 * person's meal times. Bedtime stays 23:00 (no calendar of sleep here yet).
 */
async function dayFacts(ctx: Ctx, from: string, to: string, todayDate: string): Promise<(date: string) => DayFacts> {
  const start = iso(Date.parse(`${addDays(from, -1)}T00:00:00Z`));
  const end = iso(Date.parse(`${addDays(to, 2)}T00:00:00Z`));
  const [workouts, health, live, settings] = await Promise.all([
    P(ctx).from("workouts").select("status, local_date, planned_at, started_at, ended_at").gte("local_date", addDays(from, -1)).lte("local_date", to),
    P(ctx).from("health_workouts").select("started_at, ended_at").gte("ended_at", start).lte("ended_at", end),
    P(ctx).from("live_sessions").select("updated_at").maybeSingle(),
    P(ctx).from("settings").select("meal_times").maybeSingle(),
  ]);
  const byDate = new Map<string, DayFacts>();
  const factsFor = (date: string) => {
    let f = byDate.get(date);
    if (!f) byDate.set(date, (f = { ...NO_FACTS, workoutEnds: [], planned: [], meals: { ...((maybe(settings)?.meal_times ?? {}) as DayFacts["meals"]) } }));
    return f;
  };
  for (const w of rows(workouts)) {
    if (w.status === "done" && w.ended_at) factsFor(localDate(w.ended_at, ctx.tz)).workoutEnds.push(hm(w.ended_at, ctx.tz)!);
    else if (w.status === "planned" && w.planned_at) {
      const s = hm(w.planned_at, ctx.tz)!;
      factsFor(w.local_date ?? localDate(w.planned_at, ctx.tz)).planned.push({ start: s, end: s });
    }
  }
  for (const h of rows(health)) factsFor(localDate(h.ended_at, ctx.tz)).workoutEnds.push(hm(h.ended_at, ctx.tz)!);
  if (maybe(live)) factsFor(todayDate).live = true;
  return (date) => factsFor(date);
}

function slotsOn(meds: Medication[], dates: string[], events: DoseEvent[], factsOf: (date: string) => DayFacts, todayDate: string, now: string): DoseSlot[] {
  const bySlot = new Map(events.filter((e) => e.scheduledTime).map((e) => [slotKey(e.medicationId, e.date, e.scheduledTime!), e]));
  return dates.flatMap((date) =>
    meds
      .flatMap((med) =>
        resolveSlots(med, date, factsOf(date), todayDate, now).map((r): DoseSlot => {
          const event = bySlot.get(slotKey(med.id, date, r.slot));
          return {
            medicationId: med.id,
            name: med.name,
            kind: med.kind,
            dose: med.dose,
            unit: med.unit,
            instructions: med.instructions,
            date,
            ...r,
            status: event?.status ?? "pendiente",
            eventId: event?.id ?? null,
            takenAt: event?.takenAt ?? null,
          };
        }),
      )
      .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.name.localeCompare(b.name)),
  );
}

const asOf = (ctx: Ctx, input: { date?: string; time?: string }) => ({
  date: input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today(ctx),
  time: input.time && /^\d{2}:\d{2}$/.test(input.time) ? input.time : localTime(new Date(), ctx.tz),
});

async function moveStock(ctx: Ctx, medicationId: string, delta: number) {
  if (delta === 0) return;
  const med = maybe(await P(ctx).from("medications").select("stock").eq("id", medicationId).maybeSingle());
  if (!med || med.stock == null) return;
  ok(await P(ctx).from("medications").update({ stock: Math.max(0, n(med.stock) + delta) }).eq("id", medicationId));
}

export async function medicationDay(ctx: Ctx, date: string, time: string) {
  const [meds, events, facts] = await Promise.all([listMeds(ctx), dosesBetween(ctx, date, date), dayFacts(ctx, date, date, date)]);
  const slots = slotsOn(meds, [date], events, facts, date, time);
  const next = slots.find((s) => (s.status === "pendiente" || s.status === "pospuesta") && s.time !== null && (s.window?.end ?? s.time) >= time) ?? null;
  return { date, slots, asNeeded: events.filter((e) => e.scheduledTime === null), next };
}

export const medicationOps: OpTable = {
  async get_medications(ctx, { all }) {
    return { medications: await listMeds(ctx, all) };
  },
  async create_medication(ctx, input) {
    const startDate = input.startDate ?? today(ctx);
    if (input.endDate && input.endDate < startDate) throw new Error("La fecha de fin va después del inicio.");
    const schedule = input.schedule ? normalizeSchedule(input.schedule as MedicationScheduleInput, startDate) : AS_NEEDED;
    const row = one(
      await P(ctx)
        .from("medications")
        .insert({
          user_id: ctx.userId,
          name: input.name.trim(),
          kind: input.kind ?? "medicamento",
          dose: input.dose,
          unit: input.unit.trim(),
          form: input.form?.trim() || null,
          instructions: input.instructions?.trim() || null,
          schedule,
          start_date: startDate,
          end_date: input.endDate ?? null,
          stock: input.stock ?? null,
          low_stock_threshold: input.lowStockThreshold ?? null,
          active: input.active ?? true,
          notes: input.notes?.trim() || null,
        })
        .select("*")
        .single(),
    );
    return toMedication(row);
  },
  async edit_medication(ctx, { id, schedule, ...patch }) {
    const before = await getMed(ctx, id);
    const startDate = patch.startDate ?? before.startDate;
    const endDate = patch.endDate === undefined ? before.endDate : patch.endDate;
    if (endDate && endDate < startDate) throw new Error("La fecha de fin va después del inicio.");
    const next = schedule ? normalizeSchedule(schedule as MedicationScheduleInput, startDate) : before.schedule;
    const update: Partial<MedRow> = { schedule: next as MedRow["schedule"], start_date: startDate, end_date: endDate };
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.kind !== undefined) update.kind = patch.kind;
    if (patch.dose !== undefined) update.dose = patch.dose;
    if (patch.unit !== undefined) update.unit = patch.unit.trim();
    if (patch.form !== undefined) update.form = patch.form?.trim() || null;
    if (patch.instructions !== undefined) update.instructions = patch.instructions?.trim() || null;
    if (patch.stock !== undefined) update.stock = patch.stock;
    if (patch.lowStockThreshold !== undefined) update.low_stock_threshold = patch.lowStockThreshold;
    if (patch.active !== undefined) update.active = patch.active;
    if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
    ok(await P(ctx).from("medications").update(update).eq("id", id));
    const med = await getMed(ctx, id);
    // An as-needed med just got a schedule: today's intakes fill today's first open slots.
    if (before.schedule.asNeeded && !med.schedule.asNeeded) {
      const { date, time } = asOf(ctx, {});
      const events = await dosesBetween(ctx, date, date, id);
      const intakes = events.filter((e) => e.scheduledTime === null && e.status === "tomada").sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0));
      const logged = new Set(events.map((e) => e.scheduledTime));
      const open = resolveSlots(med, date, (await dayFacts(ctx, date, date, date))(date), date, time).filter((s) => !logged.has(s.slot));
      for (const [i, e] of intakes.slice(0, open.length).entries()) ok(await P(ctx).from("medication_doses").update({ scheduled_time: open[i]!.slot }).eq("id", e.id));
    }
    return med;
  },
  async delete_medication(ctx, { id }) {
    ok(await P(ctx).from("medications").delete().eq("id", id));
    return { id, deleted: id };
  },
  async get_medication_day(ctx, input) {
    const { date, time } = asOf(ctx, input);
    return medicationDay(ctx, date, time);
  },
  async get_upcoming_doses(ctx, input) {
    const { date, time } = asOf(ctx, input);
    const days = 7;
    const to = addDays(date, days - 1);
    const dates = Array.from({ length: days }, (_, i) => addDays(date, i));
    const [meds, events, facts] = await Promise.all([listMeds(ctx), dosesBetween(ctx, date, to), dayFacts(ctx, date, to, date)]);
    return { from: date, slots: slotsOn(meds, dates, events, facts, date, time) };
  },
  async get_adherence_report(ctx, input) {
    const { date, time } = asOf(ctx, input);
    const from = addDays(date, -HISTORY_DAYS);
    const [meds, events, facts] = await Promise.all([listMeds(ctx), dosesBetween(ctx, from, date), dayFacts(ctx, addDays(date, -35), date, date)]);
    const index: StatusIndex = new Map();
    for (const e of events) if (e.scheduledTime) index.set(slotKey(e.medicationId, e.date, e.scheduledTime), e.status);
    return { asOf: { date, time }, ...computeAdherence(meds, index, date, time, facts) };
  },
  async list_schedule_nudges(ctx, input) {
    const date = input.date ?? today(ctx);
    const [meds, events] = await Promise.all([listMeds(ctx), dosesBetween(ctx, addDays(date, -NUDGE_LOOKBACK_DAYS), date)]);
    return { nudges: scheduleNudges(meds, events, date) };
  },
  async list_doses(ctx, { from, to, medicationId }) {
    return { doses: await dosesBetween(ctx, from, to, medicationId) };
  },
  async record_dose(ctx, input) {
    const med = await getMed(ctx, input.medicationId);
    const date = input.date ?? today(ctx);
    const time = input.scheduledTime ?? null;
    if (time === null && !med.schedule.asNeeded && input.status !== "tomada") throw new Error("Elige la toma que quieres marcar.");
    const takenAt = input.status === "tomada" ? iso(Math.round(input.takenAt ?? Date.now())) : null;
    const existing =
      time === null ? null : maybe(await P(ctx).from("medication_doses").select("*").eq("medication_id", med.id).eq("date", date).eq("scheduled_time", time).maybeSingle());
    await moveStock(ctx, med.id, (existing?.status === "tomada" ? 1 : 0) - (input.status === "tomada" ? 1 : 0));
    const now = new Date().toISOString();
    const row = existing
      ? one(await P(ctx).from("medication_doses").update({ status: input.status, taken_at: takenAt, logged_at: now }).eq("id", existing.id).select("*").single())
      : one(
          await P(ctx)
            .from("medication_doses")
            .insert({ user_id: ctx.userId, medication_id: med.id, date, scheduled_time: time, status: input.status, taken_at: takenAt, logged_at: now })
            .select("*")
            .single(),
        );
    return toDose(row);
  },
  async undo_dose(ctx, { id }) {
    const row = one(await P(ctx).from("medication_doses").select("*").eq("id", id).single(), "Esa toma");
    if (row.status === "tomada") await moveStock(ctx, row.medication_id, 1);
    ok(await P(ctx).from("medication_doses").delete().eq("id", id));
    return { id, undone: id };
  },
};
