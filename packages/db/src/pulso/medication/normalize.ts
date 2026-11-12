/**
 * Validating and normalizing schedules and medication input (the old store's
 * zod schemas + normalizeSchedule, by hand: @life/db carries no zod). Errors
 * are Spanish PulsoErrors, ready to show.
 */
import type { DayPart, MedicationSchedule } from "../../types";
import { PulsoError } from "../core";
import { isoWeekday } from "../dates";
import { DATE, DAY_PART_RANGES, DEFAULT_ANY_TIME_REMINDER, type DoseMeal, type FullSchedule, TIME } from "./schedule";

const EMPTY: Omit<FullSchedule, "asNeeded"> = { times: [], days: [], interval: null, monthDay: null, training: null, meals: [], bedtime: false, windows: [], anyTime: false, reminder: null };
export const AS_NEEDED: FullSchedule = { asNeeded: true, ...EMPTY };
export const NO_SCHEDULE: FullSchedule = { asNeeded: false, ...EMPTY };

/**
 * A stored schedule read back: older or partial ones read as exactly what
 * they say with every newer part off. Windows without a range get the default.
 */
export function readSchedule(raw: Partial<MedicationSchedule> | null | undefined): FullSchedule {
  const s = { ...AS_NEEDED, ...(raw ?? {}) } as FullSchedule & { windows?: { part: DayPart; start?: string; end?: string }[] };
  return {
    asNeeded: !!s.asNeeded,
    times: s.times ?? [],
    days: s.days ?? [],
    interval: s.interval ?? null,
    monthDay: s.monthDay ?? null,
    training: s.training ?? null,
    meals: s.meals ?? [],
    bedtime: !!s.bedtime,
    windows: (s.windows ?? []).map((w) => ({ part: w.part, start: w.start ?? DAY_PART_RANGES[w.part].start, end: w.end ?? DAY_PART_RANGES[w.part].end })),
    anyTime: !!s.anyTime,
    reminder: s.reminder ?? null,
  };
}

/** What callers send: everything beyond asNeeded/times/days optional; `reminder` undefined = default for any-time. */
export type ScheduleInput = {
  asNeeded?: boolean;
  times?: string[];
  days?: number[];
  interval?: { every: number; unit: "day" | "week"; start?: string } | null;
  monthDay?: number | null;
  training?: { withinMinutes?: number; restDayTime?: string | null } | null;
  meals?: DoseMeal[];
  bedtime?: boolean;
  windows?: { part: DayPart; start?: string; end?: string }[];
  anyTime?: boolean;
  reminder?: string | null;
};

const bad = (message: string): never => {
  throw new PulsoError(message, "invalid");
};
const time = (t: string, what: string) => (TIME.test(t) ? t : bad(`${what}: usa HH:MM (24 h).`));

/**
 * Sorted and deduped, with one frequency kept (month day, else interval, else
 * weekdays) and defaults filled: an interval starts with the medication, weeks
 * without days fall on the start's weekday, an any-time dose gets the evening
 * reminder unless told otherwise. As-needed drops everything else.
 */
export function normalizeSchedule(input: ScheduleInput, startDate: string): FullSchedule {
  if (input.asNeeded) return AS_NEEDED;
  const times = (input.times ?? []).map((t) => time(t, "Hora"));
  const daysIn = input.days ?? [];
  if (daysIn.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) bad("Días de la semana: 1 (lunes) a 7 (domingo).");
  const windows = (input.windows ?? []).map((w) => {
    const start = w.start ? time(w.start, "Inicio de la ventana") : DAY_PART_RANGES[w.part].start;
    const end = w.end ? time(w.end, "Fin de la ventana") : DAY_PART_RANGES[w.part].end;
    if (start >= end) bad("La ventana tiene que empezar antes de terminar.");
    return { part: w.part, start, end };
  });
  if (new Set(windows.map((w) => w.part)).size < windows.length) bad("Cada parte del día (mañana, tarde, noche) puede ir una vez.");
  const training = input.training
    ? {
        withinMinutes: Math.round(input.training.withinMinutes ?? 60),
        restDayTime: input.training.restDayTime ? time(input.training.restDayTime, "Hora sin entreno") : null,
      }
    : null;
  if (training && (training.withinMinutes < 5 || training.withinMinutes > 240)) bad("Después de entrenar: entre 5 y 240 minutos.");
  const meals = (["desayuno", "comida", "cena"] as const).filter((m) => (input.meals ?? []).includes(m));
  const bedtime = !!input.bedtime;
  const anyTime = !!input.anyTime;
  if (times.length === 0 && meals.length === 0 && !bedtime && !training && windows.length === 0 && !anyTime) {
    bad("Elige cuándo: una hora, una parte del día, cualquier hora, una comida, antes de dormir o después de entrenar (o «cuando haga falta»).");
  }
  const monthDay = input.monthDay ?? null;
  if (monthDay !== null && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) bad("Día del mes: 1 a 31.");
  if (input.interval) {
    if (!Number.isInteger(input.interval.every) || input.interval.every < 1 || input.interval.every > 52) bad("Cada cuántos: 1 a 52.");
    if (input.interval.start && !DATE.test(input.interval.start)) bad("Fecha de inicio inválida.");
  }
  const interval = monthDay || !input.interval ? null : { every: input.interval.every, unit: input.interval.unit, start: input.interval.start ?? startDate };
  let days = [...new Set(daysIn)].sort();
  if (monthDay || interval?.unit === "day" || (!interval && days.length === 7)) days = [];
  if (interval?.unit === "week" && days.length === 0) days = [isoWeekday(interval.start)];
  const keepInterval = interval && interval.every > 1 ? interval : null;
  const reminder = anyTime ? (input.reminder === undefined ? DEFAULT_ANY_TIME_REMINDER : input.reminder ? time(input.reminder, "Aviso") : null) : null;
  return {
    asNeeded: false,
    times: [...new Set(times)].sort(),
    days,
    interval: keepInterval,
    monthDay,
    training,
    meals,
    bedtime,
    windows: (["manana", "tarde", "noche"] as const).flatMap((part) => windows.filter((w) => w.part === part)),
    anyTime,
    reminder,
  };
}
