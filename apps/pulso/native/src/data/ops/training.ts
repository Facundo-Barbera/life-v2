import type { Exercise as ExerciseRow, LibraryExercise, Program as ProgramRow, ProgramDay as DayRow, ProgramExercise as DbProgramExercise, Workout, WorkoutSet } from "@life/db";
import {

  currentWeek,
  e1rm,
  ensureBlockSessions,
  getActiveProgram,
  INCREMENT_KG,
  localDate,
  localTime,
  nextLoad,
  recordsFor,
  resolveExercise,
  similarExercises,
  volumeOf,
  weekRange,
  type LoggedSet,
} from "@life/db/pulso";
import type {
  ActiveProgramResponse,
  CardioLog,
  CardioTarget,
  Equipment,
  Exercise,
  ExerciseKind,
  HistoryPoint,
  LiveSession,
  LoadSuggestion,
  MuscleGroup,
  PersonalRecord,
  ProgramDay,
  ProgramExercise,
  ProgramWeek,
  SessionInstance,
  SetLog,
  TrainingBlock,
  TrainingSession,
  TrainingSettings,
  WeekDay,
  WeekSession,
  WeightUnit,
} from "@/contract";
import { NotAvailableError } from "../errors";
import { today } from "./daily";
import { iso, maybe, ms, n, nn, ok, one, P, rows } from "./db";
import type { Ctx, OpTable } from "./types";

// Entreno on Supabase, the same model the web uses (@life/db/pulso training):
// a block is pulso.programs + program_days; each week's dated sessions are
// pulso.workouts rows (materialized by ensureBlockSessions); a finished session
// is a workout with status done and its pulso.workout_sets. The session in
// progress that the phone, the Watch and the Live Activity share is
// pulso.live_sessions (the LiveSession JSON, with a version for conflicts).
// Exercises are named by library slug (`press-banca`) or a personal uuid.

const MUSCLES: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "core", "full_body", "cardio"];
const EQUIPMENT: Equipment[] = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band"];
const muscle = (m: string | null | undefined): MuscleGroup => (MUSCLES.includes(m as MuscleGroup) ? (m as MuscleGroup) : "full_body");
const equipment = (e: string | null | undefined): Equipment => (EQUIPMENT.includes(e as Equipment) ? (e as Equipment) : "bodyweight");

type Catalog = { library: LibraryExercise[]; personal: ExerciseRow[]; byKey: Map<string, Exercise>; personalId: Map<string, ExerciseRow> };

/** The library plus the person's own exercises, keyed by slug and by personal uuid. */
async function catalog(ctx: Ctx): Promise<Catalog> {
  const [lib, mine] = await Promise.all([P(ctx).from("exercise_library").select("*").order("name"), P(ctx).from("exercises").select("*")]);
  const library = rows(lib);
  const personal = rows(mine);
  const byKey = new Map<string, Exercise>();
  for (const l of library)
    byKey.set(l.id, { id: l.id, name: l.name, muscle: muscle(l.muscle), secondary: l.secondary.map(muscle), equipment: equipment(l.equipment), kind: l.kind, modality: (l.cardio_modality as Exercise["modality"]) ?? null });
  for (const p of personal) {
    const base = p.library_id ? byKey.get(p.library_id) : undefined;
    const ex: Exercise = base ?? { id: p.id, name: p.name, muscle: muscle(p.muscle_group), secondary: p.secondary.map(muscle), equipment: equipment(p.equipment), kind: (p.kind ?? "compound") as ExerciseKind, modality: null };
    byKey.set(p.id, ex);
  }
  return { library, personal, byKey, personalId: new Map(personal.map((p) => [p.id, p])) };
}

/** The id the phone speaks: the library slug when there is one. */
const publicId = (c: Catalog, id: string) => c.personalId.get(id)?.library_id ?? id;
const exerciseOf = (c: Catalog, id: string): Exercise =>
  c.byKey.get(id) ?? { id, name: id, muscle: "full_body", secondary: [], equipment: "bodyweight", kind: "compound", modality: null };

