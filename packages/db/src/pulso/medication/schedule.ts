/**
 * Pure date math (ported from the old engine's medication/schedule.ts):
 * schedules into dose slots, and slots plus logged events into adherence and
 * streaks. Everything works on local "YYYY-MM-DD" / "HH:MM" strings in the
 * person's timezone; the loader resolves "now" before calling in.
 */
import type { DayPart, DoseStatus, MedicationKind } from "../../types";
import { addDays, daysBetween, isoWeekday } from "../dates";

export const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DoseMeal = "desayuno" | "comida" | "cena";
export type TrainingRule = { withinMinutes: number; restDayTime: string | null };
export type DoseWindow = { part: DayPart; start: string; end: string };
export type ScheduleInterval = { every: number; unit: "day" | "week"; start: string };

/** A schedule with every part filled (what the store reads back). */
export type FullSchedule = {
  asNeeded: boolean;
  times: string[];
  days: number[];
  interval: ScheduleInterval | null;
  monthDay: number | null;
  training: TrainingRule | null;
  meals: DoseMeal[];
  bedtime: boolean;
  windows: DoseWindow[];
  anyTime: boolean;
  reminder: string | null;
};

export type DoseMoment = "hora" | "entreno" | "desayuno" | "comida" | "cena" | "dormir" | "manana" | "tarde" | "noche" | "dia";

/** A medication as the logic sees it (camelCase, schedule filled). */
export type Med = {
  id: string;
  name: string;
  kind: MedicationKind;
  dose: number;
  unit: string;
  form: string | null;
  instructions: string | null;
  schedule: FullSchedule;
  startDate: string;
  endDate: string | null;
  stock: number | null;
  lowStockThreshold: number | null;
  lowStock: boolean;
  active: boolean;
  notes: string | null;
};

/** A logged dose (camelCase). `takenAt` is epoch ms. */
export type DoseEvent = {
  id: string;
  medicationId: string;
  date: string;
  scheduledTime: string | null;
  status: DoseStatus;
  takenAt: number | null;
  loggedAt: number;
};

export type TrainingSlot = {
  state: "trained" | "training" | "planned" | "rest";
  workoutEnd: string | null;
  until: string | null;
  plannedAt: string | null;
  fallback: string | null;
};

/** Default ranges of each day part, editable per schedule. */
export const DAY_PART_RANGES: Record<DayPart, { start: string; end: string }> = {
  manana: { start: "07:00", end: "12:00" },
  tarde: { start: "12:00", end: "19:00" },
  noche: { start: "19:00", end: "23:00" },
};

/** The gentle evening reminder an any-time dose gets unless the person picks another hour or none. */
export const DEFAULT_ANY_TIME_REMINDER = "19:00";

/** The last day of the month of `date`, 28–31. */
const daysInMonth = (date: string) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();

/**
 * Whether a schedule's frequency falls on `date` (ignoring start/end dates):
 * every N days from the interval's start, every N weeks (counted Monday to
 * Monday from the start's week) on `days`, a day of the month (clamped to the
 * month's last day), or the weekdays in `days` (all when empty).
 */
export function isDueOn(schedule: Pick<FullSchedule, "days" | "interval" | "monthDay">, date: string): boolean {
  const { interval, monthDay, days } = schedule;
  if (monthDay) return Number(date.slice(8, 10)) === Math.min(monthDay, daysInMonth(date));
  if (interval) {
    if (date < interval.start) return false;
    if (interval.unit === "day") return daysBetween(interval.start, date) % interval.every === 0;
    const weeks = daysBetween(addDays(interval.start, 1 - isoWeekday(interval.start)), date) / 7;
    if (Math.floor(weeks) % interval.every !== 0) return false;
    return (days.length ? days : [isoWeekday(interval.start)]).includes(isoWeekday(date));
  }
  return days.length === 0 || days.includes(isoWeekday(date));
}

