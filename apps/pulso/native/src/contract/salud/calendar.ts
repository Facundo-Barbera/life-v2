/**
 * Calendar: when the person is busy, when the Coach plans training and meals,
 * health events (injuries, illnesses), and one timeline that merges them with
 * everything else Salud records. Ported from `@pulso/contract` `calendar.ts`
 * as zod with the same type names, plus the validation of Pulso's
 * `src/calendar/store.ts` and `schedule.ts`. Dates are local "YYYY-MM-DD",
 * times local "HH:MM", datetimes local "YYYY-MM-DDTHH:MM" (the person's own clock, no zone).
 */
import { z } from "zod";
import { MEAL_SLOTS } from "./nutrition";
import { op } from "./operation";
import { Muscle } from "./training";

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Validation (Pulso's, shared by the store and the operations) ─────────────

const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
export const dateSchema = z.string().regex(DATE, "expected YYYY-MM-DD");
export const timeSchema = z.string().regex(TIME, "expected HH:MM (24h)");
const weekdays = z.array(z.number().int().min(1).max(7)).max(7);
const mealTime = z.object({ slot: z.enum(MEAL_SLOTS), time: timeSchema });

export const BusySource = z.enum(["manual", "coach", "apple_calendar"]);
export type BusySource = z.infer<typeof BusySource>;

const busyFields = {
  title: z.string().trim().min(1).max(120),
  allDay: z.boolean(),
  date: dateSchema,
  endDate: dateSchema.nullable(),
  start: timeSchema.nullable(),
  end: timeSchema.nullable(),
  weekdays,
  until: dateSchema.nullable(),
  source: BusySource,
  notes: optText(500),
};
export const busyInputSchema = z.object({
  ...busyFields,
  allDay: busyFields.allDay.optional(),
  endDate: busyFields.endDate.optional(),
  start: busyFields.start.optional(),
  end: busyFields.end.optional(),
  weekdays: weekdays.default([]),
  until: busyFields.until.optional(),
  source: busyFields.source.default("manual"),
});
export const busyPatchSchema = z.object(busyFields).partial();

export const BODY_AREAS = [
  "knee", "shoulder", "ankle", "wrist", "elbow", "hip", "general",
  "chest", "front_delts", "side_delts", "rear_delts", "traps", "upper_back", "lats", "lower_back", "biceps", "triceps",
  "forearms", "abs", "obliques", "glutes", "quads", "hamstrings", "adductors", "abductors", "calves", "neck",
] as const;

export const HealthEventKind = z.enum(["lesion", "enfermedad", "sintoma", "cirugia", "otro"]);
export type HealthEventKind = z.infer<typeof HealthEventKind>;
export const HealthEventStatus = z.enum(["activa", "recuperandose", "resuelta"]);
export type HealthEventStatus = z.infer<typeof HealthEventStatus>;
export const Joint = z.enum(["knee", "shoulder", "ankle", "wrist", "elbow", "hip"]);
export type Joint = z.infer<typeof Joint>;
/** A muscle from the body map, a joint, or the whole body (a cold, a fever). */
export const BodyArea = z.union([Muscle, Joint, z.literal("general")]);
export type BodyArea = z.infer<typeof BodyArea>;

const healthFields = {
  kind: HealthEventKind,
  title: z.string().trim().min(1).max(120),
  bodyArea: z.enum(BODY_AREAS).nullable(),
  severity: z.number().int().min(1).max(5),
  startDate: dateSchema,
  endDate: dateSchema.nullable(),
  status: HealthEventStatus,
  notes: optText(1000),
  affectedTraining: optText(300),
};
export const healthInputSchema = z.object({
  ...healthFields,
  bodyArea: healthFields.bodyArea.optional(),
  severity: healthFields.severity.default(2),
  endDate: healthFields.endDate.optional(),
  status: healthFields.status.optional(),
});
export const healthPatchSchema = z.object(healthFields).partial();

export const preferencesSchema = z
  .object({
    trainingTimes: z.array(timeSchema).max(6),
    sessionMinutes: z.number().int().min(15).max(240),
    restDays: weekdays,
    wakeTime: timeSchema,
    sleepTime: timeSchema,
    mealTimes: z.array(mealTime).max(MEAL_SLOTS.length),
  })
  .partial();
export const mealTimesSchema = z.array(mealTime).max(MEAL_SLOTS.length);

/** Busy times read from Apple Calendar on the phone (title + free/busy only). Replaces that source's blocks in [from, to]. */
export const appleCalendarSyncSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  events: z
    .array(
      z.object({
        externalId: z.string().min(1).max(300),
        title: z.string().trim().max(120).transform((t) => t || "Ocupado"),
        allDay: z.boolean(),
        date: dateSchema,
        endDate: dateSchema.nullish(),
        start: timeSchema.nullish(),
        end: timeSchema.nullish(),
      }),
    )
    .max(1000),
});