// ── Program shapes ──

function toCardio(c: DbProgramExercise["cardio"]): CardioTarget | null {
  if (!c) return null;
  return { durationMinutes: c.minutes ?? null, distanceKm: c.distanceKm ?? null, level: c.level ?? null };
}

function toProgramExercise(c: Catalog, dayId: string, e: DbProgramExercise, i: number): ProgramExercise {
  const id = publicId(c, e.exerciseId);
  const ex = exerciseOf(c, id);
  return {
    id: `${dayId}:${i}`,
    exerciseId: id,
    exerciseName: e.name || ex.name,
    equipment: ex.equipment,
    kind: e.cardio ? "cardio" : ex.kind,
    modality: ex.modality ?? null,
    sets: e.sets,
    repMin: e.repMin,
    repMax: e.repMax,
    targetRpe: null,
    targetRir: e.targetRir ?? null,
    restSeconds: e.restSeconds,
    notes: e.notes ?? null,
    cardio: toCardio(e.cardio),
    weightKg: e.weightKg ?? null,
    supersetId: null,
  };
}

function toDbExercise(e: { exerciseId: string; exerciseName?: string; name?: string; sets?: number; repMin?: number; repMax?: number; targetRir?: number | null; restSeconds?: number; weightKg?: number | null; notes?: string | null; cardio?: CardioTarget | null }): DbProgramExercise {
  return {
    exerciseId: e.exerciseId,
    name: e.exerciseName ?? e.name ?? e.exerciseId,
    sets: e.sets ?? 1,
    repMin: e.repMin ?? 8,
    repMax: e.repMax ?? 12,
    targetRir: e.targetRir ?? null,
    restSeconds: e.restSeconds ?? 90,
    weightKg: e.weightKg ?? null,
    notes: e.notes ?? null,
    cardio: e.cardio ? { minutes: e.cardio.durationMinutes ?? null, distanceKm: e.cardio.distanceKm ?? null, level: e.cardio.level ?? null } : null,
  };
}

const toDay = (c: Catalog, d: DayRow, own?: DbProgramExercise[] | null): ProgramDay => ({
  id: d.id,
  name: d.name,
  focus: d.focus,
  weekday: d.weekday,
  exercises: (own ?? d.exercises).map((e, i) => toProgramExercise(c, d.id, e, i)),
  overridden: !!own,
});

// ── Sessions ──

type SetRow = WorkoutSet;

function toSession(c: Catalog, w: Workout, sets: SetRow[]): TrainingSession {
  const mine = sets.filter((s) => s.workout_id === w.id);
  const strength: SetLog[] = [];
  const cardio: CardioLog[] = [];
  for (const s of mine.sort((a, b) => ms(a.done_at ?? a.created_at) - ms(b.done_at ?? b.created_at))) {
    const exerciseId = publicId(c, s.exercise_id);
    const doneAt = ms(s.done_at ?? s.created_at);
    if (s.duration_s != null)
      cardio.push({ exerciseId, durationSeconds: s.duration_s, distanceKm: nn(s.distance_km), level: nn(s.level), inclinePercent: nn(s.incline_pct), avgHr: nn(s.avg_hr), kcal: nn(s.kcal), doneAt });
    else
      strength.push({ exerciseId, setIndex: s.set_no - 1, weightKg: n(s.weight_kg), reps: s.reps ?? 0, rpe: nn(s.rpe), doneAt, ...(s.drops?.length ? { segments: s.drops } : {}) });
  }
  const startedAt = ms(w.started_at ?? w.planned_at ?? w.created_at);
  return {
    id: w.id,
    programId: w.program_id,
    dayId: w.program_day_id,
    instanceId: w.week != null ? w.id : null,
    name: w.title,
    startedAt,
    endedAt: ms(w.ended_at ?? w.started_at ?? w.created_at),
    notes: w.notes,
    sets: strength,
    cardio,
    cardioMinutes: Math.round(cardio.reduce((t, x) => t + x.durationSeconds, 0) / 60),
  };
}

