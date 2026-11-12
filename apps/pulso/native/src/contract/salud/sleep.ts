/**
 * Sleep (Pulso's Sueño): HealthKit nights scored against the person's target,
 * and nights logged by hand. Ported from `@pulso/contract` `sleep.ts` as zod
 * with the same type names. Times epoch ms, durations whole minutes.
 *
 * Two kinds of operations: the Coach's tools (same names and answers as in
 * Pulso) and what the iPhone's Sueño called under `/api/mobile/sleep/*`.
 */
import { z } from "zod";
import { op } from "./operation";

/** HealthKit sleep stages. `asleep` is "asleep, unspecified" (sources without stages). */
export const SleepStage = z.enum(["inBed", "awake", "core", "deep", "rem", "asleep"]);
export type SleepStage = z.infer<typeof SleepStage>;

/**
 * Which kind of device wrote a sample. The engine prefers `watch` when sources overlap.
 * `manual` is a night the person logged by hand; the phone never sends it.
 */
export const SleepSourceKind = z.enum(["watch", "phone", "other", "manual"]);
export type SleepSourceKind = z.infer<typeof SleepSourceKind>;

/** One HealthKit sleep sample as the phone sends it. Times are epoch ms. */
export const SleepSegmentInput = z.object({
  start: z.number(),
  end: z.number(),
  stage: SleepStage,
  /** Source name (e.g. "Apple Watch de Facundo"). */
  source: z.string(),
  sourceKind: SleepSourceKind,
  /** Local UTC offset in minutes at `start` (e.g. -180 for UTC−3). */
  tzOffsetMin: z.number(),
});
export type SleepSegmentInput = z.infer<typeof SleepSegmentInput>;

export const SleepSegment = z.object({ start: z.number(), end: z.number(), stage: SleepStage });
export type SleepSegment = z.infer<typeof SleepSegment>;

export const SleepScoreFactor = z.object({
  key: z.enum(["duration", "efficiency", "restoration", "consistency"]),
  /** Spanish label for the UI. */
  label: z.string(),
  points: z.number(),
  maxPoints: z.number(),
  /** Spanish one-liner, e.g. "7 h 20 min de 8 h". */
  detail: z.string(),
});
export type SleepScoreFactor = z.infer<typeof SleepScoreFactor>;

export const SleepScore = z.object({
  /** 0–100. */
  value: z.number(),
  factors: z.array(SleepScoreFactor),
  /** Spanish one-line explanation of the score. */
  explanation: z.string(),
});
export type SleepScore = z.infer<typeof SleepScore>;

/** One night, from the preferred source. Minutes are whole minutes; times epoch ms. */
export const SleepNight = z.object({
  /** Local date of waking up, YYYY-MM-DD. */
  night: z.string(),
  source: z.string(),
  sourceKind: SleepSourceKind,
  tzOffsetMin: z.number(),
  inBedStart: z.number(),
  inBedEnd: z.number(),
  asleepStart: z.number(),
  asleepEnd: z.number(),
  minutes: z.object({ inBed: z.number(), asleep: z.number(), awake: z.number(), core: z.number(), deep: z.number(), rem: z.number(), unspecified: z.number() }),
  /** asleep / in bed, 0–1. */
  efficiency: z.number(),
  /** Share of asleep time per stage, 0–1. Null when the source has no stages. */
  stagePct: z.object({ core: z.number(), deep: z.number(), rem: z.number() }).nullable(),
  /** Minutes from local midnight of `night`; negative = the evening before (23:00 → -60). */
  bedtimeMin: z.number(),
  wakeMin: z.number(),
  score: SleepScore,
  /** Spanish insights comparing this night with the 14 before it. */
  insights: z.array(z.string()),
  segments: z.array(SleepSegment),
  /** Set when the night was logged by hand (`sourceKind` "manual"): one asleep span, no stages, efficiency not measured. */
  manual: z.object({ id: z.string(), note: z.string().nullable() }).optional(),
});
export type SleepNight = z.infer<typeof SleepNight>;

/**
 * A night the person logged by hand because Health has none for it (the watch
 * was off). It belongs to the night it starts in, like HealthKit's, named after
 * the morning of waking. A measured night for the same date always wins: the
 * manual one is then kept but hidden.
 */
