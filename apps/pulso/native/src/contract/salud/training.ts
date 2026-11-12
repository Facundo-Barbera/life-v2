/**
 * Training (Pulso's Entreno): exercise library, programs the Coach writes,
 * logged strength sessions, the session in progress. Ported from
 * `@pulso/contract` `training.ts` as zod with the same type names, plus the
 * input shapes of Pulso's `src/training/inputs.ts`. Weights are kg, times epoch ms.
 *
 * Two kinds of operations: the Coach's tools (compact, model-shaped answers,
 * same names as in Pulso) and what the iPhone's Entreno called under
 * `/api/mobile/training/*` (full objects, the names below).
 */
import { z } from "zod";
import { op } from "./operation";
import { JoinCandidate, SessionRecording } from "./workouts-types";

const MUSCLE_GROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "core", "full_body", "cardio"] as const;
/** Cardio blocks (treadmill, bike…): their primary "muscle" is the heart. */
export const MuscleGroup = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof MuscleGroup>;

export const equipmentEnum = z.enum(["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band"]);
export const Equipment = equipmentEnum;
export type Equipment = z.infer<typeof Equipment>;

/** Strength exercises are compound or isolation; cardio is timed, not counted in sets. */
export const ExerciseKind = z.enum(["compound", "isolation", "cardio"]);
export type ExerciseKind = z.infer<typeof ExerciseKind>;

/** What kind of cardio a cardio exercise is; the phone maps it to a Salud workout type. */
export const CardioModality = z.enum(["treadmill", "elliptical", "bike", "rower", "stairs", "run", "walk", "jump_rope", "hiit"]);
export type CardioModality = z.infer<typeof CardioModality>;

/**
 * Demonstration media on list rows (`list_exercise_library`, program
 * exercises): same URLs as `ExerciseMedia`. Absent or null without media.
 */
export const ListMedia = z.object({ thumbnail: z.string().nullable().optional(), animation: z.string().nullable().optional() });
export type ListMedia = z.infer<typeof ListMedia>;

export const Exercise = z.object({
  /** Stable slug, e.g. `press-banca`. */
  id: z.string(),
  /** Spanish display name. */
  name: z.string(),
  muscle: MuscleGroup,
  secondary: z.array(MuscleGroup),
  equipment: Equipment,
  kind: ExerciseKind,
  /** Only on cardio exercises. */
  modality: CardioModality.nullable().optional(),
  ...ListMedia.shape,
});
export type Exercise = z.infer<typeof Exercise>;

// ── Cardio ───────────────────────────────────────────────────────────────────

/** Heart-rate zone: 1 recovery, 2 aerobic base, 3 tempo, 4 threshold, 5 maximum. */
export const HrZone = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type HrZone = z.infer<typeof HrZone>;

/** A zone's band in beats per minute, from the person's max (and resting, when known) heart rate. */
export const HrZoneRange = z.object({ zone: HrZone, minBpm: z.number(), maxBpm: z.number() });
export type HrZoneRange = z.infer<typeof HrZoneRange>;

/** Work/recovery repeats, e.g. 8 × 30 s rápido / 90 s suave. */
export const CardioIntervals = z.object({
  rounds: z.number(),
  workSeconds: z.number(),
  restSeconds: z.number(),
  /** Spanish cue for the work part, e.g. "Rápido", "Sprint". */
  workLabel: z.string().nullable().optional(),
  /** Spanish cue for the recovery part, e.g. "Suave". */
  restLabel: z.string().nullable().optional(),
});
export type CardioIntervals = z.infer<typeof CardioIntervals>;

/**
 * What a cardio block asks for. Every field is optional; most blocks set a
 * duration and a zone. With `intervals`, the duration is the intervals' total
 * (plus any warm-up the notes mention).
 */
export const CardioTarget = z.object({
  durationMinutes: z.number().nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  /** Treadmill or bike speed, km/h. */
  speedKmh: z.number().nullable().optional(),
  /** Running pace, minutes per km (5.5 = 5:30/km). */
  paceMinPerKm: z.number().nullable().optional(),
  /** Treadmill incline, %. */
  inclinePercent: z.number().nullable().optional(),
  /** Machine resistance or level (elliptical, bike, stairs). */
  level: z.number().nullable().optional(),
  zone: HrZone.nullable().optional(),
  intervals: CardioIntervals.nullable().optional(),
});
export type CardioTarget = z.infer<typeof CardioTarget>;

/** What was done in a cardio block, logged when it ends. */
export const CardioLog = z.object({
  exerciseId: z.string(),
  durationSeconds: z.number(),
  distanceKm: z.number().nullable(),
  level: z.number().nullable(),
  inclinePercent: z.number().nullable(),
  avgHr: z.number().nullable(),
  kcal: z.number().nullable(),
  doneAt: z.number(),
  /** Read only: the Health workout whose minutes, distance, kcal or heart rate filled what this log left empty. */
  recordedBy: z.string().nullable().optional(),
});
export type CardioLog = z.infer<typeof CardioLog>;

// ── Programs ─────────────────────────────────────────────────────────────────

/**
 * How an exercise progresses from session to session (null = "double" for
 * strength, "cardio" for cardio). "double": reps to the top of the range,
 * then more load. "reps_sets": reps to the top, then one more set up to
 * `maxSets`, then more load back at the prescribed sets. "load_fixed": the
 * load stays; only reps rise. "cardio": `stepMinutes` more each week up to
 * `maxMinutes`, then intensity (incline, level or speed) rises instead.
 */
export const ProgressionType = z.enum(["double", "reps_sets", "load_fixed", "cardio"]);
export type ProgressionType = z.infer<typeof ProgressionType>;

export const Progression = z.object({
  type: ProgressionType,
  maxSets: z.number().int().min(1).max(10).nullish().describe("reps_sets: sets before load rises (default prescribed + 2)."),
  maxMinutes: z.number().int().min(5).max(240).nullish().describe("cardio: minutes before intensity rises (default prescribed + 15)."),
  stepMinutes: z.number().int().min(1).max(30).nullish().describe("cardio: minutes added a week (default 5)."),
});
export type Progression = z.infer<typeof Progression>;

/**
 * One planned change for a week of a block, on top of each exercise's own
 * prescription: `setsDelta` sets more (or fewer) and/or a `rirTarget`, for
 * every strength exercise, those of one `muscle` (primary) or one `exerciseId`.
 * Deload weeks ignore it: the deload rule wins.
 */
export const WeekPlanEntry = z.object({
  week: z.number().int().min(1).max(52),
  setsDelta: z.number().int().min(-3).max(3).nullish(),
  rirTarget: z.number().int().min(0).max(5).nullish(),
  muscle: MuscleGroup.nullish().describe("Only exercises with this primary muscle."),
  exerciseId: z.string().nullish().describe("Only this library exercise."),
  note: z.string().max(120).nullish().describe('Spanish, shown on the week, e.g. "Más volumen en pierna".'),
});
export type WeekPlanEntry = z.infer<typeof WeekPlanEntry>;

/** A program exercise's own prescription, kept beside this week's when the plan changes it (weekPlan, deload, cardio progression). */
export const WeekPrescription = z.object({
  /** The program's own values, as written and as edits keep them. */
  sets: z.number(),
  targetRir: z.number().nullable(),
  cardio: CardioTarget.nullable().optional(),
});

/**
 * One exercise as prescribed inside a program day. Cardio blocks have `kind`
 * "cardio" and a `cardio` target; their sets/reps are 1 and rest 0.
 */
export const ProgramExercise = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseName: z.string(),
  equipment: Equipment,
  kind: ExerciseKind,
  modality: CardioModality.nullable().optional(),
  sets: z.number(),
  repMin: z.number(),
  repMax: z.number(),
  targetRpe: z.number().nullable(),
  targetRir: z.number().nullable(),
  restSeconds: z.number(),
  notes: z.string().nullable(),
  cardio: CardioTarget.nullable(),
  /** A load the person set by hand, kg. It is the suggestion until the exercise is next logged; then double progression takes over again. Null = suggest as usual. */
  weightKg: z.number().nullable().optional(),
  /** Exercises of a day sharing a non-null `supersetId` form one superset, done alternating (A, B, rest, A, B, rest…). Members are always consecutive and at least two; cardio is never in one. Null = a plain exercise. */
  supersetId: z.string().nullable(),
  progression: Progression.nullable().optional(),
  /** Set when this week's plan changed sets, RIR or the cardio target: these are the program's own values, the fields above are this week's. */
  base: WeekPrescription.nullable().optional(),
  ...ListMedia.shape,
});
export type ProgramExercise = z.infer<typeof ProgramExercise>;

export const ProgramDay = z.object({
  id: z.string(),
  name: z.string(),
  focus: z.string().nullable(),
  /** ISO weekday, 1 = Monday … 7 = Sunday, when the day is pinned to one. */
  weekday: z.number().nullable(),
  exercises: z.array(ProgramExercise),
  /** True when `exercises` are this week's session's own list (edited for that date only, "solo esta vez"), not the program's. */
  overridden: z.boolean().optional(),
});
export type ProgramDay = z.infer<typeof ProgramDay>;

// ── Sessions by date ─────────────────────────────────────────────────────────

/**
 * "done": a logged session is linked to it; "skipped": set aside; "missed": its
 * date passed without one (derived, and it stays missed until moved);
 * "planned": still ahead.
 */