async function doneSessions(ctx: Ctx, c: Catalog, opts: { limit?: number; ids?: string[] } = {}): Promise<TrainingSession[]> {
  let q = P(ctx).from("workouts").select("*").eq("status", "done").order("ended_at", { ascending: false });
  if (opts.ids) q = q.in("id", opts.ids);
  if (opts.limit) q = q.limit(opts.limit);
  const ws = rows(await q);
  if (!ws.length) return [];
  const sets = rows(await P(ctx).from("workout_sets").select("*").in("workout_id", ws.map((w) => w.id)));
  return ws.map((w) => toSession(c, w, sets));
}

/** Logged sets of one exercise (personal row), newest session first. */
async function setsOf(ctx: Ctx, personalId: string): Promise<{ workout: Workout; sets: SetRow[] }[]> {
  const sets = rows(await P(ctx).from("workout_sets").select("*").eq("exercise_id", personalId).is("duration_s", null));
  if (!sets.length) return [];
  const ws = rows(await P(ctx).from("workouts").select("*").in("id", [...new Set(sets.map((s) => s.workout_id))]).eq("status", "done"));
  return ws
    .map((w) => ({ workout: w, sets: sets.filter((s) => s.workout_id === w.id) }))
    .sort((a, b) => ms(b.workout.ended_at ?? b.workout.created_at) - ms(a.workout.ended_at ?? a.workout.created_at));
}

const logged = (s: Pick<SetRow, "weight_kg" | "reps" | "drops">): LoggedSet => ({ weightKg: n(s.weight_kg), reps: s.reps ?? 0, drops: s.drops });

// ── Settings ──

type Prefs = { preferredEquipment?: Equipment[] };

async function trainingSettings(ctx: Ctx, c?: Catalog): Promise<TrainingSettings> {
  const s = maybe(await P(ctx).from("settings").select("*").maybeSingle()) as ({ weight_unit?: WeightUnit; training_prefs?: Prefs } & Record<string, unknown>) | null;
  const cat = c ?? (await catalog(ctx));
  const exerciseUnits: Record<string, WeightUnit> = {};
  for (const p of cat.personal) if (p.unit) exerciseUnits[p.library_id ?? p.id] = p.unit;
  return { preferredEquipment: s?.training_prefs?.preferredEquipment ?? [], defaultUnit: s?.weight_unit ?? "kg", exerciseUnits };
}

// ── The active program, as the phone draws it ──

const DAY_MS = 86_400_000;