export const ManualSleepNight = z.object({
  id: z.string(),
  /** Local date of waking up, YYYY-MM-DD. */
  night: z.string(),
  /** Fell asleep, epoch ms. */
  start: z.number(),
  /** Woke up, epoch ms. */
  end: z.number(),
  tzOffsetMin: z.number(),
  note: z.string().nullable(),
  /** True while a measured night for the same date exists, so this one is not shown. */
  hidden: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ManualSleepNight = z.infer<typeof ManualSleepNight>;

/** `add_manual_sleep` and the web's Sueño. `tzOffsetMin` defaults to the Mac's. */
export const ManualSleepInput = z.object({ start: z.number(), end: z.number(), tzOffsetMin: z.number().optional(), note: z.string().nullable().optional() });
export type ManualSleepInput = z.infer<typeof ManualSleepInput>;

/** `update_manual_sleep`: any of the fields; a null note clears it. */
export const ManualSleepPatch = ManualSleepInput.partial();
export type ManualSleepPatch = z.infer<typeof ManualSleepPatch>;

export const SleepSummary = z.object({
  /** Nights included (most recent `days` with data). */
  nights: z.number(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  targetMin: z.number(),
  avgAsleepMin: z.number().nullable(),
  avgScore: z.number().nullable(),
  avgEfficiency: z.number().nullable(),
  /** Same axis as `SleepNight.bedtimeMin` / `wakeMin`. */
  avgBedtimeMin: z.number().nullable(),
  avgWakeMin: z.number().nullable(),
  bedtimeSdMin: z.number().nullable(),
  wakeSdMin: z.number().nullable(),
  /** Sleep Regularity Index-like, 0–100 (same sleep/wake state 24 h apart). Null with < 2 consecutive nights. */
  regularity: z.number().nullable(),
  /** max(0, Σ(target − asleep)) over the window, minutes. */
  debtMin: z.number(),
  insights: z.array(z.string()),
});
export type SleepSummary = z.infer<typeof SleepSummary>;

/** `get_sleep_overview`: nights newest first, plus the 14-night summary. */
export const SleepOverview = z.object({ targetMin: z.number(), nights: z.array(SleepNight), summary: SleepSummary });
export type SleepOverview = z.infer<typeof SleepOverview>;

/**
 * Pulso's sleep operations: its Coach tools at `/api/v1/salud/sleep/<operation>` (the engine runs those tools
 * for them, `salud/api/tools.ts`), then the iPhone's routes at Pulso's paths.
 */
export const sleepOperations = {
  get_sleep_nights: op({
    name: "get_sleep_nights",
    description: "Nights of sleep from–to (inclusive; a night is named after the local date they woke), newest first: in-bed and asleep start/end (epoch ms), minutes per stage, efficiency and stage shares (0–1), bedtimeMin/wakeMin (minutes from that date's local midnight, negative = the evening before), a 0–100 score with factors and a Spanish explanation, Spanish insights vs the previous 14 nights. A night logged by hand has sourceKind \"manual\", `manual` {id, note}, one asleep span, no stages.",
    access: "read",
    method: "GET",
    path: "/sleep/get_sleep_nights",
    input: z.object({ from: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")), to: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")), includeSegments: z.boolean().describe("The raw stage timeline.").default(false) }),
    output: z.unknown(),
  }),
  get_sleep_summary: op({
    name: "get_sleep_summary",
    description: "Sleep over the last `days` days with data: average minutes asleep, score (0–100), efficiency (0–1), bedtime/wake (minutes from local midnight, negative = before) with standard deviations, regularity (0–100, higher = more regular), sleep debt in minutes (Σ max(0, target − asleep)), the target, Spanish insights.",
    access: "read",
    method: "GET",
    path: "/sleep/get_sleep_summary",
    input: z.object({ days: z.int().min(2).max(60).default(14) }),
    output: z.unknown(),
  }),
  set_sleep_target: op({
    name: "set_sleep_target",
    description: "Set the nightly sleep target in hours (default 8); it drives sleep debt and the score's duration part. Only when the person asks.",
    access: "write",
    method: "POST",
    path: "/sleep/set_sleep_target",
    input: z.object({ hours: z.number().min(4).max(12) }),
    output: z.unknown(),
  }),
  log_sleep: op({
    name: "log_sleep",
    description: "Log a night Apple Health didn't record, by the person's local clock. A bedtime later than the wake time is the previous day (23:30 → 07:00). Must last 1–16 h, not in the future. Refused when Apple Health measured that night (it always counts) or one was already logged by hand (update_sleep_night). It then counts like any night (Sueño, Hoy, readiness, the brief). Returns the night with id and durationMin.",
    access: "write",
    method: "POST",
    path: "/sleep/log_sleep",
    input: z.object({ asleepTime: z.string().regex(new RegExp("^([01]?\\d|2[0-3]):([0-5]\\d)$")).describe("Fell asleep (or went to bed, if that's all they say)"), wakeTime: z.string().regex(new RegExp("^([01]?\\d|2[0-3]):([0-5]\\d)$")).describe("Omit when they woke just now; ask if unsaid and not now").optional(), wakeDate: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Only for a night other than last night").optional(), note: z.string().max(280).describe("Their words").optional() }),
    output: z.unknown(),
  }),
  update_sleep_night: op({
    name: "update_sleep_night",
    description: "Correct a night logged by hand, by id or night (the date they woke); Apple Health nights can't be edited. Give only what changes, times local 'HH:MM': a new wakeTime keeps the wake day, a new asleepTime is its last occurrence before waking, note replaces ('' clears). Limits as log_sleep.",
    access: "write",
    method: "POST",
    path: "/sleep/update_sleep_night",
    input: z.object({ id: z.string().optional(), night: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional(), asleepTime: z.string().regex(new RegExp("^([01]?\\d|2[0-3]):([0-5]\\d)$")).optional(), wakeTime: z.string().regex(new RegExp("^([01]?\\d|2[0-3]):([0-5]\\d)$")).optional(), note: z.string().max(280).optional() }),
    output: z.unknown(),
  }),
  delete_sleep_night: op({
    name: "delete_sleep_night",
    description: "Delete a night logged by hand, by id or night (the date they woke); Apple Health nights can't be deleted. Returns it.",
    access: "write",
    method: "POST",
    path: "/sleep/delete_sleep_night",
    input: z.object({ id: z.string().optional(), night: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional() }),
    output: z.unknown(),
  }),

  // ── What the iPhone's Sueño calls (Pulso's /api/mobile/sleep/*) ──
  get_sleep_overview: op({
    name: "get_sleep_overview",
    description:
      "The phone's Sueño, in full: the nightly target in minutes, the last 60 nights newest first (with their stage timelines) and the 14-night summary. Same fields as get_sleep_nights and get_sleep_summary, which are shorter for a model.",
    access: "read",
    method: "GET",
    path: "/sleep",
    input: z.object({}),
    output: SleepOverview,
  }),
  sync_sleep: op({
    name: "sync_sleep",
    description:
      "The iPhone's Apple Health sync of sleep samples (up to 20 000). Each (night, source) in the batch replaces what was stored for it, so re-syncing is harmless. Returns how many nights were touched. Not for logging by hand (add_manual_sleep, log_sleep).",
    access: "write",
    method: "POST",
    path: "/sleep",
    input: z.object({ segments: z.array(SleepSegmentInput).max(20_000) }),
    output: z.object({ nights: z.number() }),
    event: "sleep.synced",
  }),
  add_manual_sleep: op({
    name: "add_manual_sleep",
    description:
      "Logs a night by hand from epoch-ms start (fell asleep) and end (woke up), 1–16 h, not in the future; tzOffsetMin defaults to the Mac's. 409 when Apple Health measured that night (it always counts) or one was already logged by hand. For a model, log_sleep takes local clock times.",
    access: "write",
    method: "POST",
    path: "/sleep/manual",
    input: ManualSleepInput,
    output: ManualSleepNight,
    event: "sleep_night.created",
  }),
  update_manual_sleep: op({
    name: "update_manual_sleep",
    description: "Changes a night logged by hand: any of start, end (epoch ms), tzOffsetMin, note (null clears). Same limits as add_manual_sleep. Returns the updated night.",
    access: "write",
    method: "PATCH",
    path: "/sleep/manual/{id}",
    input: ManualSleepPatch.extend({ id: z.string() }),
    output: ManualSleepNight,
    event: "sleep_night.updated",
  }),
  delete_manual_sleep: op({
    name: "delete_manual_sleep",
    description: "Deletes a night logged by hand. Returns what it was.",
    access: "write",
    method: "DELETE",
    path: "/sleep/manual/{id}",
    input: z.object({ id: z.string() }),
    output: ManualSleepNight,
    event: "sleep_night.deleted",
  }),
  set_sleep_target_minutes: op({
    name: "set_sleep_target_minutes",
    description: "The phone's Sueño target: the nightly sleep target in minutes, 240–720. Same setting as set_sleep_target (hours).",
    access: "write",
    method: "PUT",
    path: "/sleep/target",
    input: z.object({ minutes: z.number().min(240).max(720) }),
    output: z.object({ targetMin: z.number() }),
    event: "sleep_target.updated",
  }),
};