export const InstanceStatus = z.enum(["planned", "done", "skipped", "missed"]);
export type InstanceStatus = z.infer<typeof InstanceStatus>;

/**
 * One dated session of a block (an occurrence of a program day, its template).
 * The engine makes each week's on first read; the Coach moves, re-templates or
 * edits them one by one. Without its own list (`edited` false) it is the
 * template as that week prescribes it; edited, it keeps its own exercises even
 * when the template changes.
 */
export const SessionInstance = z.object({
  id: z.string(),
  programId: z.string(),
  /** The program day it is a session of; null when that day was deleted. */
  templateDayId: z.string().nullable(),
  name: z.string(),
  /** Local "YYYY-MM-DD". */
  date: z.string(),
  /** Local "HH:MM"; null when no free time was found that day. */
  time: z.string().nullable(),
  durationMin: z.number().nullable(),
  /** The block week it belongs to (1-based). */
  week: z.number(),
  status: InstanceStatus,
  /** Has its own exercise list for that date. */
  edited: z.boolean(),
  reason: z.string().nullable(),
  conflict: z.string().nullable(),
  /** The date it was first planned on, when it moved. */
  movedFrom: z.string().nullable(),
  /** The logged session that did it. */
  sessionId: z.string().nullable(),
});
export type SessionInstance = z.infer<typeof SessionInstance>;

export const Program = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  weeks: z.number(),
  notes: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.number(),
  days: z.array(ProgramDay),
  /** Planned deload weeks; null on programs written before they were stored (the notes decide, e.g. "semana 6: descarga"). */
  deloadWeeks: z.array(z.number()).nullable().optional(),
  weekPlan: z.array(WeekPlanEntry).optional(),
  /** The week of the block the days' prescriptions are for, when the program is the active one. */
  week: z.number().optional(),
});
export type Program = z.infer<typeof Program>;

// ── Inputs (Pulso's src/training/inputs.ts) ──────────────────────────────────

export const weightUnitEnum = z.enum(["kg", "lb"]);

export const cardioTargetShape = z.object({
  durationMinutes: z.number().min(1).max(240).nullish().describe("The usual target."),
  distanceKm: z.number().min(0.1).max(100).nullish(),
  speedKmh: z.number().min(1).max(40).nullish(),
  paceMinPerKm: z.number().min(2).max(20).nullish().describe("5.5 = 5:30/km"),
  inclinePercent: z.number().min(0).max(30).nullish(),
  level: z.number().min(1).max(30).nullish().describe("Machine resistance."),
  zone: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullish().describe("Heart-rate zone: 1 recovery, 2 aerobic, 3 tempo, 4 threshold, 5 max."),
  intervals: z
    .object({
      rounds: z.number().int().min(1).max(50),
      workSeconds: z.number().int().min(5).max(1800),
      restSeconds: z.number().int().min(0).max(1800),
      workLabel: z.string().max(30).nullish().describe('Spanish cue, e.g. "Rápido".'),
      restLabel: z.string().max(30).nullish().describe("Spanish cue."),
    })
    .nullish()
    .describe("e.g. 8 × 30 s / 90 s."),
});

/** A superset label; the engine clears it when the members aren't 2+ consecutive strength exercises. */
export const supersetIdShape = z.string().max(32).nullish();

/** One prescribed exercise or cardio block. */
export const programExerciseShape = z.object({
  exerciseId: z.string().describe("Library id (list_exercises), e.g. `press-banca`."),
  sets: z.number().int().min(1).max(10).optional().describe("Strength only."),
  repMin: z.number().int().min(1).max(50).optional().describe("Strength only."),
  repMax: z.number().int().min(1).max(50).optional().describe("Reaching it on every set raises the load."),
  targetRpe: z.number().min(5).max(10).nullish().describe("10 = failure."),
  targetRir: z.number().int().min(0).max(5).nullish(),
  restSeconds: z.number().int().min(0).max(600).optional().describe("After each set (strength)."),
  notes: z.string().max(300).nullish().describe("Cue shown to the person, in Spanish."),
  cardio: cardioTargetShape.nullish().describe("Required for cardio exercises."),
  weightKg: z.number().min(0).max(1000).nullish().describe("A load the person chose; omit to let progression suggest it."),
  supersetId: supersetIdShape.describe(
    'Same label (e.g. "a") on 2+ consecutive strength exercises = a superset: one set of each in turn, rest after the last. A lone, separated or cardio member loses it.',
  ),
  progression: Progression.nullish().describe('How it progresses; omit for "double" (strength) or "cardio" (cardio). Isolations: "reps_sets".'),
});

export const programDayShape = z.object({
  name: z.string().min(1).max(60).describe('Spanish, e.g. "Torso A".'),
  focus: z.string().max(120).nullish().describe('Spanish, e.g. "Empuje pesado".'),
  weekday: z.number().int().min(1).max(7).nullish().describe("Pin to an ISO weekday (1 = Monday); omit to rotate."),
  exercises: z.array(programExerciseShape).min(1).max(15),
});

export const programShape = {
  name: z.string().min(1).max(80).describe("In Spanish."),
  goal: z.string().min(1).max(300).describe("In Spanish."),
  weeks: z.number().int().min(1).max(52),
  notes: z.string().max(1000).nullish().describe("Anything the person should know (emphasis, why); deloads and week changes go in deloadWeeks and weekPlan."),
  deloadWeeks: z
    .array(z.number().int().min(1).max(52))
    .max(12)
    .nullish()
    .describe("Planned deload weeks: half the sets, RIR 3–4, same loads. Omit for the last week when weeks ≥ 4; [] for none."),
  weekPlan: z.array(WeekPlanEntry).max(60).nullish().describe('Per-week changes, e.g. { week: 3, setsDelta: 1, muscle: "quads" } or { week: 4, rirTarget: 1 }.'),
  days: z.array(programDayShape).min(1).max(7).describe("In rotation order."),
  reason: z.string().max(200).nullish().describe('Why the current block ends, in Spanish ("Cambio a CrossFit").'),
};

/**
 * An optional reading (RPE, heart rate, distance…): one out of range or not a
 * number is dropped rather than refusing the whole workout it came with.
 */
const reading = (min: number, max: number) =>
  z
    .number()
    .nullish()
    .transform((v) => (v != null && Number.isFinite(v) && v >= min && v <= max ? v : null));

const cardioLogInput = z.object({
  exerciseId: z.string(),
  durationSeconds: z.number().min(0).max(86_400),
  distanceKm: reading(0, 500),
  level: reading(0, 100),
  inclinePercent: reading(0, 50),
  avgHr: reading(20, 250),
  kcal: reading(0, 10_000),
  doneAt: z.number().finite(),
});

/** A set's segments, top first (`SetSegments`); the flat weightKg/reps still win for the top. */
const segmentsInput = z
  .array(z.object({ weightKg: z.number().min(0).max(1000), reps: z.number().int().min(0).max(200) }))
  .max(10)
  .optional();

/** A finished session as the phone posts it. Times epoch ms, weight kg. `id` is client-made, so retries upsert. */
export const sessionInput = z.object({
  id: z.string().min(1).max(64),
  programId: z.string().nullish(),
  dayId: z.string().nullish(),
  instanceId: z.string().max(64).nullish(),
  name: z.string().min(1).max(80),
  startedAt: z.number().finite(),
  endedAt: z.number().finite(),
  notes: z.string().max(1000).nullish(),
  sets: z
    .array(
      z.object({
        exerciseId: z.string(),
        setIndex: z.number().int().min(0),
        weightKg: z.number().min(0).max(1000),
        reps: z.number().int().min(0).max(200),
        rpe: reading(1, 10),
        doneAt: z.number().finite(),
        segments: segmentsInput,
      }),
    )
    .max(300),
  cardio: z.array(cardioLogInput).max(20).optional(),
});

const liveSetInput = z.object({
  id: z.string().min(1).max(64),
  weightKg: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(200),
  repsChosen: z.boolean().optional(),
  rpe: reading(1, 10),
  doneAt: z.number().finite().nullable(),
  segments: segmentsInput,
});

/** The phone's copy of the session in progress (`LiveSession`). */
export const liveSessionShape = z.object({
  id: z.string().min(1).max(64),
  programId: z.string().nullish().transform((v) => v ?? null),
  dayId: z.string().nullish().transform((v) => v ?? null),
  instanceId: z.string().max(64).nullish().transform((v) => v ?? null),
  name: z.string().min(1).max(80),
  startedAt: z.number().finite(),
  exercises: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        exerciseId: z.string(),
        name: z.string().max(120),
        equipment: equipmentEnum,
        kind: ExerciseKind,
        modality: CardioModality.nullish().catch(null).transform((v) => v ?? null),
        repMin: z.number().int().min(0).max(100),
        repMax: z.number().int().min(0).max(100),
        targetRpe: z.number().nullish().transform((v) => v ?? null),
        targetRir: z.number().nullish().transform((v) => v ?? null),
        restSeconds: z.number().int().min(0).max(3600),
        notes: z.string().max(1000).nullish().transform((v) => v ?? null),
        hint: z.string().max(1000).nullish().transform((v) => v ?? null),
        sets: z.array(liveSetInput).max(30),
        cardio: cardioTargetShape.nullish().transform((v) => v ?? null),
        cardioLog: cardioLogInput.nullish().transform((v) => v ?? null),
        skipped: z.boolean().default(false),
        cutShort: z
          .object({ at: z.number().finite(), reason: z.string().max(200).nullish().transform((v) => v ?? null) })
          .nullish()
          .transform((v) => v ?? null),
        supersetId: supersetIdShape.transform((v) => v ?? null),
      }),
    )
    .max(40),
  focus: z.number().int().min(0).default(0),
  restStartedAt: z.number().finite().nullish().transform((v) => v ?? null),
  restEndsAt: z.number().finite().nullish().transform((v) => v ?? null),
  cardioClock: z
    .object({ exerciseId: z.string().min(1).max(64), runningSince: z.number().finite().nullable(), accumulatedSeconds: z.number().finite().min(0) })
    .nullish()
    .transform((v) => v ?? null),
  version: z.number().int().min(0).default(0),
  updatedAt: z.number().finite().default(0),
  threadId: z.string().nullish().transform((v) => v ?? null),
});
export const liveSessionInput = z.object({ session: liveSessionShape, baseVersion: z.number().int().min(0) });