/** Minutes since midnight of "HH:MM", and back (clamped to the day). */
export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const fromMinutes = (minutes: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Used when the person has no time for a meal. */
export const DOSE_MEAL_TIMES: Record<DoseMeal, string> = { desayuno: "08:00", comida: "14:00", cena: "21:00" };
/** "Antes de dormir" reminds this long before the sleep time. */
export const BEDTIME_LEAD_MINUTES = 30;

/** What a day looks like for the slots tied to moments. Times are local "HH:MM". */
export type DayFacts = {
  /** When each workout of the day ended: Pulso sessions and Health workouts. */
  workoutEnds: string[];
  /** A session is in progress right now (only ever true for today). */
  live: boolean;
  /** Sessions still planned that day. */
  planned: { start: string; end: string }[];
  meals: Partial<Record<DoseMeal, string>>;
  sleepTime: string;
};

export const NO_FACTS: DayFacts = { workoutEnds: [], live: false, planned: [], meals: {}, sleepTime: "23:00" };

export type ResolvedSlot = { slot: string; moment: DoseMoment; time: string | null; training: TrainingSlot | null; window: DoseWindow | null; remindAt: string | null };

/** Moments whose dose is due over a stretch of the day, so they only count as missed once that day is over. */
export const isFlexible = (moment: DoseMoment) => moment === "dia" || moment === "manana" || moment === "tarde" || moment === "noche";

type Schedulable = Pick<Med, "schedule" | "startDate" | "endDate" | "active">;

/**
 * The training slot of a day, or null when there is none:
 * 1. A workout ended that day → due at the first one's end, within the window.
 * 2. Today, a session in progress → wait for it.
 * 3. A planned session still ahead → wait for it.
 * 4. Otherwise a rest day: due at restDayTime, or no slot with "No tomar".
 */
export function resolveTraining(rule: TrainingRule, date: string, facts: DayFacts, today: string, now: string): TrainingSlot | null {
  const none = { workoutEnd: null, until: null, plannedAt: null, fallback: null };
  const ended = [...facts.workoutEnds].sort()[0];
  if (ended) return { ...none, state: "trained", workoutEnd: ended, until: fromMinutes(toMinutes(ended) + rule.withinMinutes) };

  const latestPlanEnd = facts.planned.map((p) => p.end).sort().at(-1);
  const fallback = rule.restDayTime && latestPlanEnd && latestPlanEnd > rule.restDayTime ? latestPlanEnd : rule.restDayTime;
  if (date === today && facts.live) return { ...none, state: "training", fallback };
  const ahead = date < today ? [] : facts.planned.filter((p) => date > today || p.end > now).sort((a, b) => a.start.localeCompare(b.start));
  if (ahead[0]) return { ...none, state: "planned", plannedAt: ahead[0].start, fallback };
  return fallback ? { ...none, state: "rest", fallback } : null;
}

/** Every slot of one med on one date, sorted by time (any-time and waiting ones last). */
export function resolveSlots(med: Schedulable, date: string, facts: DayFacts = NO_FACTS, today = date, now = "00:00"): ResolvedSlot[] {
  const { schedule } = med;
  if (!med.active || schedule.asNeeded) return [];
  if (date < med.startDate || (med.endDate && date > med.endDate)) return [];
  if (!isDueOn(schedule, date)) return [];

  const at = (slot: string, moment: DoseMoment, time: string | null): ResolvedSlot => ({ slot, moment, time, training: null, window: null, remindAt: time });
  const slots: ResolvedSlot[] = [...new Set(schedule.times)].map((t) => at(t, "hora", t));
  for (const meal of new Set(schedule.meals)) slots.push(at(meal, meal, facts.meals[meal] ?? DOSE_MEAL_TIMES[meal]));
  if (schedule.bedtime) {
    const sleep = facts.sleepTime < "12:00" ? "24:00" : facts.sleepTime;
    slots.push(at("dormir", "dormir", fromMinutes(toMinutes(sleep) - BEDTIME_LEAD_MINUTES)));
  }
  for (const window of schedule.windows) slots.push({ ...at(window.part, window.part, window.start), window });
  if (schedule.anyTime) slots.push({ ...at("dia", "dia", null), remindAt: schedule.reminder });
  if (schedule.training) {
    const training = resolveTraining(schedule.training, date, facts, today, now);
    if (training) {
      const time = training.state === "trained" ? training.workoutEnd : training.state === "rest" ? training.fallback : null;
      slots.push({ ...at("entreno", "entreno", time), training, remindAt: time ?? training.fallback });
    }
  }
  return slots.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.slot.localeCompare(b.slot));
}