export const placementSchema = z.object({
  dayId: z.string().min(1),
  date: dateSchema,
  time: timeSchema,
  durationMin: z.number().int().min(15).max(240).optional(),
});

export const plannedPatchSchema = z.object({
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  durationMin: z.number().int().min(15).max(240).optional(),
  status: z.enum(["planned", "skipped"]).optional(),
  reason: z.string().trim().max(300).nullish(),
});

// ── Availability ─────────────────────────────────────────────────────────────

/**
 * A stretch when the person can't train. One-off: `date` (to `endDate` for a
 * multi-day trip). Weekly: `weekdays` (ISO, 1 = lunes … 7 = domingo) from
 * `date` until `until`. Timed blocks have `start`/`end`; all-day blocks don't.
 */
export const BusyBlock = z.object({
  id: z.string(),
  title: z.string(),
  allDay: z.boolean(),
  date: z.string(),
  endDate: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  weekdays: z.array(z.number()),
  until: z.string().nullable(),
  source: BusySource,
  notes: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type BusyBlock = z.infer<typeof BusyBlock>;
export type BusyBlockInput = z.input<typeof busyInputSchema>;
export type BusyBlockPatch = Partial<BusyBlockInput>;
export type AppleCalendarSync = z.input<typeof appleCalendarSyncSchema>;

export const MealTime = mealTime;
export type MealTime = z.infer<typeof MealTime>;

export const CalendarPreferences = z.object({
  /** Preferred session start times, best first. Empty: anywhere between wake and sleep. */
  trainingTimes: z.array(z.string()),
  sessionMinutes: z.number(),
  /** ISO weekdays never to train on. */
  restDays: z.array(z.number()),
  wakeTime: z.string(),
  sleepTime: z.string(),
  /** Default meal times; `set_meal_times` can override single dates. */
  mealTimes: z.array(MealTime),
});
export type CalendarPreferences = z.infer<typeof CalendarPreferences>;

// ── Planned schedule ─────────────────────────────────────────────────────────

/**
 * `done`: a logged session did it; `missed`: its date passed without one;
 * `moved`: still ahead, moved from `movedFrom`. Only planned/skipped are stored.
 */
export const PlannedStatus = z.enum(["planned", "done", "skipped", "moved", "missed"]);
export type PlannedStatus = z.infer<typeof PlannedStatus>;

/** A dated training session (an instance of a program day), as the calendar shows it. `id` is the instance id. */
export const PlannedSession = z.object({
  id: z.string(),
  programId: z.string().nullable(),
  /** The program day (template) it is a session of. */
  dayId: z.string().nullable(),
  name: z.string(),
  date: z.string(),
  /** Null when no free time was found that day. */
  time: z.string().nullable(),
  durationMin: z.number(),
  status: PlannedStatus,
  /** Why it is here (Coach's words, or the auto re-plan's). */
  reason: z.string().nullable(),
  /** Set when a busy block or health event now clashes with it and nothing could move it. */
  conflict: z.string().nullable(),
  /** Earlier date when it was moved. */
  movedFrom: z.string().nullable(),
  /** The logged training session that fulfilled it. */
  sessionId: z.string().nullable(),
  /** The block week it belongs to. */
  week: z.number().optional(),
  /** It has its own exercise list for that date (edit_session_instance). */
  edited: z.boolean().optional(),
});
export type PlannedSession = z.infer<typeof PlannedSession>;

export type PlannedSessionPatch = { date?: string; time?: string; durationMin?: number; status?: "planned" | "skipped"; reason?: string | null };

/** What happened to planned sessions after availability or health changed. */
export const Replan = z.object({
  moved: z.array(z.object({ id: z.string(), name: z.string(), from: z.string(), to: z.string(), time: z.string() })),
  /** Still clashing: no free day nearby. The Coach should decide. */
  unresolved: z.array(z.object({ id: z.string(), name: z.string(), date: z.string(), conflict: z.string() })),
});
export type Replan = z.infer<typeof Replan>;

export const PlanWeekResult = z.object({
  from: z.string(),
  to: z.string(),
  sessions: z.array(PlannedSession),
  /** Program days not placed, and why. */
  unplaced: z.array(z.object({ dayId: z.string(), name: z.string(), reason: z.string() })),
  /** Placed, but touch an active injury: which exercises and why. */
  warnings: z.array(z.object({ dayId: z.string(), name: z.string(), message: z.string() })),
});
export type PlanWeekResult = z.infer<typeof PlanWeekResult>;

// ── Health events ────────────────────────────────────────────────────────────

export const HealthEvent = z.object({
  id: z.string(),
  kind: HealthEventKind,
  title: z.string(),
  bodyArea: BodyArea.nullable(),
  /** 1 (mild) … 5 (severe). */
  severity: z.number(),
  startDate: z.string(),
  /** Null while ongoing. */
  endDate: z.string().nullable(),
  status: HealthEventStatus,
  notes: z.string().nullable(),
  /** How it limits training, in the person's words: "evitar sentadilla". */
  affectedTraining: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type HealthEvent = z.infer<typeof HealthEvent>;
export type HealthEventInput = z.input<typeof healthInputSchema>;
export type HealthEventPatch = Partial<HealthEventInput>;

// ── Timeline ─────────────────────────────────────────────────────────────────

export const CalendarItemKind = z.enum(["training", "workout", "meal", "meal_time", "dose", "sleep", "busy", "health", "body_scan"]);
export type CalendarItemKind = z.infer<typeof CalendarItemKind>;

/** Where tapping the item goes: an app tab ("hoy", "entreno", "dieta", "cuerpo") or the calendar itself. */
export const CalendarLink = z.object({ tab: z.enum(["hoy", "entreno", "dieta", "cuerpo", "calendario"]), id: z.string().nullable() });
export type CalendarLink = z.infer<typeof CalendarLink>;

export const CalendarItem = z.object({
  /** Unique within a response. */
  id: z.string(),
  kind: CalendarItemKind,
  title: z.string(),
  subtitle: z.string().nullable(),
  /** The day it is listed under. */
  date: z.string(),
  /** Local datetimes; null for all-day items. `end` may fall on the next day (sleep). */
  start: z.string().nullable(),
  end: z.string().nullable(),
  allDay: z.boolean(),
  /** Colour key for the client. */
  color: z.enum(["training", "workout", "nutrition", "medication", "sleep", "busy", "health", "body"]),
  /** Kind-specific state: PlannedStatus, DoseStatus, HealthEventStatus, BusySource. */
  status: z.string().nullable(),
  link: CalendarLink,
});
export type CalendarItem = z.infer<typeof CalendarItem>;

export const CalendarRange = z.object({ from: z.string(), to: z.string(), items: z.array(CalendarItem) });
export type CalendarRange = z.infer<typeof CalendarRange>;

// ── Operations ───────────────────────────────────────────────────────────────

const FORMATS = "Local dates 'YYYY-MM-DD', times 'HH:MM' 24 h, ISO weekdays (1 = Monday).";
const REPLAN =
  "Then upcoming planned sessions are re-checked: a clashing one moves to the nearest free slot (same day, then ±1–3 days), in `replan.moved`; one that can't move stays with a conflict in `replan.unresolved`.";
const HEALTH_BOUNDARY =
  "Record it in their words; never diagnose, name a likely condition or suggest treatment. Sharp, worsening or post-injury pain: tell them to see a professional.";
const AREAS = "bodyArea 'general' = the whole body (a cold, fever, surgery).";

const id = z.string();

export const calendarOperations = {
  get_calendar: op({
    name: "get_calendar",
    description:
      `The calendar for [from, to] (at most ~4 months): one timeline of planned and logged training (planned/moved/done/skipped/missed, conflicts), Health workouts, meals and meal times, medication doses, sleep, busy blocks, health events and body scans; ` +
      `plus busy block definitions (ids), active health events and scheduling preferences. ${FORMATS}`,
    access: "read",
    method: "GET",
    path: "/calendar/overview",
    input: z.object({ from: dateSchema.optional().describe("Default today."), to: dateSchema.optional().describe("Inclusive; default from + 6.") }),
    output: CalendarRange.extend({ busyBlocks: z.array(BusyBlock), activeHealthEvents: z.array(HealthEvent), preferences: CalendarPreferences }),
  }),
  get_calendar_timeline: op({
    name: "get_calendar_timeline",
    description: "The phone's Calendario: every feature's items for [from, to] (both required, at most 125 days) on one timeline. get_calendar adds the busy blocks, active health events and preferences.",
    access: "read",
    method: "GET",
    path: "/calendar",
    input: z.object({ from: dateSchema, to: dateSchema }),
    output: CalendarRange,
  }),
  get_calendar_preferences: op({
    name: "get_calendar_preferences",
    description: "When they like to train and their day: trainingTimes (session starts, best first), sessionMinutes, restDays, wakeTime, sleepTime, default mealTimes.",
    access: "read",
    method: "GET",
    path: "/calendar/preferences",
    input: z.object({}),
    output: CalendarPreferences,
  }),
  set_availability: op({
    name: "set_availability",
    description: `Save when they like to train and their day ("entreno por la tarde", "los domingos descanso"): trainingTimes (session starts, best first), sessionMinutes, restDays (weekdays never trained), wakeTime and sleepTime (sessions fit between), mealTimes (defaults). Only the fields given change. ${FORMATS} ${REPLAN}`,
    access: "write",
    method: "PUT",
    path: "/calendar/preferences",
    input: preferencesSchema,
    output: z.object({ preferences: CalendarPreferences, replan: Replan }),
    event: "calendar_preferences.updated",
  }),
  list_busy_blocks: op({
    name: "list_busy_blocks",
    description: "Busy block definitions (ids, one-off or weekly), those overlapping [from, to] when given; the timeline has their occurrences.",
    access: "read",
    method: "GET",
    path: "/calendar/busy",
    input: z.object({ from: dateSchema.optional(), to: dateSchema.optional() }),
    output: z.object({ blocks: z.array(BusyBlock) }),
  }),
  add_busy_block: op({
    name: "add_busy_block",
    description: `Record time they're busy and can't train (a meeting, shift, trip). One-off: date (to endDate for several days); weekly: weekdays (+ until). start and end for a timed block; neither (or allDay) for the whole day. source: "coach" when you add it (the default), "manual" from the phone. ${FORMATS} ${REPLAN}`,
    access: "write",
    method: "POST",
    path: "/calendar/busy",
    input: busyInputSchema.extend({ source: BusySource.default("coach") }),
    output: z.object({ block: BusyBlock, replan: Replan }),
    event: "busy_block.created",
  }),
  update_busy_block: op({
    name: "update_busy_block",
    description: `Change a busy block by id (get_calendar's busyBlocks), only the fields given. ${FORMATS} ${REPLAN}`,
    access: "write",
    method: "PATCH",
    path: "/calendar/busy/{id}",
    input: z.object({ id, ...busyPatchSchema.shape }),
    output: z.object({ block: BusyBlock, replan: Replan }),
    event: "busy_block.updated",
  }),
  remove_busy_block: op({
    name: "remove_busy_block",
    description: `Delete a busy block by id (get_calendar's busyBlocks); returns it. Sessions it moved stay where they are. ${REPLAN}`,
    access: "write",
    method: "DELETE",
    path: "/calendar/busy/{id}",
    input: z.object({ id }),
    output: z.object({ removed: BusyBlock, replan: Replan }),
    event: "busy_block.deleted",
  }),
  sync_apple_calendar: op({
    name: "sync_apple_calendar",
    description:
      "The iPhone's Apple Calendar sync: busy times read on the phone (title and free/busy only, up to 1000), replacing that source's blocks in [from, to]. Returns how many were written and the re-plan. Not for adding a block by hand.",
    access: "write",
    method: "POST",
    path: "/calendar/busy/apple",
    input: appleCalendarSyncSchema,
    output: z.object({ written: z.number(), replan: Replan }),
    event: "busy_block.synced",
  }),
  list_health_events: op({
    name: "list_health_events",
    description: `Injuries, illnesses, symptoms and surgeries: active first, then history (newest first), with kind, bodyArea, severity 1–5, dates, status, notes, affectedTraining. ${HEALTH_BOUNDARY}`,
    access: "read",
    method: "GET",
    path: "/calendar/health",
    input: z.object({
      activeOnly: z.boolean().default(false).describe("Only unresolved ones."),
      from: dateSchema.optional().describe("Only events overlapping [from, to]."),
      to: dateSchema.optional(),
    }),
    output: z.array(HealthEvent),
  }),
  add_health_event: op({
    name: "add_health_event",
    description:
      `Record an injury, illness, symptom or surgery, for the history and so training respects it. ${AREAS} severity 1 (mild) … 5 (severe) as they describe it. startDate when it began (ask or estimate); no endDate while ongoing. ` +
      `status defaults to activa (resuelta if it ended in the past). affectedTraining: how it limits training, their words ("nada de impacto"). ` +
      `An active illness or surgery of severity ≥ 3 takes training days off the plan; an active injury ≥ 4 keeps the days loading that area off; milder ones only warn. ` +
      `${HEALTH_BOUNDARY} ${FORMATS} ${REPLAN}`,
    access: "write",
    method: "POST",
    path: "/calendar/health",
    input: healthInputSchema,
    output: z.object({ event: HealthEvent, replan: Replan }),
    event: "health_event.created",
  }),
  update_health_event: op({
    name: "update_health_event",
    description: `Update a health event by id, only the fields given: severity, healing (recuperandose) or over (resuelta; without endDate it ends today). ${HEALTH_BOUNDARY} ${REPLAN}`,
    access: "write",
    method: "PATCH",
    path: "/calendar/health/{id}",
    input: z.object({ id: z.string().describe("From list_health_events."), ...healthPatchSchema.shape }),
    output: z.object({ event: HealthEvent, replan: Replan }),
    event: "health_event.updated",
  }),
  delete_health_event: op({
    name: "delete_health_event",
    description: `Delete a health event recorded by mistake (one that happened is updated to resuelta instead). ${REPLAN}`,
    access: "write",
    method: "DELETE",
    path: "/calendar/health/{id}",
    input: z.object({ id }),
    output: z.object({ removed: HealthEvent, replan: Replan }),
    event: "health_event.deleted",
  }),
  list_planned_sessions: op({
    name: "list_planned_sessions",
    description: "The dated training sessions (instances of program days) in [from, to] (both required, at most 125 days): id, dayId (template), date, time, duration, week, status (planned/done/skipped/moved/missed), edited (own exercise list), reason, conflict.",
    access: "read",
    method: "GET",
    path: "/calendar/plan",
    input: z.object({ from: dateSchema, to: dateSchema }),
    output: z.object({ sessions: z.array(PlannedSession) }),
  }),
  plan_training_week: op({
    name: "plan_training_week",
    description:
      `Place the active program's days on the 7 days from \`from\` with start times, around busy blocks, rest days, sleep/wake times and active health events: each placed day's pending session of that week moves there (made when missing; its own exercise list stays); days already done this ISO week are left out. ` +
      `Without placements it decides: pinned days stay on their weekday, the rest spread out avoiding back-to-back days; with them (e.g. one placement «Torso B hoy 18:00»), only those move, and a pending session that was on a placed date takes the moved one's old slot; clashes come back as warnings. Entreno's Hoy and Siguiente follow the dated sessions. ` +
      `Returns the sessions, the days it couldn't place and why, and warnings for injuries the plan touches (adapt those exercises). ${FORMATS}`,
    access: "write",
    method: "POST",
    path: "/calendar/plan",
    input: z.object({
      from: dateSchema.optional().describe("Default today."),
      placements: z.array(placementSchema).max(14).optional().describe("Your own, by program day id."),
      reason: z.string().trim().max(300).optional().describe("One line, shown with each session."),
    }),
    output: PlanWeekResult,
    event: "training_plan.updated",
  }),
  update_planned_session: op({
    name: "update_planned_session",
    description: `Move, re-time or skip one dated session by id (get_calendar items 'plan:<id>', plan_training_week, get_active_program sessions); a missed one moved to today or later is pending again. A new date marks it moved. Add a short reason. ${FORMATS}`,
    access: "write",
    method: "PATCH",
    path: "/calendar/plan/{id}",
    input: z.object({
      id,
      date: dateSchema.optional(),
      time: z.string().optional(),
      durationMin: z.number().int().min(15).max(240).optional(),
      status: z.enum(["planned", "skipped"]).optional(),
      reason: z.string().max(300).nullish(),
    }),
    output: PlannedSession,
    event: "training_plan.updated",
  }),
  set_meal_times: op({
    name: "set_meal_times",
    description: `Set meal times: the default for every day, or with dates an override for just those days (an empty list clears it). Fit them around training: a meal 2–3 h before a session, protein within a few hours after. ${FORMATS}`,
    access: "write",
    method: "PUT",
    path: "/calendar/meal-times",
    input: z.object({ mealTimes: mealTimesSchema, dates: z.array(dateSchema).max(62).optional() }),
    output: z.union([z.object({ byDate: z.record(z.string(), z.array(MealTime)) }), z.object({ preferences: CalendarPreferences })]),
    event: "calendar_preferences.updated",
  }),
};