/** Strength exercises need sets, reps and rest; cardio blocks need `cardio` and may omit them. */
export type ProgramExerciseInput = z.input<typeof programExerciseShape>;
export type ProgramDayInput = z.input<typeof programDayShape>;
export type ProgramInput = z.input<z.ZodObject<typeof programShape>>;

// ── Editing a day ────────────────────────────────────────────────────────────

/**
 * "today": only one dated session of that day (today's, else its next one this
 * week; or `instanceId`), which then keeps its own list. "always": the day's
 * template, for every session that has no list of its own.
 */
export const EditScope = z.enum(["today", "always"]);
export type EditScope = z.infer<typeof EditScope>;

/** One exercise of a day being rewritten. `id` keeps an existing `ProgramExercise` (and its load suggestion); omit it for a new one. */
export const dayExerciseShape = programExerciseShape.extend({ id: z.string().max(64).nullish().describe("Program exercise id to keep.") });
export type DayExerciseInput = z.input<typeof dayExerciseShape>;

/** The day's whole exercise list in its new order (reorder, add, remove, swap and edit targets in one write). */
export type DayEdit = { scope: EditScope; exercises: DayExerciseInput[] };

// ── Alternatives and preferences ─────────────────────────────────────────────

/** `score` is 0–100: muscle match dominates, then movement pattern, then the person's equipment preference. */
export const SimilarExercise = Exercise.extend({
  score: z.number(),
  /** Short Spanish reasons, e.g. ["Mismo músculo", "Mismo patrón", "Máquina"]. */
  reasons: z.array(z.string()),
  /** Its equipment is one the person prefers. */
  preferred: z.boolean(),
});
export type SimilarExercise = z.infer<typeof SimilarExercise>;

/** How a weight is shown and typed. Storage is always kg; a pound entry is kept as its exact kg (45 lb → 20.41165665 kg), so it reads 45 lb again. */
export const WeightUnit = weightUnitEnum;
export type WeightUnit = z.infer<typeof WeightUnit>;

export const TrainingSettings = z.object({
  /** Most preferred first, e.g. ["machine", "cable"]. Alternatives and programs favour these. Empty = no preference. */
  preferredEquipment: z.array(Equipment),
  /** Unit for exercises without their own, and for totals such as a session's volume. */
  defaultUnit: WeightUnit,
  /** Exercises (library id) whose machine or plates use their own unit. Missing = `defaultUnit`. */
  exerciseUnits: z.record(z.string(), WeightUnit),
});
export type TrainingSettings = z.infer<typeof TrainingSettings>;

/**
 * Next-load suggestion from double progression. `weightKg` is null without
 * history; otherwise it sits on the exercise's unit steps (a 5 lb step for a
 * pound machine), and `reason` speaks in that unit.
 */
export const LoadSuggestion = z.object({
  exerciseId: z.string(),
  weightKg: z.number().nullable(),
  reps: z.number(),
  reason: z.string(),
  lastSessionAt: z.number().nullable(),
  /** Sets for next time when progression changes them ("reps_sets" earns a set); absent = the prescribed sets. */
  sets: z.number().optional(),
  /** This week is a deload: the load holds and the sets are halved. */
  deload: z.boolean().optional(),
  /** Set on the suggestions of an adjusted session: what progression alone said. */
  normal: z.object({ weightKg: z.number().nullable(), reps: z.number() }).nullable().optional(),
});
export type LoadSuggestion = z.infer<typeof LoadSuggestion>;

// ── Reviewing the next session ───────────────────────────────────────────────

/**
 * Something the engine noticed before the next workout. The engine only
 * detects; the Coach reviews the session and decides (`SessionAdjustment`).
 */
export const AdjustmentSignalKind = z.enum(["inactivity", "exercise_gap", "readiness", "health_event", "block_switch", "missed_sessions"]);
export type AdjustmentSignalKind = z.infer<typeof AdjustmentSignalKind>;

export const AdjustmentSignal = z.object({
  kind: AdjustmentSignalKind,
  /** moderate | long | very_long | returning for breaks; low for readiness; the event's status for health. */
  level: z.string().nullable(),
  /** Days off, or days since the exercise was trained. */
  days: z.number().nullable(),
  /** The program exercise, for exercise_gap. */
  programExerciseId: z.string().nullable().optional(),
  /** One Spanish line: "Llevas 9 días sin entrenar (sueles descansar 2)". */
  detail: z.string(),
});
export type AdjustmentSignal = z.infer<typeof AdjustmentSignal>;

/**
 * One change to the upcoming session; the program stays as it is.
 * "adjust": `loadPercent` (−40…0, against what progression suggests), `sets`
 * (at most 2 fewer, never more) and/or `reps` (within the range).
 * "swap": `toExerciseId` instead, same kind. "skip": leave it out today.
 * "add": a cardio warm-up `toExerciseId` with its `cardio` target, done first.
 */
export const ExerciseChange = z.object({
  action: z.enum(["adjust", "swap", "skip", "add"]),
  /** The exercise changed; null for "add". */
  programExerciseId: z.string().nullable(),
  loadPercent: z.number().nullable().optional(),
  sets: z.number().nullable().optional(),
  reps: z.number().nullable().optional(),
  toExerciseId: z.string().nullable().optional(),
  cardio: CardioTarget.nullable().optional(),
});
export type ExerciseChange = z.infer<typeof ExerciseChange>;

/**
 * The Coach's decision about the next workout, made before the person opens
 * the app. "reviewing": the Coach is on it. "ready": decided — by the Coach,
 * or by the fixed fallback table when the Coach could not run (`decidedBy`).
 */