export const SLOT_MOMENTS = ["entreno", "desayuno", "comida", "cena", "dormir", "manana", "tarde", "noche", "dia"] as const;
export const isSlotKey = (key: string) => TIME.test(key) || (SLOT_MOMENTS as readonly string[]).includes(key);

export type StatusIndex = Map<string, DoseStatus>;
export const slotKey = (medicationId: string, date: string, slot: string) => `${medicationId}|${date}|${slot}`;

type DayCount = { due: number; taken: number; allTaken: boolean; slots: number };

function countDay(med: Med, date: string, statuses: StatusIndex, today: string, now: string, facts: DayFacts): DayCount {
  const slots = resolveSlots(med, date, facts, today, now);
  let due = 0;
  let taken = 0;
  let allTaken = true;
  for (const { slot, moment, time } of slots) {
    const isTaken = statuses.get(slotKey(med.id, date, slot)) === "tomada";
    if (!isTaken) allTaken = false;
    if (date < today || isTaken || (!isFlexible(moment) && time !== null && time <= now)) {
      due += 1;
      if (isTaken) taken += 1;
    }
  }
  return { due, taken, allTaken, slots: slots.length };
}

export type AdherenceWindow = { due: number; taken: number; rate: number | null };
const windowOf = (due: number, taken: number): AdherenceWindow => ({ due, taken, rate: due ? taken / due : null });

function streaks(days: DayCount[]): { current: number; best: number } {
  let run = 0;
  let best = 0;
  days.forEach((day, i) => {
    const isToday = i === days.length - 1;
    if (day.slots === 0) return;
    if (day.allTaken) run += 1;
    else if (!isToday) run = 0;
    best = Math.max(best, run);
  });
  return { current: run, best };
}

/** How far back streaks look. */
export const HISTORY_DAYS = 365;

export type MedicationAdherence = { medicationId: string; name: string; last7: AdherenceWindow; last30: AdherenceWindow; currentStreak: number; bestStreak: number };
export type AdherenceDay = { date: string; due: number; taken: number };
export type AdherenceReport = {
  asOf: { date: string; time: string };
  overall: { last7: AdherenceWindow; last30: AdherenceWindow; currentStreak: number; bestStreak: number };
  medications: MedicationAdherence[];
  /** Last 30 days, oldest first. */
  days: AdherenceDay[];
};

export function computeAdherence(meds: Med[], statuses: StatusIndex, today: string, now: string, factsOf: (date: string) => DayFacts = () => NO_FACTS, historyDays = HISTORY_DAYS): Omit<AdherenceReport, "asOf"> {
  const dates = Array.from({ length: historyDays }, (_, i) => addDays(today, i - historyDays + 1));
  const facts = dates.map(factsOf);
  const perMed = meds.map((med) => ({ med, days: dates.map((date, i) => countDay(med, date, statuses, today, now, facts[i]!)) }));

  const sum = (days: DayCount[], last: number) => {
    const slice = days.slice(-last);
    return windowOf(
      slice.reduce((n, d) => n + d.due, 0),
      slice.reduce((n, d) => n + d.taken, 0),
    );
  };

  const medications: MedicationAdherence[] = perMed
    .filter(({ days }) => days.some((d) => d.slots > 0))
    .map(({ med, days }) => {
      const { current, best } = streaks(days);
      return { medicationId: med.id, name: med.name, last7: sum(days, 7), last30: sum(days, 30), currentStreak: current, bestStreak: best };
    });

  const combined: DayCount[] = dates.map((_, i) => {
    const day = { due: 0, taken: 0, allTaken: true, slots: 0 };
    for (const { days } of perMed) {
      const d = days[i]!;
      day.due += d.due;
      day.taken += d.taken;
      day.slots += d.slots;
      if (!d.allTaken) day.allTaken = false;
    }
    return day;
  });
  const { current, best } = streaks(combined);
  const last = Math.min(30, dates.length);
  const days: AdherenceDay[] = dates.slice(-last).map((date, i) => {
    const d = combined[combined.length - last + i]!;
    return { date, due: d.due, taken: d.taken };
  });

  return {
    overall: { last7: sum(combined, 7), last30: sum(combined, 30), currentStreak: current, bestStreak: best },
    medications,
    days,
  };
}
