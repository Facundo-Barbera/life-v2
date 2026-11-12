/**
 * Medication (Pulso's Medicación): Pulso's `@pulso/contract` `medication.ts`
 * with the same type names, as zod where an operation answers with it.
 *
 * Two kinds of operations: the Coach's tools (compact, model-shaped answers,
 * same names as in Pulso) and what the iPhone called under
 * `/api/mobile/medication/*` (full objects, the names at the end).
 */
import { z } from "zod";
import { op } from "./operation";

/** Medication and supplements: what the person takes, when, and whether they took it. */

export const MedicationKind = z.enum(["medicamento", "suplemento"]);
export type MedicationKind = z.infer<typeof MedicationKind>;
export const DoseStatus = z.enum(["tomada", "omitida", "pospuesta"]);
export type DoseStatus = z.infer<typeof DoseStatus>;

/** Meals a dose can be tied to (their times come from the calendar's meal times). */
export const DoseMeal = z.enum(["desayuno", "comida", "cena"]);
export type DoseMeal = z.infer<typeof DoseMeal>;

/**
 * A dose tied to training. On a training day it is due when the workout ends
 * and should be taken within `withinMinutes`; on a day without training it is
 * due at `restDayTime`, or not at all when that is null ("No tomar").
 */
export const TrainingRule = z.object({
  withinMinutes: z.number(),
  restDayTime: z.string().nullable(),
});
export type TrainingRule = z.infer<typeof TrainingRule>;

/** Parts of the day a dose can be due in: "En la mañana", "En la tarde", "En la noche". */
export const DayPart = z.enum(["manana", "tarde", "noche"]);
export type DayPart = z.infer<typeof DayPart>;

/** A day-part window: due any time between `start` and `end` ("HH:MM", start < end). */
export const DoseWindow = z.object({ part: DayPart, start: z.string(), end: z.string() });
export type DoseWindow = z.infer<typeof DoseWindow>;

/** Default ranges of each day part, editable per schedule. */
export const DAY_PART_RANGES: Record<DayPart, { start: string; end: string }> = {
  manana: { start: "07:00", end: "12:00" },
  tarde: { start: "12:00", end: "19:00" },
  noche: { start: "19:00", end: "23:00" },
};

/** The gentle evening reminder an any-time dose gets unless the person picks another hour or none. */
export const DEFAULT_ANY_TIME_REMINDER = "19:00";

/**
 * Every N days, or every N weeks on `days`, counted from `start` ("YYYY-MM-DD").
 * With weeks, the week of `start` is a due week.
 */
export const ScheduleInterval = z.object({ every: z.number(), unit: z.enum(["day", "week"]), start: z.string() });
export type ScheduleInterval = z.infer<typeof ScheduleInterval>;

/**
 * When doses are due: a frequency (which days) plus a timing (when on those
 * days). Times are local "HH:MM". `asNeeded` meds have no slots and never count
 * against adherence.
 *
 * Frequency, one of:
 * - every day: `days` empty, no `interval`, no `monthDay`;
 * - some weekdays: `days` = ISO weekdays (1 = lunes … 7 = domingo);
 * - every N days, or every N weeks on `days`: `interval`;
 * - once a month: `monthDay` (past the month's end, its last day).
 *
 * Timing mixes any of: fixed clock `times`, day-part `windows`, `anyTime`
 * (one dose some time that day), or slots tied to a moment: after training,
 * with a meal, before bed.
 */
export const MedicationSchedule = z.object({
  asNeeded: z.boolean(),
  times: z.array(z.string()),
  days: z.array(z.number()),
  /** "Cada N días / semanas"; null otherwise. */
  interval: ScheduleInterval.nullable(),
  /** "Cada mes, el día N" (1–31); null otherwise. */
  monthDay: z.number().nullable(),
  /** "Después de entrenar"; null when not tied to training. */
  training: TrainingRule.nullable(),
  /** "Con una comida". */
  meals: z.array(DoseMeal),
  /** "Antes de dormir": 30 min before the calendar's sleep time. */
  bedtime: z.boolean(),
  /** "En la mañana / tarde / noche": one dose due within each window. */
  windows: z.array(DoseWindow),
  /** "Cualquier hora": one dose due all day, missed only once the day is over. */
  anyTime: z.boolean(),
  /** For an any-time dose, the hour of a gentle reminder if it is still pending; null for none. */
  reminder: z.string().nullable(),
});
export type MedicationSchedule = z.infer<typeof MedicationSchedule>;