export const SessionAdjustment = z.object({
  id: z.string(),
  programId: z.string(),
  dayId: z.string(),
  status: z.enum(["reviewing", "ready"]),
  decidedBy: z.enum(["coach", "fallback"]).nullable(),
  /** The Coach looked and kept the plan. */
  noChange: z.boolean(),
  /** One calm Spanish sentence for the next-workout card. */
  rationale: z.string().nullable(),
  signals: z.array(AdjustmentSignal),
  changes: z.array(ExerciseChange),
  /** "Entrenar normal": the person set it aside for this session. */
  dismissed: z.boolean(),
  /** The asistente thread opened from "Ver por qué", once there is one. */
  threadId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SessionAdjustment = z.infer<typeof SessionAdjustment>;

/** The adjustment on the next day, with that day and its suggestions as they will be done. */
export const NextAdjustment = SessionAdjustment.extend({ day: ProgramDay, suggestions: z.record(z.string(), LoadSuggestion) });
export type NextAdjustment = z.infer<typeof NextAdjustment>;

// ── Blocks and weeks ─────────────────────────────────────────────────────────

/** "done": a session of that day falls in the week; "partial": under ¾ of the day's sets; "missed": the week is over without one; "planned": still ahead. */
export const WeekDayStatus = z.enum(["done", "partial", "missed", "planned"]);
export type WeekDayStatus = z.infer<typeof WeekDayStatus>;

/** A logged session as a week shows it. */
export const WeekSession = z.object({
  id: z.string(),
  dayId: z.string().nullable(),
  name: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  sets: z.number(),
  cardioMinutes: z.number(),
});
export type WeekSession = z.infer<typeof WeekSession>;

export const WeekDay = z.object({ dayId: z.string(), name: z.string(), status: WeekDayStatus, sessions: z.array(WeekSession) });
export type WeekDay = z.infer<typeof WeekDay>;

/**
 * One week of a block. Weeks are calendar weeks (Monday to Sunday, the Mac's
 * clock); week 1 is the week of the block's first session (the current week
 * until there is one). A week started early begins at that moment and runs to
 * the end of the following calendar week. `endsAt` is exclusive.
 */
export const ProgramWeek = z.object({
  number: z.number(),
  startsAt: z.number(),
  endsAt: z.number(),
  state: z.enum(["past", "current", "future"]),
  startedEarly: z.boolean(),
  deload: z.boolean(),
  /** The program notes' sentence about this week (a deload), when there is one. */
  note: z.string().nullable(),
  /** What this week changes against the program as written, one Spanish line each ("Descarga: la mitad de series, RIR 3–4"). */
  changes: z.array(z.string()).optional(),
  days: z.array(WeekDay),
  /** Days done (or partial) this week. */
  done: z.number(),
  /** Sessions in the week that are none of this block's days: another block's, or free ones. They still count. */
  other: z.array(WeekSession),
  /** The block's dated sessions that fall in the week, by date and time. */
  instances: z.array(SessionInstance).optional(),
});
export type ProgramWeek = z.infer<typeof ProgramWeek>;

/**
 * A program as a stretch of training. Creating or switching a program ends the
 * current block (`endedAt`, `endReason`) and starts the next; nothing is
 * deleted, and history, records and suggestions are per exercise, so they
 * carry across blocks.
 */
export const TrainingBlock = z.object({
  programId: z.string(),
  /** 1-based, oldest first. */
  number: z.number(),
  name: z.string(),
  goal: z.string(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  endReason: z.string().nullable(),
  active: z.boolean(),
  /** The block it resumes ("Retomar"), when it is a copy of an earlier one. */
  resumedFrom: z.string().nullable(),
  /** The program's days as written (no "solo hoy" changes): previews of other weeks. */
  days: z.array(ProgramDay),
  /** The week now (active), or the last one reached (ended). */
  currentWeek: z.number(),
  /** Every day of the current week is done. */
  weekComplete: z.boolean(),
  /** `start_next_week` may start the next week now. */
  canStartNextWeek: z.boolean(),
  /** Past its last week. */
  finished: z.boolean(),
  weeks: z.array(ProgramWeek),
});
export type TrainingBlock = z.infer<typeof TrainingBlock>;

// ── Reviewing a block ────────────────────────────────────────────────────────

/**
 * What the engine notices about the block as a whole (not the next session):
 * "stall" — an exercise without e1RM or rep progress over its last 3
 * exposures; "ready" — the top of the range on every set twice running at
 * the same load; "block_ending" — the last week ("last_week") or past it
 * ("finished"); "adherence_low" — under ⅔ of the planned sessions so far.
 */
export const BlockSignalKind = z.enum(["stall", "ready", "block_ending", "adherence_low"]);
export type BlockSignalKind = z.infer<typeof BlockSignalKind>;

export const BlockSignal = z.object({
  kind: BlockSignalKind,
  level: z.string().nullable(),
  exerciseId: z.string().nullable(),
  /** One Spanish line: "Press de banca: 3 sesiones sin subir". */
  detail: z.string(),
});
export type BlockSignal = z.infer<typeof BlockSignal>;

/** One side of a block diff: an exercise and its prescription, with why it changes. */
export const BlockDiffItem = z.object({
  exerciseId: z.string(),
  name: z.string(),
  /** Spanish: "3×8–12 · Torso A, Torso B" or "3×8–12 → 4×6–10". */
  detail: z.string(),
  why: z.string().nullable(),
});
export type BlockDiffItem = z.infer<typeof BlockDiffItem>;

/** What the next block keeps, changes, adds and removes against the current one. */
export const BlockDiff = z.object({
  keep: z.array(BlockDiffItem),
  change: z.array(BlockDiffItem),
  add: z.array(BlockDiffItem),
  remove: z.array(BlockDiffItem),
  /** Block-wide lines: weeks, days, deloads. */
  structure: z.array(z.string()),
});
export type BlockDiff = z.infer<typeof BlockDiff>;

/**
 * The Coach's proposal for the next block, waiting for the person: accepting
 * it starts the block (`accept_block_proposal`), discarding it leaves
 * everything as is. At most one is pending; a new one replaces it.
 */
export const BlockProposal = z.object({
  id: z.string(),
  /** The block it follows. */
  fromProgramId: z.string().nullable(),
  status: z.enum(["pending", "accepted", "discarded", "replaced"]),
  name: z.string(),
  goal: z.string(),
  weeks: z.number(),
  deloadWeeks: z.array(z.number()),
  /** One or two Spanish sentences: why this block. */
  rationale: z.string(),
  diff: BlockDiff,
  /** The block it became, once accepted. */
  programId: z.string().nullable(),
  createdAt: z.number(),
  decidedAt: z.number().nullable(),
});
export type BlockProposal = z.infer<typeof BlockProposal>;

/**
 * The phone's Entreno: `suggestions` is keyed by `ProgramExercise.id`. Each day
 * shows its next session this week, with that session's own list when it was
 * edited for its date (`overridden`). `nextInstanceId` is the first pending
 * session from today on (by date and time) and `nextDayId` its program day;
 * both null when there is no program or nothing is pending this week.
 */
export const ActiveProgramResponse = z.object({
  program: Program.nullable(),
  nextDayId: z.string().nullable(),
  /** Today's pending session, when there is one ("Hoy"). */
  todayInstance: SessionInstance.nullable().optional(),
  /** The next pending session ("Siguiente"): today's, or the first one after. Find it in the active block's `weeks[].instances`. */
  nextInstanceId: z.string().nullable().optional(),
  suggestions: z.record(z.string(), LoadSuggestion),
  /** Null when neither age nor max heart rate is known. */
  hrZones: z.array(HrZoneRange).nullable().optional(),
  settings: TrainingSettings.optional(),
  /** Every block, oldest first; the active one (if any) last. */
  blocks: z.array(TrainingBlock).optional(),
  /**
   * The Coach's review of the next day, when something was noticed. Starting
   * that day uses `adjustment.day` and `adjustment.suggestions` unless it is
   * still reviewing, says no change, or was set aside (`dismiss_session_adjustment`).
   * `open_adjustment_thread` → `{ threadId }` opens it in an asistente thread ("Ver por qué").
   */
  adjustment: NextAdjustment.nullable().optional(),
  /** What the engine notices about the active block (stalls, ready to progress, its end, adherence). */
  blockSignals: z.array(BlockSignal).optional(),
  /** The Coach's pending proposal for the next block, shown with Aceptar and Descartar. */
  proposal: BlockProposal.nullable().optional(),
});
export type ActiveProgramResponse = z.infer<typeof ActiveProgramResponse>;

// ── Sessions ─────────────────────────────────────────────────────────────────

/** One stretch of a set at one load. */
export const SetSegment = z.object({ weightKg: z.number(), reps: z.number() });
export type SetSegment = z.infer<typeof SetSegment>;

/**
 * A set where the load dropped mid-set ("80 kg × 5 → 60 kg × 3") has several
 * segments, in the order done. `weightKg`/`reps` are always the first (top)
 * segment and win over `segments[0]`. The engine always returns `segments`
 * (one for a plain set); clients may omit it (= one segment). Volume and total
 * reps sum every segment; records, e1RM, progression and the review signals
 * read the top segment only.
 */
export const SetSegments = z.object({ segments: z.array(SetSegment).optional() });
export type SetSegments = z.infer<typeof SetSegments>;

export const SetLog = z.object({
  exerciseId: z.string(),
  /** 0-based order within the exercise in this session. */
  setIndex: z.number(),
  /** The top segment's load. */
  weightKg: z.number(),
  /** The top segment's reps. */
  reps: z.number(),
  rpe: z.number().nullable(),
  doneAt: z.number(),
  ...SetSegments.shape,
});
export type SetLog = z.infer<typeof SetLog>;

export const TrainingSession = z.object({
  id: z.string(),
  programId: z.string().nullable(),
  dayId: z.string().nullable(),
  /** The dated session (SessionInstance) it did. */
  instanceId: z.string().nullable().optional(),
  name: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  notes: z.string().nullable(),
  sets: z.array(SetLog),
  /** Cardio blocks done in the session, in order. */
  cardio: z.array(CardioLog),
  /** Sum of the cardio blocks, minutes. */
  cardioMinutes: z.number(),
  /** Read only. True when Health workouts recorded during the session were merged into it: they are this session, not more training. */
  merged: z.boolean().optional(),
  /** Read only: what those workouts recorded (kcal, heart rate, distance). */
  recorded: SessionRecording.nullable().optional(),
  /** Read only, one session's detail: Health workouts nearby it could be joined with. */
  joinable: z.array(JoinCandidate).optional(),
});
export type TrainingSession = z.infer<typeof TrainingSession>;

/** What the phone posts when a session ends. `id` is client-made, so retries upsert. */
export type SessionInput = Omit<TrainingSession, "programId" | "dayId" | "instanceId" | "notes" | "cardio" | "cardioMinutes" | "merged" | "recorded" | "joinable"> & {
  programId?: string | null;
  dayId?: string | null;
  /** The dated session it did; omitted, the engine finds it from dayId and the date (or makes one). */
  instanceId?: string | null;
  notes?: string | null;
  cardio?: CardioLog[];
};

// ── The session in progress ──────────────────────────────────────────────────

/** `weightKg`/`reps` are the top segment; see `SetSegments`. */
export const LiveSet = z.object({
  id: z.string(),
  weightKg: z.number(),
  reps: z.number(),
  /** True once the person (or the Coach) set the reps. An open set without it shows the target range and logs `repMax` when checked off as it stands. */
  repsChosen: z.boolean().optional(),
  rpe: z.number().nullable(),
  /** Epoch ms; null until checked off. */
  doneAt: z.number().nullable(),
  ...SetSegments.shape,
});
export type LiveSet = z.infer<typeof LiveSet>;

/** One exercise of the session in progress: the program's prescription, as changed for today. */
export const LiveExercise = z.object({
  /** The `ProgramExercise.id` it came from, or a fresh id for one added today. */
  id: z.string(),
  exerciseId: z.string(),
  name: z.string(),
  equipment: Equipment,
  kind: ExerciseKind,
  modality: CardioModality.nullable().optional(),
  repMin: z.number(),
  repMax: z.number(),
  targetRpe: z.number().nullable(),
  targetRir: z.number().nullable(),
  restSeconds: z.number(),
  notes: z.string().nullable(),
  /** The double-progression reason, shown under the name. */
  hint: z.string().nullable(),
  /** Empty for cardio. */
  sets: z.array(LiveSet),
  cardio: CardioTarget.nullable(),
  /** Filled when a cardio block ends. */
  cardioLog: CardioLog.nullable(),
  /** Passed over today; stays in the list, greyed. */
  skipped: z.boolean(),
  /** Cardio ended early on the Coach's `finish_cardio`: done, not skipped. The engine fills `cardioLog` from the synced clock when it has one; otherwise the phone writes it from its own clock, timed up to `at`. */
  cutShort: z.object({ at: z.number(), reason: z.string().nullable() }).nullable().optional(),
  /** Same rule as `ProgramExercise.supersetId`; normalized on every write (phone or Coach). */
  supersetId: z.string().nullable(),
});
export type LiveExercise = z.infer<typeof LiveExercise>;

/** A cardio block's stopwatch. Elapsed = `accumulatedSeconds` + (now − `runningSince`) while running. */
export const LiveCardioClock = z.object({
  /** The `LiveExercise.id` it times. */
  exerciseId: z.string(),
  /** Epoch ms; null while paused. */
  runningSince: z.number().nullable(),
  accumulatedSeconds: z.number(),
});
export type LiveCardioClock = z.infer<typeof LiveCardioClock>;

/**
 * The session in progress, kept on the engine so the Coach can change it.
 * The phone stores its copy with `put_live_session` `{ session, baseVersion }`;
 * when the engine's copy moved past `baseVersion` (the Coach changed it) the
 * answer is `{ conflict: true, session }` with the engine's copy: adopt it.
 * `end_live_session` forgets it (finish or discard). Saving the finished session also forgets it.
 */
export const LiveSession = z.object({
  id: z.string(),
  programId: z.string().nullable(),
  dayId: z.string().nullable(),
  /** The dated session it was started from. */
  instanceId: z.string().nullable().optional(),
  name: z.string(),
  startedAt: z.number(),
  exercises: z.array(LiveExercise),
  /** Index of the exercise on screen. */
  focus: z.number(),
  restStartedAt: z.number().nullable(),
  restEndsAt: z.number().nullable(),
  /** The stopwatch of the cardio block being done, as the phone last synced it; null when none. */
  cardioClock: LiveCardioClock.nullable().optional(),
  /** Bumped on every write, phone or Coach. */
  version: z.number(),
  updatedAt: z.number(),
  threadId: z.string().nullable(),
});
export type LiveSession = z.infer<typeof LiveSession>;

export const PersonalRecord = z.object({
  exerciseId: z.string(),
  exerciseName: z.string(),
  /** e1rm: Epley estimate; weight: heaviest load; reps: most reps on a bodyweight set. */
  kind: z.enum(["e1rm", "weight", "reps"]),
  value: z.number(),
  previous: z.number().nullable(),
});
export type PersonalRecord = z.infer<typeof PersonalRecord>;

export const SessionSaved = z.object({ session: TrainingSession, prs: z.array(PersonalRecord) });
export type SessionSaved = z.infer<typeof SessionSaved>;

/** One session's best work on an exercise. */
export const HistoryPoint = z.object({
  sessionId: z.string(),
  date: z.number(),
  topWeightKg: z.number(),
  bestE1rm: z.number(),
  /** Every segment's reps. */
  totalReps: z.number(),
  /** Every segment's kg × reps. */
  volumeKg: z.number(),
  sets: z.array(SetLog),
});
export type HistoryPoint = z.infer<typeof HistoryPoint>;

export const ExerciseHistory = z.object({
  exercise: Exercise,
  points: z.array(HistoryPoint),
  bestE1rm: z.number().nullable(),
  heaviestKg: z.number().nullable(),
});
export type ExerciseHistory = z.infer<typeof ExerciseHistory>;

/** Fine-grained muscles for the body map (front and back views). */
export const Muscle = z.enum([
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "traps",
  "upper_back",
  "lats",
  "lower_back",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "abductors",
  "calves",
  "neck",
]);
export type Muscle = z.infer<typeof Muscle>;

/**
 * Demonstration media, streamed by the engine to the phone. URLs are
 * engine-relative and bearer-protected (`/api/mobile/salud/training/media/...`).
 */
export const ExerciseMedia = z.object({
  /** Looping demonstration (GIF). */
  animation: z.string().nullable(),
  /** A still frame for lists and thumbnails. */
  thumbnail: z.string().nullable(),
  source: z.literal("exercisedb").nullable(),
  /** Credit the source requires, shown under the media. */
  attribution: z.string().nullable(),
});
export type ExerciseMedia = z.infer<typeof ExerciseMedia>;

/** A curated technique video; played in YouTube's own embedded player, never cached. */
export const ExerciseVideo = z.object({ youtubeId: z.string(), title: z.string(), channel: z.string(), lang: z.enum(["es", "en"]) });
export type ExerciseVideo = z.infer<typeof ExerciseVideo>;

/** Everything the exercise screen shows. */
export const ExerciseDetail = Exercise.extend({
  nameEn: z.string().nullable(),
  primaryMuscles: z.array(Muscle),
  secondaryMuscles: z.array(Muscle),
  /** Spanish, one step per item. */
  instructions: z.array(z.string()),
  /** Short Spanish cues ("Junta las escápulas"). */
  tips: z.array(z.string()),
  media: ExerciseMedia,
  videos: z.array(ExerciseVideo),
  /** The person's own notes (`set_exercise_notes`). */
  notes: z.string().nullable(),
});
export type ExerciseDetail = z.infer<typeof ExerciseDetail>;

/** The Rendimiento view. */
export const ExercisePerformance = z.object({
  exerciseId: z.string(),
  maxWeight: z.object({ kg: z.number(), reps: z.number(), at: z.number() }).nullable(),
  bestE1rm: z.object({ kg: z.number(), at: z.number() }).nullable(),
  /** Most volume (kg × reps) in one session. */
  maxVolume: z.object({ kg: z.number(), at: z.number() }).nullable(),
  /** Oldest first, one point per session. */
  history: z.array(z.object({ at: z.number(), topWeightKg: z.number(), e1rm: z.number(), volumeKg: z.number() })),
});
export type ExercisePerformance = z.infer<typeof ExercisePerformance>;

// ── Operations ───────────────────────────────────────────────────────────────

/** A compact answer shaped for a model (outlines, one line per exercise or set); its fields are described by the operation. */
const ForModel = z.looseObject({});

const scope = EditScope;
const exerciseRef = z
  .union([z.literal("current"), z.number().int().min(1), z.string()])
  .describe('"current" (the exercise on screen), its 1-based position, or its live id / library id from get_live_session.');

/** One change to the session in progress. */
export const liveOpShape = z.discriminatedUnion("op", [
  z.object({ op: z.literal("swap"), exercise: exerciseRef, toExerciseId: z.string().describe("Library id to do instead (same muscle target).") }),
  z.object({
    op: z.literal("update"),
    exercise: exerciseRef,
    sets: z.number().int().min(1).max(10).optional().describe("Total sets; sets already done are kept."),
    repMin: z.number().int().min(1).max(50).optional(),
    repMax: z.number().int().min(1).max(50).optional(),
    weightKg: z.number().min(0).max(1000).optional().describe("Load for the sets not done yet, kg (convert from the exercise's unit; it lands on that unit's steps)."),
    reps: z.number().int().min(1).max(50).optional().describe("Reps for the sets not done yet."),
    restSeconds: z.number().int().min(0).max(600).optional(),
    cardio: cardioTargetShape.optional().describe("Cardio blocks: the target fields to change."),
    supersetId: supersetIdShape.describe(
      'Pair it into a superset: give the same label (e.g. "a") to 2+ consecutive strength exercises, one update each, in the same call. null takes it out of its superset.',
    ),
  }),
  z.object({
    op: z.literal("add"),
    exerciseId: z.string(),
    position: z.number().int().min(1).optional().describe("1-based; omit to add at the end."),
    sets: z.number().int().min(1).max(10).optional(),
    repMin: z.number().int().min(1).max(50).optional(),
    repMax: z.number().int().min(1).max(50).optional(),
    restSeconds: z.number().int().min(0).max(600).optional(),
    weightKg: z.number().min(0).max(1000).optional(),
    cardio: cardioTargetShape.optional().describe("For a cardio exercise; defaults to 15 min in zone 2."),
    supersetId: supersetIdShape.describe("Join the superset of its neighbours with this label (add it right next to them)."),
  }),
  z.object({ op: z.literal("remove"), exercise: exerciseRef }),
  z.object({ op: z.literal("skip"), exercise: exerciseRef }),
  z.object({ op: z.literal("move"), exercise: exerciseRef, to: z.number().int().min(1).describe("New 1-based position.") }),
  z.object({ op: z.literal("focus"), exercise: exerciseRef }),
  z.object({
    op: z.literal("finish_cardio"),
    exercise: exerciseRef,
    reason: z.string().max(200).optional().describe('Short Spanish note, e.g. "Cansado".'),
  }),
  z.object({
    op: z.literal("drop"),
    exercise: exerciseRef.optional().describe("Omit for the set done last in the session."),
    set: z.number().int().min(1).optional().describe("1-based set of `exercise` (needs exercise); omit for its last done set."),
    weightKg: z.number().min(0).max(1000).describe("The lighter load they finished with, kg (convert from the exercise's unit; it lands on that unit's steps)."),
    reps: z.number().int().min(1).max(50).describe("Reps done at that load."),
  }),
]);

/** How supersets work, shared by the tools that write them. */
const SUPERSETS =
  'Supersets ("superseries"): give the same supersetId (any short label, e.g. "a") to 2+ consecutive strength exercises; the person does one set of each in turn (A, B, rest, A, B, rest…), resting only after the last of the group. Members must be next to each other; a lone or separated member, or a cardio block, loses its supersetId.';

const exerciseId = z.string().describe("Library id, e.g. 'press-banca'.");
/** A dated session: its id, or the active block's session on a date. */
const instanceRef = z.object({
  id: z.string().optional().describe("Instance id (get_active_program sessions, list_planned_sessions)."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD, instead of id."),
  dayId: z.string().optional().describe("With date: which day's session when there are several."),
});
const ThreadRef = z.object({ threadId: z.string() });

export const trainingOperations = {
  // ── The Coach's tools ──
  list_exercises: op({
    name: "list_exercises",
    description:
      'The exercise library: id, Spanish name, primary muscle ("cardio" for cardio), secondary muscles, equipment, kind, cardio modality, hasMedia (the phone shows a demo). Programs and sets use these ids. muscle matches primary or secondary.',
    access: "read",
    method: "GET",
    path: "/training/exercises/search",
    input: z.object({
      muscle: MuscleGroup.optional(),
      equipment: equipmentEnum.optional(),
      query: z.string().optional().describe("Part of the Spanish name or id, e.g. 'remo'."),
    }),
    output: z.array(Exercise.extend({ hasMedia: z.boolean() })),
  }),
  get_exercise: op({
    name: "get_exercise",
    description: "One library exercise in full: detailed muscles, Spanish step-by-step instructions and cues, YouTube technique videos, demonstration media (hasMedia on the list), and the person's notes on it. The phone's exercise screen.",
    access: "read",
    method: "GET",
    path: "/training/exercises/{exerciseId}",
    input: z.object({ exerciseId }),
    output: ExerciseDetail,
  }),
  create_program: op({
    name: "create_program",
    description:
      "Write a whole training program: days in rotation order with prescribed exercises and, if wanted, cardio blocks (a cardio exercise with a `cardio` target), mixed or as cardio-only days. Between equivalent exercises prefer hasMedia true (the phone shows how). Plan the weeks: deloadWeeks (default: the last week when weeks ≥ 4), weekPlan for per-week sets/RIR changes and a progression per exercise; the app applies them each week. By default it becomes the active program, a new block: the previous one ends (pass `reason`), its sessions, records and history stay, and loads carry over where exercises repeat. Loads aren't prescribed: the app suggests them from each exercise's progression. To change blocks at the end of one, propose with plan_next_block instead.",
    access: "write",
    method: "POST",
    path: "/training/programs",
    input: z.object({ ...programShape, activate: z.boolean().default(true) }),
    output: ForModel,
    event: "program.created",
  }),
  get_active_program: op({
    name: "get_active_program",
    description:
      "The active program (`program` null if none), compact: per day id, name and one line per exercise («<program exercise id> · name (library id) · sets×reps · rest · RIR/RPE · hand-set load · superserie · «notes»»; cardio gives its target); days are TEMPLATES; `soloHoy` on a day whose next session has its own list; `sessions` this week's dated sessions (instances: «date time · name · status · editada · <instance id>»); `today` and `next` (the first pending session from today on; `nextDayId` is its template; null when nothing is pending); `missed` (past sessions never done: offer to move them, update_planned_session); `week` (each day done/partial/missed/planned, Mon–Sun); `earlierBlocks` (dates, weeks, why it ended, id); `adjustment` (your review of the next session). " +
      "`dayId` gives that day in full, with each exercise's next load (kg, on its unit's steps, with the reason).",
    access: "read",
    method: "GET",
    path: "/training/program/outline",
    input: z.object({ dayId: z.string().optional() }),
    output: ForModel,
  }),
  edit_program_days: op({
    name: "edit_program_days",
    description:
      'Rewrite the exercise lists of one or more program days in ONE call, all or nothing: reorder, add, remove, swap or change targets. A change touching several days ("hazla más corta", "solo máquinas") is one call with all of them. Pass each day\'s WHOLE new list from get_active_program, keeping each exercise\'s `id` so its history follows (omit for new ones) and the supersetId of the others. Returns the edited days, one line per exercise.',
    access: "write",
    method: "POST",
    path: "/training/program/days",
    input: z.object({
      scope: scope.describe('"today" = only one dated session of each day (today\'s, else its next this week; or the day\'s instanceId), "always" = the template, para siempre.'),
      days: z
        .array(z.object({ dayId: z.string(), instanceId: z.string().optional().describe('scope "today": that dated session (get_active_program sessions).'), exercises: z.array(dayExerciseShape).min(1).max(20) }))
        .min(1)
        .max(7),
    }),
    output: ForModel,
    event: "program.updated",
  }),
  swap_program_exercise: op({
    name: "swap_program_exercise",
    description:
      'Replace one exercise in the active program, keeping its sets, reps, rest and superset. `to` is a library id of the same kind (strength or cardio), from find_similar_exercises. scope "always": every day (template) that has it; "today": only one dated session — `instanceId`, else today\'s (or the next) session of `dayId`, else today\'s session (or the next one) whatever its day. `dayId` limits either to that day. Returns the days changed.',
    access: "write",
    method: "POST",
    path: "/training/program/swap",
    input: z.object({
      from: z.string().describe("Library id or program exercise id."),
      to: z.string(),
      scope: scope.describe('"today" = solo esta sesión, "always" = para siempre.'),
      dayId: z.string().optional(),
      instanceId: z.string().optional().describe('scope "today": the dated session to change.'),
    }),
    output: z.object({
      scope: EditScope,
      to: z.string(),
      days: z.array(z.string()),
      /** "always": sessions of those days with their own list, which keep it. */
      keptOwnList: z.number().optional(),
    }),
    event: "program.updated",
  }),
  find_similar_exercises: op({
    name: "find_similar_exercises",
    description:
      'Alternatives to an exercise, best first, scored 0–100: same primary muscle and movement pattern (cardio: intensity and impact), then preferred equipment; with short Spanish reasons and demonstration media. Filter by equipment when they ask ("con máquina").',
    access: "read",
    method: "GET",
    path: "/training/exercises/{exerciseId}/similar",
    input: z.object({
      exerciseId: z.string().describe("Library id to replace."),
      equipment: z.array(equipmentEnum).optional(),
      limit: z.number().int().min(1).max(50).default(8),
    }),
    output: z.object({ exercises: z.array(SimilarExercise) }),
  }),
  get_training_preferences: op({
    name: "get_training_preferences",
    description:
      'Training preferences: preferredEquipment (best first), defaultUnit (kg or lb), exerciseUnits (library ids whose machine or plates use their own unit). Tools use kg, but speak in each exercise\'s unit (exerciseUnits[id] ?? defaultUnit; 1 lb = 0.45359237 kg): "70 lb", not "31,75 kg".',
    access: "read",
    method: "GET",
    path: "/training/settings",
    input: z.object({}),
    output: TrainingSettings,
  }),
  set_training_preferences: op({
    name: "set_training_preferences",
    description:
      'Save preferredEquipment, best first ("prefiero máquinas" → ["machine", "cable"]; replaces the list, [] clears it), and/or defaultUnit, for exercises without their own and totals. Only the fields given change.',
    access: "write",
    method: "PUT",
    path: "/training/settings",
    input: z.object({ preferredEquipment: z.array(equipmentEnum).max(7).optional(), defaultUnit: weightUnitEnum.optional() }),
    output: TrainingSettings,
    event: "training_settings.updated",
  }),
  set_exercise_unit: op({
    name: "set_exercise_unit",
    description:
      'Set the unit one exercise is shown, typed and suggested in, because its machine or plates use it ("este press en libras"), for future sessions and the live one. Stored in kg; lb loads land on 5 lb steps. null = follow the default. Returns the preferences.',
    access: "write",
    method: "PUT",
    path: "/training/exercises/{exerciseId}/unit",
    input: z.object({ exerciseId: z.string().describe("Library id (in a live session, its exerciseId)."), unit: weightUnitEnum.nullable() }),
    output: TrainingSettings,
    event: "training_settings.updated",
  }),
  get_live_session: op({
    name: "get_live_session",
    description:
      "The strength/cardio session the person is doing right now on the phone, or null: each exercise with its position, live id, library id, sets (weightKg and reps of the top segment, `segments` when the load dropped mid-set, done or not), cardio target, skipped flag, cutShort (cardio ended early), supersetId (exercises sharing one are done as a superset), `focus` (index of the one on screen) and `cardioClock` (the running cardio timer: elapsed = accumulatedSeconds + now − runningSince; the summary has it in minutes). Use it before edit_live_session.",
    access: "read",
    method: "GET",
    path: "/training/live",
    input: z.object({}),
    output: z.object({ session: LiveSession.nullable(), summary: z.string().optional() }),
  }),
  edit_live_session: op({
    name: "edit_live_session",
    description:
      'Change the session in progress right now — today only, the program stays as is. Ops run in order, all or nothing: swap (another exercise for the same target; done sets stay logged under the old one; the new one keeps its superset), update (sets, reps, load for the sets not done, rest, cardio target, supersetId to pair/unpair), add (strength or cardio, at a position, optionally into a superset), remove (only if nothing was logged; else skip), skip, move (reorder), focus (show it), finish_cardio (end a cardio block early, keeping the minutes done: it counts as done, not skipped; the phone stops its timer), drop (they lowered the load mid-set to finish it, "bajé a 60 para terminar 3 más": adds that load × reps as one more segment of the set they just did, shown "80 kg × 5 → 60 kg × 3"; volume counts it, records and next loads read only the top segment). A cardio block with time on its running clock cannot be skipped, removed or swapped: finish_cardio it first. The phone shows the change at once with an undo. Returns the updated session and one line per change. ' +
      SUPERSETS +
      ' To pair two exercises, update both with the same supersetId in one call (move them next to each other first if needed); a pairing that can\'t stand is refused. A move, remove or skip that leaves a member alone or apart takes it out of its superset. To split a superset midway ("me ganaron la máquina"), update its members with supersetId null: every set already logged stays, and each goes on as a plain exercise.',
    access: "write",
    method: "POST",
    path: "/training/live/edits",
    input: z.object({ ops: z.array(liveOpShape).min(1).max(10) }),
    output: z.object({ changes: z.array(z.string()), summary: z.string() }),
    event: "live_session.updated",
  }),
  list_sessions: op({
    name: "list_sessions",
    description:
      'Logged training sessions, newest first: date, minutes, dayId, per exercise one line of sets in order, kg×reps ("80×5→60×3" = load dropped mid-set, the first is the top segment; "@9" = RPE); cardio blocks (durationSeconds, distanceKm, avgHr, kcal; cardioMinutes total). startedAt epoch ms. exerciseId: only sessions with it. ' +
      "merged: true = Apple Watch (or another Health app) recorded workouts during it, in `recorded` (parts, kcal summed once, avg/max HR, distance, span): NOT extra training, never add them again from list_workouts. A cardio block with `recordedBy` was filled in from that workout.",
    access: "read",
    method: "GET",
    path: "/training/sessions/outline",
    input: z.object({ limit: z.number().int().min(1).max(100).default(10), exerciseId: z.string().optional() }),
    output: z.array(ForModel),
  }),
  exercise_history: op({
    name: "exercise_history",
    description:
      "One exercise's progress, oldest first: per session top weight and best Epley e1RM (kg, top segments only), total reps and volume (kg×reps, every drop-set segment), plus all-time best e1RM and heaviest load. `withSets` adds each session's sets (the phone's chart).",
    access: "read",
    method: "GET",
    path: "/training/exercises/{exerciseId}/history",
    input: z.object({
      exerciseId,
      limit: z.number().int().min(1).max(200).default(30).describe("Most recent sessions."),
      withSets: z.boolean().default(false),
    }),
    output: ExerciseHistory.extend({ points: z.array(HistoryPoint.partial({ sets: true })) }),
  }),
  suggest_next_loads: op({
    name: "suggest_next_loads",
    description:
      "Next load (kg, on the steps of each exercise's unit; the reason speaks in that unit) and target reps for each exercise of an active program day, by double progression: every set at the top of the range → one increment up; short of the bottom → back off; else same load, one more rep. weightKg null without history.",
    access: "read",
    method: "GET",
    path: "/training/program/next-loads",
    input: z.object({ dayId: z.string().optional().describe("Default the next day to train.") }),
    output: z.object({ dayId: z.string(), dayName: z.string(), suggestions: z.record(z.string(), LoadSuggestion) }),
  }),
  log_session: op({
    name: "log_session",
    description:
      "Record a strength session done without the phone (sessions done with the phone are logged already). Sets in order; weightKg is the external load (0 for bodyweight). Returns the saved session and any records it set.",
    access: "write",
    method: "POST",
    path: "/training/sessions/log",
    input: z.object({
      name: z.string().min(1).max(80).describe('Spanish, e.g. "Pierna".'),
      startedAt: z.string().datetime({ offset: true }).describe("ISO 8601 with offset."),
      durationMinutes: z.number().int().min(1).max(300),
      dayId: z.string().optional().describe("Program day it was, if any."),
      instanceId: z.string().optional().describe("The dated session it did (get_active_program sessions); omitted, the engine matches it by dayId and date."),
      notes: z.string().max(1000).optional(),
      sets: z
        .array(
          z.object({
            exerciseId: z.string(),
            weightKg: z.number().min(0).max(1000),
            reps: z.number().int().min(1).max(200),
            rpe: z.number().min(1).max(10).optional(),
          }),
        )
        .min(1)
        .max(300),
    }),
    output: z.object({ session: ForModel, prs: z.array(PersonalRecord) }),
    event: "training_session.created",
  }),
  set_session_adjustment: op({
    name: "set_session_adjustment",
    description:
      'Adjust only the NEXT session of a program day (the program stays): less load, fewer sets, reps within the range, a swap, a skip, or a short cardio warm-up first; or noChange to record it stays as planned. Enforced (a refusal says what to fix): bounds are this week\'s plan (its planned sets, deload and progression already included): loadPercent −40 to 0 vs progression, never under 60 % of the last load; at most 2 fewer sets than this week\'s, never more; reps within range; swaps keep the kind; skip at most half the day; one cardio warm-up ≤ 15 min (add). The person sees `rationale` on the next-workout card and can dismiss it ("Entrenar normal"). Returns the session as it will be done.',
    access: "write",
    method: "POST",
    path: "/training/program/adjustments",
    input: z.object({
      dayId: z.string().describe("Usually nextDayId (get_active_program)."),
      noChange: z.boolean().default(false),
      rationale: z.string().min(1).max(240).describe('ONE calm Spanish sentence: what you noticed and what changes, e.g. "Llevas 9 días sin entrenar: hoy un 10 % menos de peso."'),
      changes: z
        .array(
          z.object({
            action: z.enum(["adjust", "swap", "skip", "add"]),
            programExerciseId: z.string().nullish().describe("The day's exercise id; null for add."),
            loadPercent: z.number().min(-40).max(0).nullish().describe("% vs progression's suggestion."),
            sets: z.number().int().min(1).max(10).nullish(),
            reps: z.number().int().min(1).max(50).nullish(),
            toExerciseId: z.string().nullish().describe("swap: library id; add: a cardio library id."),
            cardio: cardioTargetShape.nullish().describe("add: e.g. { durationMinutes: 8, zone: 1 }."),
          }),
        )
        .max(20)
        .default([]),
    }),
    output: z.object({
      id: z.string(),
      dayId: z.string(),
      noChange: z.boolean(),
      rationale: z.string().nullable(),
      exercises: z.array(z.object({ id: z.string(), name: z.string(), sets: z.number(), suggestion: LoadSuggestion.nullable() })),
    }),
    event: "program.updated",
  }),

  review_block: op({
    name: "review_block",
    description:
      "Review a training block (the active one by default): per exercise its first → last exposure in the block (top set, e1RM, change %), sessions and status (progressing, stalled, ready, flat, no data) against its prescription and progression; adherence (sessions done vs planned, per week); weekly hard sets per muscle (secondary muscles count half); signals (stall, ready, block ending, low adherence); recovery (readiness and sleep over the block, health events); and the pending proposal for the next block, if any. Use it for «¿cómo voy?», in the last week of a block and before plan_next_block.",
    access: "read",
    method: "GET",
    path: "/training/blocks/review",
    input: z.object({ programId: z.string().optional().describe("A block's program id (get_active_program's earlierBlocks); omit for the active one.") }),
    output: ForModel,
  }),
  plan_next_block: op({
    name: "plan_next_block",
    description:
      "PROPOSE the next block (it does not start it): the whole program as in create_program, plus `rationale` and a `why` per changed exercise. Stored as pending with a diff against the current block (kept, changed, added, removed); the person sees it on Entreno and accepts or discards it, or tells you yes (then accept_block_proposal). A new proposal replaces a pending one. Call review_block and consult_knowledge first. Keep the main lifts that progressed, change 1–3 accessories and what stalled. Returns the proposal.",
    access: "write",
    method: "POST",
    path: "/training/blocks/proposals",
    input: z.object({
      ...programShape,
      rationale: z.string().min(1).max(400).describe("One or two Spanish sentences for the person: what the review showed and what the new block does about it."),
      reasons: z
        .array(z.object({ exerciseId: z.string(), why: z.string().min(1).max(160).describe("Spanish, e.g. \"Estancado 3 sesiones: variante en estiramiento\".") }))
        .max(30)
        .default([])
        .describe("Why each added, removed or changed exercise changes (library id of either side)."),
    }),
    output: BlockProposal,
    event: "program.updated",
  }),
  accept_block_proposal: op({
    name: "accept_block_proposal",
    description: "Start the pending next block as proposed: it becomes the active program and the current block ends. Only when the person said yes to that proposal. Returns the proposal, now accepted, with its programId.",
    access: "write",
    method: "POST",
    path: "/training/blocks/proposals/{id}/accept",
    input: z.object({ id: z.string() }),
    output: BlockProposal,
    event: "program.created",
  }),
  discard_block_proposal: op({
    name: "discard_block_proposal",
    description: "Discard the pending next-block proposal; the current block goes on as it is. Returns the proposal, now discarded.",
    access: "write",
    method: "POST",
    path: "/training/blocks/proposals/{id}/discard",
    input: z.object({ id: z.string() }),
    output: BlockProposal,
    event: "program.updated",
  }),
  get_session_instance: op({
    name: "get_session_instance",
    description:
      "One dated session of the active block (by `id`, or the one on `date`; `dayId` picks among several that day): its template, week, deload, status, whether it has its own list, and its exercises as they will be done that date (one line each, with the next loads). Use it before editing a session that is not the next one.",
    access: "read",
    method: "GET",
    path: "/training/instances/lookup",
    input: instanceRef,
    output: ForModel,
  }),
  edit_session_instance: op({
    name: "edit_session_instance",
    description:
      `Change ONE dated session only (any date, today or later), never the template: pass its WHOLE new exercise list (as in edit_program_days, keeping ids), or \`reset: true\` to make it follow the template again. Later template edits ("para siempre") don't touch a session with its own list. ${SUPERSETS} Returns the session.`,
    access: "write",
    method: "PUT",
    path: "/training/instances/exercises",
    input: instanceRef.extend({
      exercises: z.array(dayExerciseShape).min(1).max(20).optional(),
      reset: z.boolean().optional().describe("Drop its own list: it inherits the template and the week's plan again."),
    }),
    output: ForModel,
    event: "program.updated",
  }),
  set_session_template: op({
    name: "set_session_template",
    description:
      "«Hoy toca Torso B»: make one dated session (by `id`, or the one on `date`) a session of another program day (`toDayId`); its own list, if any, is dropped. With `swap` (default) the pending session of `toDayId` that week takes the old day, so the week still has each day once. Without a session on `date`, the week's pending session of `toDayId` moves there. Returns the session (and the one swapped).",
    access: "write",
    method: "PUT",
    path: "/training/instances/template",
    input: instanceRef.extend({
      toDayId: z.string().describe("Program day id (get_active_program)."),
      swap: z.boolean().default(true),
    }),
    output: ForModel,
    event: "training_plan.updated",
  }),

  // ── What the iPhone's Entreno calls (Pulso's /api/mobile/training/*) ──
  get_training_program: op({
    name: "get_training_program",
    description:
      "The phone's Entreno, in full: the active program (each day as its next session this week, with that session's own changes), today's and the next dated session, the next day to train, a load suggestion per program exercise (keyed by its id), heart-rate zones, preferences, every block with its weeks, and the review of the next session. Opening it starts a due review of the next workout. For a model, get_active_program is shorter.",
    access: "read",
    method: "GET",
    path: "/training/program",
    input: z.object({}),
    output: ActiveProgramResponse,
  }),
  edit_program_day: op({
    name: "edit_program_day",
    description:
      'One program day\'s whole exercise list in its new order (reorder, add, remove, swap and edit targets in one write), "today" (only its dated session: `instanceId`, else today\'s or its next this week) or "always" (the template; today\'s session of that day follows it, other sessions edited on their own keep their list). Returns the phone\'s Entreno (get_training_program).',
    access: "write",
    method: "PUT",
    path: "/training/program/days/{dayId}",
    input: z.object({ dayId: z.string(), scope: EditScope, instanceId: z.string().optional(), exercises: z.array(dayExerciseShape).min(1).max(20) }),
    output: ActiveProgramResponse,
    event: "program.updated",
  }),
  clear_day_override: op({
    name: "clear_day_override",
    description: "Drops the own list of a program day's next session (today's, else its next this week): it follows the template again. Returns the phone's Entreno (get_training_program).",
    access: "write",
    method: "DELETE",
    path: "/training/program/days/{dayId}",
    input: z.object({ dayId: z.string() }),
    output: ActiveProgramResponse,
    event: "program.updated",
  }),
  start_next_week: op({
    name: "start_next_week",
    description: "«Empezar la semana ya»: begins the active block's next week now, once every day of this one is done. Returns the phone's Entreno (get_training_program).",
    access: "write",
    method: "POST",
    path: "/training/program/weeks/next",
    input: z.object({}),
    output: ActiveProgramResponse,
    event: "program.updated",
  }),
  resume_block: op({
    name: "resume_block",
    description: "«Retomar»: a new active block with an earlier block's days. Returns the phone's Entreno (get_training_program).",
    access: "write",
    method: "POST",
    path: "/training/program/blocks/{programId}/resume",
    input: z.object({ programId: z.string() }),
    output: ActiveProgramResponse,
    event: "program.created",
  }),
  dismiss_session_adjustment: op({
    name: "dismiss_session_adjustment",
    description: "«Entrenar normal»: set the review of the next session aside (dismissed true), or go back to it (false). Returns the phone's Entreno (get_training_program).",
    access: "write",
    method: "PUT",
    path: "/training/program/adjustments/{id}",
    input: z.object({ id: z.string(), dismissed: z.boolean() }),
    output: ActiveProgramResponse,
    event: "program.updated",
  }),
  open_adjustment_thread: op({
    name: "open_adjustment_thread",
    description: "«Ver por qué»: an asistente thread that opens with the review of the next session (what was noticed, what changes), to discuss it. Asking twice returns the same thread.",
    access: "write",
    method: "POST",
    path: "/training/program/adjustments/{id}/thread",
    input: z.object({ id: z.string() }),
    output: ThreadRef,
  }),
  list_exercise_library: op({
    name: "list_exercise_library",
    description: "The whole exercise library with each one's demonstration thumbnail and animation URLs (null without media): the phone's picker. For a model, list_exercises filters and is shorter.",
    access: "read",
    method: "GET",
    path: "/training/exercises",
    input: z.object({}),
    output: z.object({ exercises: z.array(Exercise) }),
  }),
  get_exercise_performance: op({
    name: "get_exercise_performance",
    description: "One exercise's Rendimiento: heaviest set, best e1RM and most volume in one session (kg, with when), and one point per session, oldest first.",
    access: "read",
    method: "GET",
    path: "/training/exercises/{exerciseId}/performance",
    input: z.object({ exerciseId }),
    output: ExercisePerformance,
  }),
  set_exercise_notes: op({
    name: "set_exercise_notes",
    description: "Replace the person's own notes on an exercise (seat height, grip…); blank or null clears them. Returns them as stored.",
    access: "write",
    method: "PUT",
    path: "/training/exercises/{exerciseId}/notes",
    input: z.object({ exerciseId, notes: z.string().max(4000).nullable() }),
    output: z.object({ notes: z.string().nullable() }),
    event: "exercise.updated",
  }),
  put_live_session: op({
    name: "put_live_session",
    description:
      "The phone stores its copy of the session in progress, based on `baseVersion`. Returns it with the new version; when the engine's copy moved past `baseVersion` (the Coach changed it) nothing is stored and the answer is `{ conflict: true, session }` with the engine's copy, to adopt.",
    access: "write",
    method: "PUT",
    path: "/training/live",
    input: liveSessionInput,
    output: z.object({ session: LiveSession, conflict: z.boolean() }),
    event: "live_session.updated",
  }),
  end_live_session: op({
    name: "end_live_session",
    description:
      "Ends the session in progress. `discard` just forgets it; otherwise the done work not saved yet is saved as the finished session (same id, so save_training_session upserts over it). `saved` says whether it did.",
    access: "write",
    method: "DELETE",
    path: "/training/live",
    input: z.object({ discard: z.boolean().default(false) }),
    output: z.object({ ok: z.literal(true), saved: z.boolean() }),
    event: "live_session.ended",
  }),
  open_live_coach_thread: op({
    name: "open_live_coach_thread",
    description:
      "The asistente thread bound to the session in progress (created on first use, titled «Entreno · <day> · <date>»): turns sent to it get the in-workout Coach. 404 without a session in progress.",
    access: "write",
    method: "POST",
    path: "/training/live/coach",
    input: z.object({}),
    output: ThreadRef,
  }),
  list_training_sessions: op({
    name: "list_training_sessions",
    description:
      "The last 30 logged sessions in full, newest first, with what Health recorded during each merged in (`merged`, `recorded`). For a model, list_sessions is shorter.",
    access: "read",
    method: "GET",
    path: "/training/sessions",
    input: z.object({}),
    output: z.object({ sessions: z.array(TrainingSession) }),
  }),
  get_training_session: op({
    name: "get_training_session",
    description: "One logged session in full, merged with what Health recorded, and the Health workouts nearby it could be joined with (`joinable`).",
    access: "read",
    method: "GET",
    path: "/training/sessions/{id}",
    input: z.object({ id: z.string() }),
    output: TrainingSession,
  }),
  save_training_session: op({
    name: "save_training_session",
    description:
      "The phone's finished session, upserted by its client-made id; forgets the session in progress. Returns the saved session and any personal records it set. A session done without the phone: log_session.",
    access: "write",
    method: "POST",
    path: "/training/sessions",
    input: sessionInput,
    output: SessionSaved,
    event: "training_session.created",
  }),
};