async function activeProgram(ctx: Ctx): Promise<ActiveProgramResponse> {
  const c = await catalog(ctx);
  const settings = await trainingSettings(ctx, c);
  const block = await getActiveProgram(ctx.db);
  if (!block) return { program: null, nextDayId: null, todayInstance: null, nextInstanceId: null, suggestions: {}, settings, blocks: [], adjustment: null, blockSignals: [], proposal: null };
  await ensureBlockSessions(ctx.db, block);
  const { program, days } = block as { program: ProgramRow; days: DayRow[] };
  const ws = rows(await P(ctx).from("workouts").select("*").eq("program_id", program.id));
  const doneIds = ws.filter((w) => w.status === "done").map((w) => w.id);
  const sets = doneIds.length ? rows(await P(ctx).from("workout_sets").select("*").in("workout_id", doneIds)) : [];
  const todayDate = today(ctx);
  const week = currentWeek(program.starts_on, program.weeks, todayDate);
  const dayById = new Map(days.map((d) => [d.id, d]));

  const instanceOf = (w: Workout): SessionInstance => {
    const day = w.program_day_id ? dayById.get(w.program_day_id) : undefined;
    const date = w.local_date ?? (w.week ? weekRange(program.starts_on, w.week).from : todayDate);
    const status: SessionInstance["status"] = w.status === "done" ? "done" : w.status === "skipped" ? "skipped" : date < todayDate && !w.started_at ? "missed" : "planned";
    return {
      id: w.id,
      programId: program.id,
      templateDayId: w.program_day_id,
      name: w.title,
      date,
      time: w.planned_at ? localTime(w.planned_at, ctx.tz) : (day?.time?.slice(0, 5) ?? null),
      durationMin: day?.duration_min ?? null,
      week: w.week ?? week,
      status,
      edited: !!w.exercises && !w.started_at && w.status !== "done",
      reason: null,
      conflict: null,
      movedFrom: null,
      sessionId: w.status === "done" ? w.id : null,
    };
  };

  const weekSession = (w: Workout): WeekSession => {
    const s = sets.filter((x) => x.workout_id === w.id);
    return {
      id: w.id,
      dayId: w.program_day_id,
      name: w.title,
      startedAt: ms(w.started_at ?? w.created_at),
      endedAt: ms(w.ended_at ?? w.started_at ?? w.created_at),
      sets: s.filter((x) => x.duration_s == null).length,
      cardioMinutes: Math.round(s.reduce((t, x) => t + (x.duration_s ?? 0), 0) / 60),
    };
  };

  const weeks: ProgramWeek[] = [];
  for (let k = 1; k <= program.weeks; k++) {
    const range = weekRange(program.starts_on, k);
    const inWeek = ws.filter((w) => w.week === k && w.program_day_id);
    const instances = inWeek.map(instanceOf).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
    const wd: WeekDay[] = days.map((d) => {
      const own = inWeek.filter((w) => w.program_day_id === d.id);
      const inst = own.map(instanceOf)[0];
      const status: WeekDay["status"] = !inst ? "planned" : inst.status === "done" ? "done" : inst.status === "missed" || inst.status === "skipped" ? "missed" : "planned";
      return { dayId: d.id, name: d.name, status, sessions: own.filter((w) => w.status === "done").map(weekSession) };
    });
    const startsAt = Date.parse(`${range.from}T00:00:00Z`);
    weeks.push({
      number: k,
      startsAt,
      endsAt: startsAt + 7 * DAY_MS - 1,
      state: k < week ? "past" : k === week ? "current" : "future",
      startedEarly: false,
      deload: program.deload_weeks.includes(k),
      note: null,
      days: wd,
      done: wd.filter((d) => d.status === "done").length,
      other: ws.filter((w) => w.week === k && !w.program_day_id && w.status === "done").map(weekSession),
      instances,
    });
  }

  const current = weeks[week - 1];
  const open = (current?.instances ?? []).filter((i) => i.status === "planned");
  const todayInstance = (current?.instances ?? []).find((i) => i.date === todayDate && i.status !== "skipped") ?? null;
  const next = open.find((i) => i.date >= todayDate) ?? open[0] ?? weeks.slice(week).flatMap((w) => w.instances ?? []).find((i) => i.status === "planned") ?? null;
  const weekComplete = !!current && current.days.every((d) => d.status === "done");

  // Each day as its next session (its own list when the dated session has one).
  const nextOf = (d: DayRow) => ws.find((w) => w.id === (current?.instances ?? []).find((i) => i.templateDayId === d.id && i.status === "planned")?.id);
  const programDays = days.map((d) => toDay(c, d, nextOf(d)?.exercises ?? null));

  // Suggestions for the next day's exercises.
  const suggestions: Record<string, LoadSuggestion> = {};
  const nextDay = programDays.find((d) => d.id === next?.templateDayId) ?? programDays[0];
  for (const ex of nextDay?.exercises ?? []) {
    if (ex.kind === "cardio") continue;
    const personal = c.personal.find((p) => p.library_id === ex.exerciseId || p.id === ex.exerciseId);
    const history = personal ? await setsOf(ctx, personal.id) : [];
    const last = history[0];
    const unit = settings.exerciseUnits[ex.exerciseId] ?? settings.defaultUnit;
    const s = nextLoad({ sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax }, last ? last.sets.map(logged) : null, INCREMENT_KG[ex.equipment] ?? 2.5, unit, program.deload_weeks.includes(week));
    suggestions[ex.exerciseId] = { exerciseId: ex.exerciseId, weightKg: s.weightKg ?? ex.weightKg ?? null, reps: s.reps, reason: s.reason, lastSessionAt: last ? ms(last.workout.ended_at ?? last.workout.created_at) : null, sets: ex.sets, ...(s.deload ? { deload: true } : {}) };
  }

  const trainingBlock: TrainingBlock = {
    programId: program.id,
    number: 1,
    name: program.name,
    goal: program.goal,
    startedAt: Date.parse(`${program.starts_on}T00:00:00Z`),
    endedAt: program.ended_at ? ms(program.ended_at) : null,
    endReason: program.end_reason,
    active: program.active,
    resumedFrom: null,
    days: programDays,
    currentWeek: week,
    weekComplete,
    canStartNextWeek: false,
    finished: weekComplete && week >= program.weeks,
    weeks,
  };

  return {
    program: {
      id: program.id,
      name: program.name,
      goal: program.goal,
      weeks: program.weeks,
      notes: program.notes,
      active: program.active,
      createdAt: ms(program.created_at),
      days: programDays,
      deloadWeeks: program.deload_weeks,
      week,
    },
    nextDayId: nextDay?.id ?? null,
    todayInstance,
    nextInstanceId: next?.id ?? null,
    suggestions,
    hrZones: null,
    settings,
    blocks: [trainingBlock],
    adjustment: null,
    blockSignals: [],
    proposal: null,
  };
}