/**
 * What callers send: everything beyond asNeeded/times/days is optional, so old
 * clients keep working. A missing `reminder` on an any-time schedule means the
 * default evening one; null turns it off. A missing `interval.start` is the
 * medication's start date.
 */
export type MedicationScheduleInput = Pick<MedicationSchedule, "asNeeded" | "times" | "days"> &
  Partial<Pick<MedicationSchedule, "training" | "meals" | "bedtime" | "monthDay" | "windows" | "anyTime" | "reminder">> & {
    interval?: (Omit<ScheduleInterval, "start"> & { start?: string }) | null;
  };

/** What a slot hangs on: a clock time, the end of a workout, a meal, bedtime, a part of the day or the whole day. */
export const DoseMoment = z.enum(["hora", "entreno", "desayuno", "comida", "cena", "dormir", "manana", "tarde", "noche", "dia"]);
export type DoseMoment = z.infer<typeof DoseMoment>;

export const Medication = z.object({
  id: z.string(),
  name: z.string(),
  kind: MedicationKind,
  /** Amount per intake, in `unit` (e.g. 500 mg, 2 comprimidos). */
  dose: z.number(),
  unit: z.string(),
  /** comprimido, cápsula, gotas, polvo… free text. */
  form: z.string().nullable(),
  /** con comida, en ayunas… free text. */
  instructions: z.string().nullable(),
  schedule: MedicationSchedule,
  /** Local dates "YYYY-MM-DD". */
  startDate: z.string(),
  endDate: z.string().nullable(),
  /** Doses left. One "tomada" uses one. Null when not tracked. */
  stock: z.number().nullable(),
  lowStockThreshold: z.number().nullable(),
  /** stock <= lowStockThreshold. */
  lowStock: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Medication = z.infer<typeof Medication>;

export type MedicationInput = {
  name: string;
  kind?: MedicationKind;
  dose: number;
  unit: string;
  form?: string | null;
  instructions?: string | null;
  schedule?: MedicationScheduleInput;
  startDate?: string;
  endDate?: string | null;
  stock?: number | null;
  lowStockThreshold?: number | null;
  active?: boolean;
  notes?: string | null;
};

export type MedicationPatch = Partial<MedicationInput>;

export const DoseEvent = z.object({
  id: z.string(),
  medicationId: z.string(),
  /** Local date of the slot, "YYYY-MM-DD". */
  date: z.string(),
  /** The slot's key (`DoseSlot.slot`): "HH:MM" or a moment like "entreno" or "dia"; null for an as-needed intake. */
  scheduledTime: z.string().nullable(),
  status: DoseStatus,
  /** Epoch ms, when status is "tomada". */
  takenAt: z.number().nullable(),
  loggedAt: z.number(),
});
export type DoseEvent = z.infer<typeof DoseEvent>;

export type DoseLogInput = {
  medicationId: string;
  date: string;
  /** The slot's key (`DoseSlot.slot`). Omit or null for as-needed. */
  scheduledTime?: string | null;
  status: DoseStatus;
  takenAt?: number | null;
};

/**
 * How a training-linked slot resolved. `trained`: a workout ended that day (a
 * Pulso session or a Health workout), due at its end. `training`: one is in
 * progress. `planned`: a calendar session is still ahead. `rest`: no workout
 * and none ahead, so the rest-day rule applies.
 */
export const TrainingSlot = z.object({
  state: z.enum(["trained", "training", "planned", "rest"]),
  /** "HH:MM" the workout ended (trained). */
  workoutEnd: z.string().nullable(),
  /** "HH:MM" by which to take it: workout end + withinMinutes (trained). */
  until: z.string().nullable(),
  /** "HH:MM" the planned session starts (planned). */
  plannedAt: z.string().nullable(),
  /**
   * While waiting (training, planned): when the rest-day rule takes over if no
   * workout happens, so a reminder can already be set. Null with "No tomar".
   */
  fallback: z.string().nullable(),
});
export type TrainingSlot = z.infer<typeof TrainingSlot>;

/** One expected dose on one day, with what happened to it. */
export const DoseSlot = z.object({
  medicationId: z.string(),
  name: z.string(),
  kind: MedicationKind,
  dose: z.number(),
  unit: z.string(),
  instructions: z.string().nullable(),
  date: z.string(),
  /**
   * The slot's key within the day, sent back as `scheduledTime` when logging:
   * "HH:MM" for a fixed time, else the moment ("entreno", "desayuno", "comida",
   * "cena", "dormir", "manana", "tarde", "noche", "dia"). A training slot keeps its key whether it ends up after a
   * workout or on the rest-day rule, so it is one dose a day either way.
   */
  slot: z.string(),
  moment: DoseMoment,
  /**
   * When it is due, "HH:MM": a window's start; null for an any-time slot ("dia")
   * and while waiting for a workout that is planned or in progress.
   */
  time: z.string().nullable(),
  training: TrainingSlot.nullable(),
  /** A day-part slot's window; null otherwise. */
  window: DoseWindow.nullable(),
  /**
   * When a reminder should fire if it is still pending, "HH:MM": the due time,
   * a window's start, an any-time slot's chosen hour, a training slot's
   * rest-day fallback while waiting; null for no reminder.
   */
  remindAt: z.string().nullable(),
  status: z.enum(["tomada", "omitida", "pospuesta", "pendiente"]),
  eventId: z.string().nullable(),
  takenAt: z.number().nullable(),
});
export type DoseSlot = z.infer<typeof DoseSlot>;

export const MedicationDay = z.object({
  date: z.string(),
  /** Sorted by time; any-time slots and slots still waiting for a workout go last. */
  slots: z.array(DoseSlot),
  /** As-needed intakes logged that day. */
  asNeeded: z.array(DoseEvent),
  /** First pending slot with a time at or after the given time (or a window still open), if any. */
  next: DoseSlot.nullable(),
});
export type MedicationDay = z.infer<typeof MedicationDay>;

/** Slots of the coming days, resolved, for planning reminders. */
export const MedicationUpcoming = z.object({ from: z.string(), slots: z.array(DoseSlot) });
export type MedicationUpcoming = z.infer<typeof MedicationUpcoming>;

export const AdherenceWindow = z.object({
  /** Slots already due in the window (any-time and day-part slots once their day is over, or when taken). */
  due: z.number(),
  taken: z.number(),
  /** taken / due, 0..1; null when nothing was due. */
  rate: z.number().nullable(),
});
export type AdherenceWindow = z.infer<typeof AdherenceWindow>;

export const MedicationAdherence = z.object({
  medicationId: z.string(),
  name: z.string(),
  last7: AdherenceWindow,
  last30: AdherenceWindow,
  /** Consecutive days with every due dose taken, ending today (a day still in progress does not break it). */
  currentStreak: z.number(),
  bestStreak: z.number(),
});
export type MedicationAdherence = z.infer<typeof MedicationAdherence>;

export const AdherenceDay = z.object({ date: z.string(), due: z.number(), taken: z.number() });
export type AdherenceDay = z.infer<typeof AdherenceDay>;

export const AdherenceReport = z.object({
  asOf: z.object({ date: z.string(), time: z.string() }),
  overall: z.object({ last7: AdherenceWindow, last30: AdherenceWindow, currentStreak: z.number(), bestStreak: z.number() }),
  medications: z.array(MedicationAdherence),
  /** Last 30 days, oldest first, for a heatmap. */
  days: z.array(AdherenceDay),
});
export type AdherenceReport = z.infer<typeof AdherenceReport>;

/**
 * A quiet suggestion to give an as-needed medication a schedule, because it is
 * logged like a regular one (or is a drug usually taken on a fixed rhythm).
 * Nothing changes until the person saves the prefilled editor.
 */
export const ScheduleNudge = z.object({
  medicationId: z.string(),
  name: z.string(),
  cadence: z.enum(["daily", "weekly"]),
  /** `known`: a drug usually taken on this rhythm; `pattern`: logged that way lately. */
  reason: z.enum(["known", "pattern"]),
  /** Ready to show: "Levotiroxina parece diaria. ¿Ponerle horario?" */
  title: z.string(),
  /** "En ayunas al despertar · 07:30", "Semanal · jueves · cualquier hora". */
  detail: z.string(),
  /** What the editor opens prefilled with. */
  schedule: MedicationSchedule,
  /** Prefilled «Cómo tomarlo» when the medication has none ("en ayunas"); null to leave it. */
  instructions: z.string().nullable(),
});
export type ScheduleNudge = z.infer<typeof ScheduleNudge>;

// The phone's inputs, shaped like Pulso's store schemas (`src/medication/store.ts`); the store parses them again (trims, defaults, windows' ranges).
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const date = z.string().regex(DATE, "expected YYYY-MM-DD");
const time = z.string().regex(TIME, "expected HH:MM (24h)");
const scheduleInput = z.object({
  asNeeded: z.boolean().default(false),
  times: z.array(time).max(24).default([]),
  days: z.array(z.int().min(1).max(7)).max(7).default([]),
  interval: z.object({ every: z.int().min(1).max(52), unit: z.enum(["day", "week"]), start: date.optional() }).nullable().default(null),
  monthDay: z.int().min(1).max(31).nullable().default(null),
  training: z.object({ withinMinutes: z.int().min(5).max(240).default(60), restDayTime: time.nullable().default(null) }).nullable().default(null),
  meals: z.array(DoseMeal).max(3).default([]),
  bedtime: z.boolean().default(false),
  /** start/end default to the part's range (DAY_PART_RANGES). */
  windows: z.array(z.object({ part: DayPart, start: time.optional(), end: time.optional() })).max(3).default([]),
  anyTime: z.boolean().default(false),
  /** Left out = the default evening reminder; null = none. */
  reminder: time.nullable().optional(),
});
const medicationFields = {
  name: z.string().min(1).max(80),
  kind: MedicationKind,
  dose: z.number().gt(0).max(100_000),
  unit: z.string().min(1).max(24),
  form: z.string().max(40).nullish(),
  instructions: z.string().max(200).nullish(),
  schedule: scheduleInput,
  startDate: date,
  endDate: date.nullable(),
  stock: z.number().min(0).max(100_000).nullable(),
  lowStockThreshold: z.number().min(0).max(100_000).nullable(),
  active: z.boolean(),
  notes: z.string().max(500).nullish(),
};
const medicationInput = z.object({
  ...medicationFields,
  kind: MedicationKind.optional(),
  schedule: scheduleInput.optional().describe("Omitted = as needed."),
  startDate: date.optional(),
  endDate: date.nullish(),
  stock: medicationFields.stock.optional(),
  lowStockThreshold: medicationFields.lowStockThreshold.optional(),
  active: z.boolean().optional(),
});
const medicationPatch = z.object(medicationFields).partial();
/** The phone's local clock; without it (or when malformed) the Mac's, as Pulso's `asOf`. */
const asOf = { date: z.string().optional().describe("Local YYYY-MM-DD; default the Mac's today."), time: z.string().optional().describe("Local HH:MM; default the Mac's now.") };
const PHONE_NOTE = "Track it exactly as the person describes; never recommend starting, stopping or changing a medication or dose. This is the person's private health data.";

/** Pulso's medication operations (its Coach tools), at `/api/v1/salud/medication/<operation>`; the engine runs those tools for them (`salud/api/tools.ts`). */
export const medicationOperations = {
  list_medications: op({
    name: "list_medications",
    description: "Medications and supplements: dose (amount + unit), form, instructions, schedule, dates, stock, lowStock. With today's dose slots and status (pendiente/tomada/omitida/pospuesta): slot (its key), moment, time ('HH:MM' due, a window's start; null for any-time and while a workout is pending), window, training.state (trained/training/planned/rest). Track it exactly as the person describes; never recommend starting, stopping or changing a medication or dose: interactions, side effects and dosing go to their doctor or pharmacist. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "read",
    method: "GET",
    path: "/medication/list_medications",
    input: z.object({ includeInactive: z.boolean().describe("Also paused ones.").default(false), includeToday: z.boolean().describe("Today's slots and the next pending dose.").default(true) }),
    output: z.unknown(),
  }),
  add_medication: op({
    name: "add_medication",
    description: "Add a medication or supplement the person takes, as they describe it. kind 'suplemento' for creatine, protein, vitamins, omega 3, magnesium… (units like g, scoop, cápsula, gomita). Omitting schedule = as needed; ask when they take it if they didn't say. schedule = which days + when. Days, one of: every day (days []); weekdays (days, ISO 1 = Monday … 7 = Sunday); interval { every, unit day|week, start (default startDate) }, weeks on `days` (default start's weekday); monthDay (the last day in shorter months). When, combinable: times (local 'HH:MM'); windows for 'en la mañana/tarde/noche' (default 07–12, 12–19, 19–23); anyTime = one dose due all day, missed only after it, reminded at `reminder` (default 19:00, null none); training = due when a workout ends, within withinMinutes, and at restDayTime on days without training (null = not then); meals (at that meal's planned time); bedtime (30 min before sleep). Never invent a clock time: use anyTime or a window. E.g. creatine after training, 09:00 on rest days = { training: { restDayTime: '09:00' } }; 'semaglutida los jueves, cuando sea' = { days: [4], anyTime: true }; 'vitamina D cada 2 semanas el domingo en la mañana' = { days: [7], interval: { every: 2, unit: 'week' }, windows: [{ part: 'manana' }] }. Slot keys: 'HH:MM', or entreno (even on rest days), desayuno, comida, cena, dormir, manana, tarde, noche, dia (any time). Dates local 'YYYY-MM-DD'. stock = doses left (each 'tomada' uses one); lowStockThreshold warns at or below it. Track it exactly as the person describes; never recommend starting, stopping or changing a medication or dose: interactions, side effects and dosing go to their doctor or pharmacist. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "write",
    method: "POST",
    path: "/medication/add_medication",
    input: z.object({ name: z.string().min(1).max(80), kind: z.enum(["medicamento","suplemento"]).default("medicamento"), dose: z.number().max(100000).gt(0), unit: z.string().min(1).max(24), form: z.string().max(40).nullable().optional(), instructions: z.string().max(200).nullable().optional(), schedule: z.object({ asNeeded: z.boolean().default(false), times: z.array(z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$"))).max(24).default([]), days: z.array(z.int().min(1).max(7)).max(7).default([]), interval: z.object({ every: z.int().min(1).max(52), unit: z.enum(["day","week"]), start: z.string().regex(new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")).optional() }).nullable().default(null), monthDay: z.int().min(1).max(31).nullable().default(null), training: z.object({ withinMinutes: z.int().min(5).max(240).default(60), restDayTime: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).nullable().default(null) }).nullable().default(null), meals: z.array(z.enum(["desayuno","comida","cena"])).max(3).default([]), bedtime: z.boolean().default(false), windows: z.array(z.object({ part: z.enum(["manana","tarde","noche"]), start: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).optional(), end: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).optional() })).max(3).optional(), anyTime: z.boolean().default(false), reminder: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).nullable().optional() }).optional(), startDate: z.string().regex(new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")).optional(), endDate: z.string().regex(new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")).nullable().optional(), stock: z.number().min(0).max(100000).nullable().optional(), lowStockThreshold: z.number().min(0).max(100000).nullable().optional(), active: z.boolean().default(true), notes: z.string().max(500).nullable().optional() }),
    output: z.unknown(),
  }),
  update_medication: op({
    name: "update_medication",
    description: "Change a medication by id, only the fields given: new times, a stock refill, instructions… active false pauses it; endDate finishes it, keeping its history. A schedule replaces the whole schedule, in add_medication's format. Track it exactly as the person describes; never recommend starting, stopping or changing a medication or dose: interactions, side effects and dosing go to their doctor or pharmacist. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "write",
    method: "POST",
    path: "/medication/update_medication",
    input: z.object({ id: z.string().describe("From list_medications."), name: z.string().min(1).max(80).optional(), kind: z.enum(["medicamento","suplemento"]).optional(), dose: z.number().max(100000).gt(0).optional(), unit: z.string().min(1).max(24).optional(), form: z.string().max(40).nullable().optional(), instructions: z.string().max(200).nullable().optional(), schedule: z.object({ asNeeded: z.boolean().default(false), times: z.array(z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$"))).max(24).default([]), days: z.array(z.int().min(1).max(7)).max(7).default([]), interval: z.object({ every: z.int().min(1).max(52), unit: z.enum(["day","week"]), start: z.string().regex(new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")).optional() }).nullable().default(null), monthDay: z.int().min(1).max(31).nullable().default(null), training: z.object({ withinMinutes: z.int().min(5).max(240).default(60), restDayTime: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).nullable().default(null) }).nullable().default(null), meals: z.array(z.enum(["desayuno","comida","cena"])).max(3).default([]), bedtime: z.boolean().default(false), windows: z.array(z.object({ part: z.enum(["manana","tarde","noche"]), start: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).optional(), end: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).optional() })).max(3).optional(), anyTime: z.boolean().default(false), reminder: z.string().regex(new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$")).nullable().optional() }).optional(), startDate: z.string().regex(new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")).optional(), endDate: z.string().regex(new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")).nullable().optional(), stock: z.number().min(0).max(100000).nullable().optional(), lowStockThreshold: z.number().min(0).max(100000).nullable().optional(), active: z.boolean().optional(), notes: z.string().max(500).nullable().optional() }),
    output: z.unknown(),
  }),
  log_dose: op({
    name: "log_dose",
    description: "Record a dose the person reports: tomada (taken, uses one from stock), omitida (skipped) or pospuesta (postponed). A scheduled dose: its slot's date and scheduledTime = list_medications' today.slots[].slot; re-logging a slot overwrites it. As-needed or extra: omit scheduledTime. Track it exactly as the person describes; never recommend starting, stopping or changing a medication or dose: interactions, side effects and dosing go to their doctor or pharmacist. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "write",
    method: "POST",
    path: "/medication/log_dose",
    input: z.object({ medicationId: z.string(), date: z.string().regex(new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$")).describe("Local date of the slot; default today.").optional(), scheduledTime: z.string().describe("Slot key: 'HH:MM' or entreno/desayuno/comida/cena/dormir/manana/tarde/noche/dia.").optional(), status: z.enum(["tomada","omitida","pospuesta"]), takenAt: z.number().gt(0).describe("Epoch ms; default now.").optional() }),
    output: z.unknown(),
  }),
  get_adherence: op({
    name: "get_adherence",
    description: "Adherence as of now, per medication and overall: due vs taken and rate (0..1) over 7 and 30 days, current and best streak of full days, a 30-day daily series. Any-time and window doses count as missed only after their day; as-needed ones never count. Track it exactly as the person describes; never recommend starting, stopping or changing a medication or dose: interactions, side effects and dosing go to their doctor or pharmacist. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "read",
    method: "GET",
    path: "/medication/get_adherence",
    input: z.object({ includeLog: z.boolean().describe("Also the dose log of the last 30 days.").default(false) }),
    output: z.unknown(),
  }),

  // ── What the iPhone's Medicación (and Pulso's web, for the DELETEs) calls: Pulso's /api/mobile/medication/* ──
  // Events are `medication.<operation>`, as the Coach tools' writes publish them.
  get_medications: op({
    name: "get_medications",
    description: `The phone's medication cabinet: every active medication and supplement in full (all=true adds the paused ones), each with its whole schedule, stock and lowStock. Without today's slots: get_medication_day has them. For a model, list_medications is shorter. ${PHONE_NOTE}`,
    access: "read",
    method: "GET",
    path: "/medication",
    input: z.object({ all: z.boolean().default(false).describe("Also paused ones.") }),
    output: z.object({ medications: z.array(Medication) }),
  }),
  create_medication: op({
    name: "create_medication",
    description: `Add a medication or supplement from the phone's editor; returns it in full. The schedule is add_medication's (omitted = as needed). ${PHONE_NOTE}`,
    access: "write",
    method: "POST",
    path: "/medication",
    input: medicationInput,
    output: Medication,
    event: "medication.create_medication",
  }),
  edit_medication: op({
    name: "edit_medication",
    description: `Change a medication by id, only the fields given (a schedule replaces the whole schedule); returns it in full. Giving an as-needed medication a schedule moves today's intakes onto today's first open slots. ${PHONE_NOTE}`,
    access: "write",
    method: "PATCH",
    path: "/medication/{id}",
    input: medicationPatch.extend({ id: z.string() }),
    output: Medication,
    event: "medication.edit_medication",
  }),
  delete_medication: op({
    name: "delete_medication",
    description: `Delete a medication and its whole dose history. To stop one and keep its history, set an endDate or active false instead (edit_medication). ${PHONE_NOTE}`,
    access: "write",
    method: "DELETE",
    path: "/medication/{id}",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), deleted: z.string() }),
    event: "medication.delete_medication",
  }),
  get_adherence_report: op({
    name: "get_adherence_report",
    description: `The phone's adherence as of the given local date and time: per medication and overall, due vs taken and rate (0..1) over 7 and 30 days, current and best streak, and a 30-day daily series for a heatmap. ${PHONE_NOTE}`,
    access: "read",
    method: "GET",
    path: "/medication/adherence",
    input: z.object(asOf),
    output: AdherenceReport,
  }),
  get_medication_day: op({
    name: "get_medication_day",
    description: `One day's doses as of the given local time: every slot with its status (pendiente/tomada/omitida/pospuesta), resolved against that day's workouts, meals and bedtime; the as-needed intakes logged; and the next pending dose. ${PHONE_NOTE}`,
    access: "read",
    method: "GET",
    path: "/medication/today",
    input: z.object(asOf),
    output: MedicationDay,
  }),
  get_upcoming_doses: op({
    name: "get_upcoming_doses",
    description: `The next 7 days of dose slots from the given local date, resolved as of its time, with remindAt: what the phone schedules its reminders from. ${PHONE_NOTE}`,
    access: "read",
    method: "GET",
    path: "/medication/upcoming",
    input: z.object(asOf),
    output: MedicationUpcoming,
  }),
  list_schedule_nudges: op({
    name: "list_schedule_nudges",
    description: `Quiet suggestions to give an as-needed medication a schedule (it is logged on a rhythm, or is a drug usually taken on one), each with a ready title and the prefilled schedule. Nothing changes until the person saves it. ${PHONE_NOTE}`,
    access: "read",
    method: "GET",
    path: "/medication/nudges",
    input: z.object({ date: asOf.date }),
    output: z.object({ nudges: z.array(ScheduleNudge) }),
  }),
  list_doses: op({
    name: "list_doses",
    description: `The dose log between two local dates (inclusive), optionally for one medication, by date and slot. ${PHONE_NOTE}`,
    access: "read",
    method: "GET",
    path: "/medication/doses",
    input: z.object({ from: date, to: date, medicationId: z.string().optional() }),
    output: z.object({ doses: z.array(DoseEvent) }),
  }),
  record_dose: op({
    name: "record_dose",
    description: `Record a dose from the phone: tomada (uses one from stock), omitida or pospuesta, for a slot (date + scheduledTime = the slot's key; re-logging overwrites it) or, without scheduledTime, an as-needed or extra intake. Returns the logged event. ${PHONE_NOTE}`,
    access: "write",
    method: "POST",
    path: "/medication/doses",
    input: z.object({
      medicationId: z.string().min(1),
      date,
      scheduledTime: z.string().nullish().describe("Slot key: 'HH:MM' or entreno/desayuno/comida/cena/dormir/manana/tarde/noche/dia."),
      status: DoseStatus,
      takenAt: z.number().gt(0).nullish().describe("Epoch ms; default now."),
    }),
    output: DoseEvent,
    event: "medication.record_dose",
  }),
  undo_dose: op({
    name: "undo_dose",
    description: `Undo a logged dose by its event id: the slot is pending again and a taken dose goes back to stock. ${PHONE_NOTE}`,
    access: "write",
    method: "DELETE",
    path: "/medication/doses/{id}",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string(), undone: z.string() }),
    event: "medication.undo_dose",
  }),
};
