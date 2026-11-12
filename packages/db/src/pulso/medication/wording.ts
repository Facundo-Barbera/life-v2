/**
 * Spanish wording for schedules and slots, and where each dose stands today
 * (ported from the old web's medication view and read-back). Pure; shared by
 * the web, Hoy and the phone.
 */
import type { DayPart } from "../../types";
import { addDays, isoWeekday, localTime } from "../dates";
import { type DoseEvent, type DoseMoment, type FullSchedule, isDueOn, type Med, type TrainingSlot, toMinutes } from "./schedule";
import type { DoseSlot } from "./store-types";

export const MOMENT_TITLE: Record<Exclude<DoseMoment, "hora">, string> = {
  entreno: "Después de entrenar",
  desayuno: "Con el desayuno",
  comida: "Con la comida",
  cena: "Con la cena",
  dormir: "Antes de dormir",
  manana: "En la mañana",
  tarde: "En la tarde",
  noche: "En la noche",
  dia: "Cualquier hora",
};

const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];
const PART_PHRASE: Record<DayPart, string> = { manana: "en la mañana", tarde: "en la tarde", noche: "en la noche" };
const MEAL_PHRASE = { desayuno: "con el desayuno", comida: "con la comida", cena: "con la cena" } as const;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (items: string[]) => new Intl.ListFormat("es", { type: "conjunction" }).format(items);
const fmtDate = (date: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/** A logged slot key as words: "las 09:00", "después de entrenar", "con el desayuno"… */
export function slotLabel(key: string): string {
  return key in MOMENT_TITLE ? lower(MOMENT_TITLE[key as keyof typeof MOMENT_TITLE]) : `las ${key}`;
}

export function frequencyLine(s: Pick<FullSchedule, "days" | "interval" | "monthDay">): string | null {
  const days = s.days.length === 1 ? WEEKDAY_NAMES[s.days[0]! - 1]! : s.days.map((d) => DAY_LETTERS[d - 1]).join(" ");
  if (s.monthDay) return `Cada mes · día ${s.monthDay}`;
  if (s.interval?.unit === "day") return `Cada ${s.interval.every} días`;
  if (s.interval) return `Cada ${s.interval.every} semanas · ${days}`;
  if (s.days.length === 1) return `Semanal · ${days}`;
  return s.days.length ? days : null;
}

/** A schedule in one line: "L X V · 08:00 y 20:00", "Semanal · jueves · cualquier hora". */
export function scheduleLine(s: FullSchedule): string {
  if (s.asNeeded) return "Cuando haga falta";
  const parts: string[] = [];
  if (s.training) parts.push(`después de entrenar · ${s.training.restDayTime ? `días sin entreno ${s.training.restDayTime}` : "solo días de entreno"}`);
  if (s.meals.length) parts.push(`con ${list(s.meals.map((m) => ({ desayuno: "el desayuno", comida: "la comida", cena: "la cena" })[m]))}`);
  if (s.times.length) parts.push(list(s.times));
  if (s.windows.length) parts.push(list(s.windows.map((w) => lower(MOMENT_TITLE[w.part]))));
  if (s.bedtime) parts.push("antes de dormir");
  if (s.anyTime) parts.push("cualquier hora");
  const frequency = frequencyLine(s);
  if (frequency) parts.unshift(frequency);
  return upper(parts.join(" · "));
}

/** The whole schedule in one line, for the editor's read-back. */
export function readBack(s: FullSchedule): string {
  if (s.asNeeded) return "Cuando haga falta · sin horario ni avisos";
  const parts = [frequencyLine(s) ?? "Cada día"];
  if (s.times.length) parts.push(`a las ${list(s.times)}`);
  if (s.windows.length) parts.push(list(s.windows.map((w) => `${PART_PHRASE[w.part]}, ${w.start}–${w.end}`)));
  if (s.anyTime) {
    parts.push("cuando quieras");
    if (s.reminder) parts.push(`aviso ${s.reminder} si no la tomaste`);
  }
  if (s.training) {
    parts.push(`después de entrenar, dentro de ${s.training.withinMinutes} min`);
    parts.push(s.training.restDayTime ? `sin entreno, a las ${s.training.restDayTime}` : "sin entreno, no");
  }
  if (s.meals.length) parts.push(list(s.meals.map((m) => MEAL_PHRASE[m])));
  if (s.bedtime) parts.push("antes de dormir");
  return parts.join(" · ");
}

const COUNT_UNITS: Record<string, string> = { comprimido: "comprimidos", cápsula: "cápsulas", gomita: "gomitas", sobre: "sobres", cazo: "cazos", scoop: "scoops", gota: "gotas" };
const SINGULAR = Object.fromEntries(Object.entries(COUNT_UNITS).map(([one, many]) => [many, one]));

/** The unit agreeing with the amount: 1 cápsula, 2 cápsulas. */
export function unitFor(dose: number, unit: string): string {
  if (dose === 1) return SINGULAR[unit] ?? unit;
  return COUNT_UNITS[unit] ?? unit;
}

export const amountLabel = (dose: number, unit: string) => `${dose.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${unitFor(dose, unit)}`;

export function trainingLine(t: TrainingSlot, now: string): string {
  switch (t.state) {
    case "trained":
      return now > t.until! ? `Terminaste a las ${t.workoutEnd} · era antes de las ${t.until}` : `Terminaste a las ${t.workoutEnd} · tómala antes de las ${t.until}`;
    case "training":
      return "Entrenando…";
    case "planned":
      return `Al terminar tu sesión de las ${t.plannedAt}`;
    case "rest":
      return `Hoy descansas · ${t.fallback}`;
  }
}

/** Where a dose stands today. */
export type TodayState = "tomada" | "omitida" | "ahora" | "atrasada" | "pendiente" | "entreno" | "dia" | "a-demanda" | "no-toca";

export type TodayItem = {
  key: string;
  medication: Med;
  state: TodayState;
  /** "HH:MM" it sits at on the day: when taken, else when due. */
  at: string | null;
  /** "A las 09:00", "Con la comida · 14:00", "Después de entrenar", "Cuando haga falta". */
  when: string;
  /** "Tomada a las 09:56", "Toca ahora", "Se pasó hace 2 h"… */
  line: string;
  slot: DoseSlot | null;
  /** Intakes logged today outside a slot (as-needed or extra), newest first. */
  intakes: DoseEvent[];
};

export const isLeft = (item: TodayItem) => item.state === "ahora" || item.state === "atrasada" || item.state === "pendiente" || item.state === "entreno" || item.state === "dia";

/** A dose still to take, in a few words: "ahora", "a las 21:00", "era a las 09:00"… */
export function leftLabel(item: TodayItem): string {
  const window = item.slot?.window;
  if (item.state === "dia") return "cuando quieras";
  if (window) return item.state === "ahora" ? `hasta las ${window.end}` : lower(MOMENT_TITLE[window.part]);
  if (item.state === "entreno") return "al terminar de entrenar";
  if (item.state === "atrasada") return `era a las ${item.at}`;
  return item.state === "ahora" ? "ahora" : `a las ${item.at}`;
}

const DUE_NOW_MINUTES = 60;
export const ANY_TIME_LINE = "Hoy toca · cuando quieras";
const range = (w: { start: string; end: string }) => `${w.start}–${w.end}`;
const fmtGap = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes % 60 === 0 || minutes >= 180 ? `${Math.round(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);

function slotWhen(slot: DoseSlot): string {
  if (slot.moment === "hora") return `A las ${slot.slot}`;
  if (slot.moment === "dia") return "Cualquier hora";
  if (slot.window) return `${MOMENT_TITLE[slot.moment as DayPart]} · ${range(slot.window)}`;
  if (slot.moment === "entreno") return slot.training?.state === "rest" ? `Hoy descansas · ${slot.time}` : MOMENT_TITLE.entreno;
  return `${MOMENT_TITLE[slot.moment]} · ${slot.time}`;
}

function slotState(slot: DoseSlot, now: string, tz: string): { state: TodayState; line: string } {
  if (slot.status === "tomada") return { state: "tomada", line: slot.takenAt ? `Tomada a las ${localTime(slot.takenAt, tz)}` : "Tomada" };
  if (slot.status === "omitida") return { state: "omitida", line: "Omitida" };
  if (slot.moment === "dia") return { state: "dia", line: slot.status === "pospuesta" ? "Pospuesta · hoy, cuando quieras" : ANY_TIME_LINE };
  if (slot.window) {
    const { start, end } = slot.window;
    if (now < start) return { state: "pendiente", line: slot.status === "pospuesta" ? "Pospuesta" : `Desde las ${start}` };
    return now <= end ? { state: "ahora", line: `Cuando quieras hasta las ${end}` } : { state: "atrasada", line: `Era ${lower(MOMENT_TITLE[slot.moment as DayPart])} · aún estás a tiempo hoy` };
  }
  const t = slot.training;
  if (slot.time === null) return { state: "entreno", line: t ? trainingLine(t, now) : "Esperando" };
  if (t?.state === "trained") return { state: now <= t.until! ? "ahora" : "atrasada", line: trainingLine(t, now) };
  if (slot.time > now) return { state: "pendiente", line: slot.status === "pospuesta" ? "Pospuesta" : `En ${fmtGap(toMinutes(slot.time) - toMinutes(now))}` };
  const late = toMinutes(now) - toMinutes(slot.time);
  return late <= DUE_NOW_MINUTES ? { state: "ahora", line: "Toca ahora" } : { state: "atrasada", line: `Se pasó hace ${fmtGap(late)}` };
}

function offLine(med: Med, date: string): string {
  const { schedule } = med;
  if (date < med.startDate) return `Empieza el ${fmtDate(med.startDate)}`;
  if (!isDueOn(schedule, date)) {
    const next = Array.from({ length: 366 }, (_, i) => addDays(date, i + 1)).find((d) => isDueOn(schedule, d) && !(med.endDate && d > med.endDate));
    if (!next) return "Hoy no toca";
    if (next === addDays(date, 1)) return "Toca mañana";
    return next < addDays(date, 7) ? `Toca el ${WEEKDAY_NAMES[isoWeekday(next) - 1]}` : `Toca el ${fmtDate(next)}`;
  }
  if (schedule.training && schedule.training.restDayTime === null) return "Hoy descansas · solo los días de entreno";
  return "Hoy no toca";
}

function lastLabel(last: string, today: string): string {
  if (last === addDays(today, -1)) return "ayer";
  if (last > addDays(today, -7)) return `el ${WEEKDAY_NAMES[isoWeekday(last) - 1]}`;
  return `el ${fmtDate(last)}`;
}

const ORDER: Record<TodayState, number> = { tomada: 0, omitida: 0, ahora: 0, atrasada: 0, pendiente: 0, entreno: 1, dia: 1, "a-demanda": 2, "no-toca": 3 };

/**
 * Today as one list: every slot of every active med, intakes logged outside a
 * slot, each as-needed med once, and scheduled meds with nothing today.
 * `lastTaken`: the newest date each as-needed med was taken before today.
 */
export function todayItems(meds: Med[], slots: DoseSlot[], loose: DoseEvent[], date: string, now: string, tz: string, lastTaken: Map<string, string> = new Map()): TodayItem[] {
  const items: TodayItem[] = [];
  const clock = (ms: number) => localTime(ms, tz);
  for (const med of meds) {
    if (!med.active) continue;
    const intakes = loose.filter((e) => e.medicationId === med.id && e.status === "tomada").sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0));
    const at = intakes[0]?.takenAt ? clock(intakes[0].takenAt) : null;
    if (med.schedule.asNeeded) {
      const last = lastTaken.get(med.id);
      const line = intakes.length === 0 ? (last ? `Última ${lastLabel(last, date)}` : "Ninguna hoy") : intakes.length === 1 ? `Tomada a las ${at}` : `${intakes.length} hoy · última a las ${at}`;
      items.push({ key: med.id, medication: med, state: "a-demanda", at, when: "Cuando haga falta", line, slot: null, intakes });
      continue;
    }
    const own = slots.filter((s) => s.medicationId === med.id);
    for (const slot of own) {
      const { state, line } = slotState(slot, now, tz);
      items.push({ key: `${med.id}|${slot.slot}`, medication: med, state, at: slot.takenAt ? clock(slot.takenAt) : slot.time, when: slotWhen(slot), line, slot, intakes: [] });
    }
    for (const e of intakes) {
      items.push({ key: e.id, medication: med, state: "tomada", at: clock(e.takenAt!), when: "Fuera de horario", line: `Tomada a las ${clock(e.takenAt!)}`, slot: null, intakes: [e] });
    }
    if (own.length === 0 && intakes.length === 0 && !(med.endDate && date > med.endDate)) {
      items.push({ key: med.id, medication: med, state: "no-toca", at: null, when: scheduleLine(med.schedule), line: offLine(med, date), slot: null, intakes: [] });
    }
  }
  const rank = (i: TodayItem) => (i.state === "a-demanda" && i.at ? 0 : ORDER[i.state]);
  return items.sort((a, b) => rank(a) - rank(b) || (a.at ?? "99").localeCompare(b.at ?? "99") || a.medication.name.localeCompare(b.medication.name));
}