// ── Live session ──

async function liveRow(ctx: Ctx) {
  return maybe(await P(ctx).from("live_sessions").select("*").maybeSingle());
}

const asLive = (row: { data: unknown; version: number }): LiveSession => ({ ...(row.data as LiveSession), version: row.version });

function liveSummary(s: LiveSession): string {
  const done = s.exercises.reduce((t, e) => t + e.sets.filter((x) => x.doneAt).length, 0);
  const total = s.exercises.reduce((t, e) => t + e.sets.length, 0);
  return `${s.name}: ${done} de ${total} series`;
}

// ── Operations ──

export const trainingOps: OpTable = {
  async get_training_program(ctx) {
    return activeProgram(ctx);
  },
  async start_next_week() {
    throw new NotAvailableError("Empezar la semana antes de tiempo");
  },
  async dismiss_session_adjustment(ctx) {
    return activeProgram(ctx);
  },
  async clear_day_override(ctx, { dayId }) {
    const block = await getActiveProgram(ctx.db);
    if (block) ok(await P(ctx).from("workouts").update({ exercises: null }).eq("program_day_id", dayId).eq("status", "planned").is("started_at", null));
    return activeProgram(ctx);
  },
  async edit_program_day(ctx, { dayId, scope, instanceId, exercises }) {
    const list = exercises.map((e) => toDbExercise(e as Parameters<typeof toDbExercise>[0]));
    if (scope === "always") ok(await P(ctx).from("program_days").update({ exercises: list }).eq("id", dayId));
    else {
      const target =
        instanceId ??
        rows(await P(ctx).from("workouts").select("id, local_date").eq("program_day_id", dayId).eq("status", "planned").is("started_at", null).gte("local_date", today(ctx)).order("local_date").limit(1))[0]?.id;
      if (!target) throw new Error("Ese día no tiene una sesión pendiente.");
      ok(await P(ctx).from("workouts").update({ exercises: list }).eq("id", target));
    }
    return activeProgram(ctx);
  },
  async list_exercise_library(ctx) {
    const c = await catalog(ctx);
    const own = c.personal.filter((p) => !p.library_id).map((p) => exerciseOf(c, p.id));
    return { exercises: [...c.library.map((l) => exerciseOf(c, l.id)), ...own] };
  },
  async get_exercise(ctx, { exerciseId }) {
    const c = await catalog(ctx);
    const ex = exerciseOf(c, exerciseId);
    const personal = c.personal.find((p) => p.library_id === exerciseId || p.id === exerciseId);
    return {
      ...ex,
      nameEn: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      tips: [],
      media: { animation: null, thumbnail: null, source: null, attribution: null },
      videos: [],
      notes: personal?.notes ?? null,
    };
  },
  async exercise_history(ctx, { exerciseId, limit, withSets }) {
    const c = await catalog(ctx);
    const personal = c.personal.find((p) => p.library_id === exerciseId || p.id === exerciseId);
    const history = personal ? (await setsOf(ctx, personal.id)).slice(0, limit) : [];
    const points: HistoryPoint[] = history
      .map(({ workout, sets }) => {
        const work = sets.map(logged).filter((s) => s.reps > 0);
        const list: SetLog[] = sets.map((s) => ({ exerciseId, setIndex: s.set_no - 1, weightKg: n(s.weight_kg), reps: s.reps ?? 0, rpe: nn(s.rpe), doneAt: ms(s.done_at ?? s.created_at), ...(s.drops?.length ? { segments: s.drops } : {}) }));
        return {
          sessionId: workout.id,
          date: ms(workout.ended_at ?? workout.created_at),
          topWeightKg: work.length ? Math.max(...work.map((s) => s.weightKg)) : 0,
          bestE1rm: work.length ? Math.max(...work.map((s) => e1rm(s.weightKg, s.reps))) : 0,
          totalReps: work.reduce((t, s) => t + s.reps, 0),
          volumeKg: Math.round(work.reduce((t, s) => t + volumeOf(s), 0) * 10) / 10,
          sets: list,
        };
      })
      .reverse();
    return {
      exercise: exerciseOf(c, exerciseId),
      points: withSets ? points : points.map(({ sets: _s, ...p }) => p),
      bestE1rm: points.length ? Math.max(...points.map((p) => p.bestE1rm)) : null,
      heaviestKg: points.length ? Math.max(...points.map((p) => p.topWeightKg)) : null,
    };
  },
  async get_exercise_performance(ctx, { exerciseId }) {
    const history = (await trainingOps.exercise_history!(ctx, { exerciseId, limit: 200, withSets: true })).points;
    let maxWeight: { kg: number; reps: number; at: number } | null = null;
    let bestE1rm: { kg: number; at: number } | null = null;
    let maxVolume: { kg: number; at: number } | null = null;
    for (const p of history) {
      const reps = Math.max(0, ...(p.sets ?? []).filter((s) => s.weightKg === p.topWeightKg).map((s) => s.reps));
      if (p.topWeightKg > 0 && (!maxWeight || p.topWeightKg > maxWeight.kg || (p.topWeightKg === maxWeight.kg && reps > maxWeight.reps))) maxWeight = { kg: p.topWeightKg, reps, at: p.date };
      if (p.bestE1rm > (bestE1rm?.kg ?? 0)) bestE1rm = { kg: p.bestE1rm, at: p.date };
      if (p.volumeKg > (maxVolume?.kg ?? 0)) maxVolume = { kg: p.volumeKg, at: p.date };
    }
    return { exerciseId, maxWeight, bestE1rm, maxVolume, history: history.map((p) => ({ at: p.date, topWeightKg: p.topWeightKg, e1rm: p.bestE1rm, volumeKg: p.volumeKg })) };
  },
  async find_similar_exercises(ctx, { exerciseId, equipment: only, limit }) {
    const c = await catalog(ctx);
    const settings = await trainingSettings(ctx, c);
    const from = c.library.find((l) => l.id === exerciseId);
    const base = from ?? { id: exerciseId, ...(() => { const e = exerciseOf(c, exerciseId); return { muscle: e.muscle, secondary: e.secondary, kind: e.kind, equipment: e.equipment }; })() };
    const pool = only?.length ? c.library.filter((l) => only.includes(equipment(l.equipment))) : c.library;
    return {
      exercises: similarExercises(base, pool, settings.preferredEquipment, limit).map((s) => ({
        ...exerciseOf(c, s.exercise.id),
        score: Math.round(s.score),
        reasons: s.reasons,
        preferred: settings.preferredEquipment.includes(equipment(s.exercise.equipment)),
      })),
    };
  },
  async set_exercise_notes(ctx, { exerciseId, notes }) {
    const ex = await resolveExercise(ctx.db, exerciseId);
    ok(await P(ctx).from("exercises").update({ notes: notes?.trim() || null }).eq("id", ex.id));
    return { notes: notes?.trim() || null };
  },
  async set_exercise_unit(ctx, { exerciseId, unit }) {
    const ex = await resolveExercise(ctx.db, exerciseId);
    ok(await P(ctx).from("exercises").update({ unit }).eq("id", ex.id));
    return trainingSettings(ctx);
  },
  async get_training_preferences(ctx) {
    return trainingSettings(ctx);
  },
  async set_training_preferences(ctx, { preferredEquipment, defaultUnit }) {
    const s = maybe(await P(ctx).from("settings").select("*").maybeSingle()) as { training_prefs?: Prefs } | null;
    const patch: Record<string, unknown> = {};
    if (preferredEquipment) patch.training_prefs = { ...(s?.training_prefs ?? {}), preferredEquipment };
    if (defaultUnit) patch.weight_unit = defaultUnit;
    if (Object.keys(patch).length) ok(await P(ctx).from("settings").update(patch as never).eq("user_id", ctx.userId));
    return trainingSettings(ctx);
  },
  async get_live_session(ctx) {
    const row = await liveRow(ctx);
    if (!row) return { session: null };
    const session = asLive(row);
    return { session, summary: liveSummary(session) };
  },
  async put_live_session(ctx, { session, baseVersion }) {
    const row = await liveRow(ctx);
    const now = Date.now();
    if (row && row.version !== baseVersion && (row.data as LiveSession).id === session.id) return { session: asLive(row), conflict: true };
    const version = (row?.version ?? 0) + 1;
    const next = { ...(session as LiveSession), version, updatedAt: now };
    if (row) {
      // Compare-and-set: only the version this phone read may be replaced.
      const res = await P(ctx).from("live_sessions").update({ data: next as never, version, updated_at: iso(now) }).eq("user_id", ctx.userId).eq("version", row.version).select("*");
      const updated = rows(res)[0];
      if (!updated) {
        const latest = await liveRow(ctx);
        if (latest) return { session: asLive(latest), conflict: true };
      } else return { session: asLive(updated), conflict: false };
    }
    const inserted = one(await P(ctx).from("live_sessions").upsert({ user_id: ctx.userId, data: next as never, version, updated_at: iso(now) }).select("*").single());
    return { session: asLive(inserted), conflict: false };
  },
  async end_live_session(ctx) {
    ok(await P(ctx).from("live_sessions").delete().eq("user_id", ctx.userId));
    return { ok: true as const, saved: false };
  },
  async list_training_sessions(ctx) {
    const c = await catalog(ctx);
    return { sessions: await doneSessions(ctx, c, { limit: 60 }) };
  },
  async get_training_session(ctx, { id }) {
    const c = await catalog(ctx);
    const [session] = await doneSessions(ctx, c, { ids: [id] });
    if (!session) throw new Error("Esa sesión ya no existe.");
    return session;
  },
  async save_training_session(ctx, input) {
    const c = await catalog(ctx);
    const startedAt = new Date(input.startedAt);
    const date = localDate(startedAt, ctx.tz);
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // The dated session it did (instanceId), else the one already saved under this id, else a new row.
    const targetId = [input.instanceId, input.id].find((x) => x && UUID.test(x));
    const existing = targetId ? maybe(await P(ctx).from("workouts").select("*").eq("id", targetId).maybeSingle()) : null;
    const base = {
      title: input.name,
      status: "done" as const,
      started_at: iso(input.startedAt),
      ended_at: iso(Math.max(input.endedAt, input.startedAt)),
      notes: input.notes ?? null,
      local_date: date,
      program_id: input.programId && UUID.test(input.programId) ? input.programId : (existing?.program_id ?? null),
      program_day_id: input.dayId && UUID.test(input.dayId) ? input.dayId : (existing?.program_day_id ?? null),
      source: "pulso" as const,
    };
    let workout: Workout;
    if (existing) {
      workout = one(await P(ctx).from("workouts").update(base).eq("id", existing.id).select("*").single());
      ok(await P(ctx).from("workout_sets").delete().eq("workout_id", existing.id));
    } else {
      workout = one(await P(ctx).from("workouts").insert({ ...(UUID.test(input.id) ? { id: input.id } : {}), user_id: ctx.userId, ...base }).select("*").single());
    }

    // Previous bests per exercise, before this session's sets exist.
    const ids = [...new Set([...input.sets.map((s) => s.exerciseId), ...(input.cardio ?? []).map((x) => x.exerciseId)])];
    const personal = new Map<string, ExerciseRow>();
    for (const id of ids) personal.set(id, await resolveExercise(ctx.db, id));
    const before = new Map<string, LoggedSet[]>();
    for (const id of new Set(input.sets.map((s) => s.exerciseId))) before.set(id, (await setsOf(ctx, personal.get(id)!.id)).filter((h) => h.workout.id !== workout.id).flatMap((h) => h.sets.map(logged)));

    const setRows = [
      ...input.sets.map((s) => ({
        user_id: ctx.userId,
        workout_id: workout.id,
        exercise_id: personal.get(s.exerciseId)!.id,
        set_no: s.setIndex + 1,
        weight_kg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe ?? null,
        drops: s.segments?.length ? s.segments : null,
        done: true,
        done_at: iso(s.doneAt),
      })),
      ...(input.cardio ?? []).map((x, i) => ({
        user_id: ctx.userId,
        workout_id: workout.id,
        exercise_id: personal.get(x.exerciseId)!.id,
        set_no: i + 1,
        duration_s: x.durationSeconds,
        distance_km: x.distanceKm,
        level: x.level,
        incline_pct: x.inclinePercent,
        avg_hr: x.avgHr,
        kcal: x.kcal,
        done: true,
        done_at: iso(x.doneAt),
      })),
    ];
    // set_no must be unique per exercise in a workout: renumber in order.
    const counters = new Map<string, number>();
    for (const r of setRows) {
      const next = (counters.get(r.exercise_id) ?? 0) + 1;
      counters.set(r.exercise_id, next);
      r.set_no = next;
    }
    if (setRows.length) ok(await P(ctx).from("workout_sets").insert(setRows));
    const kcal = (input.cardio ?? []).reduce((t, x) => t + (x.kcal ?? 0), 0);
    if (kcal > 0) ok(await P(ctx).from("workouts").update({ energy_kcal: kcal }).eq("id", workout.id));

    const prs: PersonalRecord[] = [];
    for (const [id, prev] of before) {
      const now = input.sets.filter((s) => s.exerciseId === id).map((s) => ({ weightKg: s.weightKg, reps: s.reps, drops: s.segments ?? null }));
      for (const r of recordsFor(now, prev)) prs.push({ exerciseId: id, exerciseName: exerciseOf(c, id).name, kind: r.kind, value: r.value, previous: r.previous });
    }
    // The phone finished: the shared live session ends with it.
    const live = await liveRow(ctx);
    if (live && (live.data as LiveSession).id === input.id) ok(await P(ctx).from("live_sessions").delete().eq("user_id", ctx.userId));
    const [session] = await doneSessions(ctx, await catalog(ctx), { ids: [workout.id] });
    return { session: session!, prs };
  },
};

