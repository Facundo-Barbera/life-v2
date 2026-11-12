// Entreno on Supabase: blocks (programs) and their days, the dated sessions
// (pulso.workouts) materialized for every week of the active block, the
// session in progress and its sets, history, exercises, and Apple Health
// workouts. Pure math lives in training-logic.ts.
import type { LifeClient } from "../index";
import type {
  Exercise,
  HealthWorkout,
  LibraryExercise,
  ProgramDay,
  ProgramExercise,
  Program,
  SetDrop,
  WeightUnit,
  Workout,
  WorkoutSet,
} from "../types";
import { must, pulso, PulsoError, userId } from "./core";
import { addDays, localDate, zonedInstant } from "./dates";
import { getSettings } from "./settings";
import {
  currentWeek,
  estimateMinutes,
  INCREMENT_KG,
  missingSessions,
  nextLoad,
  performance,
  prescribedSets,
  sessionStatus,
  similarExercises,
  weekOf,
  weekRange,
  type LoadSuggestion,
  type LoggedSet,
  type Performance,
  type SessionStatus,
  type SimilarExercise,
} from "./training-logic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export async function listLibrary(client: LifeClient): Promise<LibraryExercise[]> {
  return must(await pulso(client).from("exercise_library").select("*").order("muscle").order("name"));
}

export async function listPersonalExercises(client: LifeClient): Promise<Exercise[]> {
  return must(await pulso(client).from("exercises").select("*").order("name"));
}

/**
 * The person's row for an exercise id: a personal uuid as is, a library slug
 * through its personal row (created the first time it is used).
 */
export async function resolveExercise(client: LifeClient, id: string): Promise<Exercise> {
  const uid = await userId(client);
  if (isUuid(id)) return must(await pulso(client).from("exercises").select("*").eq("id", id).single());
  const found = await pulso(client).from("exercises").select("*").eq("library_id", id).maybeSingle();
  if (found.data) return found.data;
  const lib = must(await pulso(client).from("exercise_library").select("*").eq("id", id).single());
  const inserted = await pulso(client)
    .from("exercises")
    .insert({
      user_id: uid,
      name: lib.name,
      library_id: lib.id,
      muscle_group: String(lib.muscle),
      secondary: lib.secondary,
      equipment: String(lib.equipment),
      kind: lib.kind,
    })
    .select("*")
    .single();
  if (inserted.error?.code === "23505") return must(await pulso(client).from("exercises").select("*").eq("library_id", id).single());
  return must(inserted);
}

/** A personal exercise made by the person (not in the library). */
export async function createExercise(client: LifeClient, input: { name: string; muscle: string; equipment: string; kind: "compound" | "isolation" | "cardio" }): Promise<Exercise> {
  const uid = await userId(client);
  const name = input.name.trim();
  if (!name) throw new PulsoError("Ponle nombre al ejercicio.", "invalid");
  return must(
    await pulso(client)
      .from("exercises")
      .insert({ user_id: uid, name, muscle_group: input.muscle, equipment: input.equipment, kind: input.kind })
      .select("*")
      .single(),
  );
}

/** The kg/lb an exercise's equipment uses; weights stay kg. */
export async function setExerciseUnit(client: LifeClient, id: string, unit: WeightUnit | null): Promise<void> {
  const ex = await resolveExercise(client, id);
  must(await pulso(client).from("exercises").update({ unit }).eq("id", ex.id).select("id").single());
}

export async function setExerciseNotes(client: LifeClient, id: string, notes: string | null): Promise<void> {
  const ex = await resolveExercise(client, id);
  must(await pulso(client).from("exercises").update({ notes }).eq("id", ex.id).select("id").single());
}

/** Library-shaped view of a personal exercise (for similarity and display). */
export function asLibrary(e: Exercise, library: LibraryExercise[]): LibraryExercise {
  const lib = e.library_id ? library.find((l) => l.id === e.library_id) : undefined;
  return lib ?? { id: e.id, name: e.name, muscle: e.muscle_group ?? "full_body", secondary: e.secondary, equipment: e.equipment ?? "bodyweight", kind: e.kind ?? "compound", cardio_modality: null };
}

// ---------------------------------------------------------------------------
// Blocks and days
// ---------------------------------------------------------------------------

export type Block = { program: Program; days: ProgramDay[] };

export async function listPrograms(client: LifeClient): Promise<Program[]> {
  return must(await pulso(client).from("programs").select("*").order("created_at", { ascending: false }));
}

export async function getProgram(client: LifeClient, id: string): Promise<Block> {
  const program = must(await pulso(client).from("programs").select("*").eq("id", id).single());
  const days = must(await pulso(client).from("program_days").select("*").eq("program_id", id).order("position"));
  return { program, days };
}

export async function getActiveProgram(client: LifeClient): Promise<Block | null> {
  const found = await pulso(client).from("programs").select("*").eq("active", true).maybeSingle();
  if (!found.data) return null;
  const days = must(await pulso(client).from("program_days").select("*").eq("program_id", found.data.id).order("position"));
  return { program: found.data, days };
}

export type ProgramInput = { name: string; goal?: string; weeks: number; startsOn: string; notes?: string | null; deloadWeeks?: number[] };

export async function createProgram(client: LifeClient, input: ProgramInput, activate = false): Promise<Program> {
  const uid = await userId(client);
  if (!input.name.trim()) throw new PulsoError("Ponle nombre al bloque.", "invalid");
  if (!(input.weeks >= 1 && input.weeks <= 52)) throw new PulsoError("Un bloque dura de 1 a 52 semanas.", "invalid");
  const program = must(
    await pulso(client)
      .from("programs")
      .insert({
        user_id: uid,
        name: input.name.trim(),
        goal: input.goal?.trim() || "hipertrofia",
        weeks: input.weeks,
        starts_on: input.startsOn,
        notes: input.notes ?? null,
        deload_weeks: input.deloadWeeks ?? [],
      })
      .select("*")
      .single(),
  );
  if (activate) await activateProgram(client, program.id);
  return program;
}

export async function updateProgram(client: LifeClient, id: string, input: Partial<ProgramInput>): Promise<void> {
  const patch: Partial<Program> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.goal !== undefined) patch.goal = input.goal.trim() || "hipertrofia";
  if (input.weeks !== undefined) patch.weeks = input.weeks;
  if (input.startsOn !== undefined) patch.starts_on = input.startsOn;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.deloadWeeks !== undefined) patch.deload_weeks = input.deloadWeeks;
  must(await pulso(client).from("programs").update(patch).eq("id", id).select("id").single());
  // Dates may have moved: planned sessions not started follow the new weeks.
  if (input.startsOn !== undefined || input.weeks !== undefined) await resyncPlanned(client, id);
}

/** Makes a block the active one; the previous active block ends ("reemplazado"). */
export async function activateProgram(client: LifeClient, id: string): Promise<void> {
  const now = new Date().toISOString();
  must(await pulso(client).from("programs").update({ active: false, ended_at: now, end_reason: "reemplazado" }).eq("active", true).neq("id", id).select("id"));
  must(await pulso(client).from("programs").update({ active: true, ended_at: null, end_reason: null }).eq("id", id).select("id").single());
}

/** Ends the active block; its planned sessions from today on are removed (done ones stay). */
export async function endProgram(client: LifeClient, id: string, reason = "terminado"): Promise<void> {
  const { timezone } = await getSettings(client);
  const today = localDate(new Date(), timezone);
  must(await pulso(client).from("programs").update({ active: false, ended_at: new Date().toISOString(), end_reason: reason }).eq("id", id).select("id").single());
  must(await pulso(client).from("workouts").delete().eq("program_id", id).eq("status", "planned").is("started_at", null).gte("local_date", today).select("id"));
}

export async function deleteProgram(client: LifeClient, id: string): Promise<void> {
  // Planned, never started sessions go with it; done ones stay in the history (program_id set null).
  must(await pulso(client).from("workouts").delete().eq("program_id", id).eq("status", "planned").is("started_at", null).select("id"));
  must(await pulso(client).from("programs").delete().eq("id", id).select("id"));
}

export type DayInput = { name: string; focus?: string | null; weekday?: number | null; time?: string | null; durationMin?: number | null };

export async function addDay(client: LifeClient, programId: string, input: DayInput): Promise<ProgramDay> {
  const uid = await userId(client);
  const last = must(await pulso(client).from("program_days").select("position").eq("program_id", programId).order("position", { ascending: false }).limit(1));
  const day = must(
    await pulso(client)
      .from("program_days")
      .insert({
        user_id: uid,
        program_id: programId,
        position: (last[0]?.position ?? -1) + 1,
        name: input.name.trim() || "Día",
        focus: input.focus ?? null,
        weekday: input.weekday ?? null,
        time: input.time ?? null,
        duration_min: input.durationMin ?? null,
      })
      .select("*")
      .single(),
  );
  return day;
}

export async function updateDay(client: LifeClient, dayId: string, input: Partial<DayInput>): Promise<void> {
  const patch: Partial<ProgramDay> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || "Día";
  if (input.focus !== undefined) patch.focus = input.focus;
  if (input.weekday !== undefined) patch.weekday = input.weekday;
  if (input.time !== undefined) patch.time = input.time;
  if (input.durationMin !== undefined) patch.duration_min = input.durationMin;
  const day = must(await pulso(client).from("program_days").update(patch).eq("id", dayId).select("*").single());
  await resyncPlanned(client, day.program_id);
}

export async function deleteDay(client: LifeClient, dayId: string): Promise<void> {
  must(await pulso(client).from("workouts").delete().eq("program_day_id", dayId).eq("status", "planned").is("started_at", null).select("id"));
  must(await pulso(client).from("program_days").delete().eq("id", dayId).select("id"));
}

export async function moveDay(client: LifeClient, dayId: string, delta: -1 | 1): Promise<void> {
  const day = must(await pulso(client).from("program_days").select("*").eq("id", dayId).single());
  const days = must(await pulso(client).from("program_days").select("id, position").eq("program_id", day.program_id).order("position"));
  const i = days.findIndex((d) => d.id === dayId);
  const j = i + delta;
  if (j < 0 || j >= days.length) return;
  const other = days[j]!;
  must(await pulso(client).from("program_days").update({ position: other.position }).eq("id", dayId).select("id"));
  must(await pulso(client).from("program_days").update({ position: day.position }).eq("id", other.id).select("id"));
}

/** Replaces a day's prescribed exercises (the template every dated session without its own list follows). */
export async function setDayExercises(client: LifeClient, dayId: string, exercises: ProgramExercise[]): Promise<void> {
  must(await pulso(client).from("program_days").update({ exercises }).eq("id", dayId).select("id").single());
}

// ---------------------------------------------------------------------------
// Dated sessions
// ---------------------------------------------------------------------------

function plannedAt(date: string | null, time: string | null, tz: string): string | null {
  if (!date || !time) return null;
  return zonedInstant(date, time.slice(0, 5), tz).toISOString();
}

/** Creates the block's missing dated sessions (one per day and week). Idempotent. */
export async function ensureBlockSessions(client: LifeClient, block: Block): Promise<void> {
  if (block.days.length === 0) return;
  const uid = await userId(client);
  const { timezone } = await getSettings(client);
  const existing = must(await pulso(client).from("workouts").select("program_day_id, week").eq("program_id", block.program.id));
  const missing = missingSessions(block.program, block.days, existing);
  if (missing.length === 0) return;
  const byId = new Map(block.days.map((d) => [d.id, d]));
  const rows = missing.map((m) => {
    const day = byId.get(m.dayId)!;
    return {
      user_id: uid,
      title: day.name,
      focus: day.focus,
      status: "planned" as const,
      program_id: block.program.id,
      program_day_id: day.id,
      week: m.week,
      local_date: m.date,
      planned_at: plannedAt(m.date, day.time, timezone),
    };
  });
  const res = await pulso(client).from("workouts").insert(rows).select("id");
  // Another tab materialized some at the same time (workouts_day_week_uidx): insert the rest one by one.
  if (res.error) {
    if (res.error.code !== "23505") throw new PulsoError(`No se pudieron preparar las sesiones: ${res.error.message}`);
    for (const row of rows) {
      const r = await pulso(client).from("workouts").insert(row).select("id");
      if (r.error && r.error.code !== "23505") throw new PulsoError(`No se pudieron preparar las sesiones: ${r.error.message}`);
    }
  }
}

/** Planned, not started sessions of a block follow their day's weekday, time and name again. */
async function resyncPlanned(client: LifeClient, programId: string): Promise<void> {
  const { timezone } = await getSettings(client);
  const block = await getProgram(client, programId);
  const today = localDate(new Date(), timezone);
  const rows = must(await pulso(client).from("workouts").select("*").eq("program_id", programId).eq("status", "planned").is("started_at", null));
  for (const w of rows) {
    const day = block.days.find((d) => d.id === w.program_day_id);
    if (!day || !w.week) continue;
    if (w.week > block.program.weeks) {
      must(await pulso(client).from("workouts").delete().eq("id", w.id).select("id"));
      continue;
    }
    if (w.local_date && w.local_date < today) continue;
    const range = weekRange(block.program.starts_on, w.week);
    const date = day.weekday ? addDays(range.from, day.weekday - 1) : null;
    if (date && date < today) continue;
    must(
      await pulso(client)
        .from("workouts")
        .update({ title: day.name, focus: day.focus, local_date: date, planned_at: plannedAt(date, day.time, timezone) })
        .eq("id", w.id)
        .select("id"),
    );
  }
}

/** Moves a planned session to another date (and time). */
export async function moveSession(client: LifeClient, id: string, date: string, time: string | null): Promise<void> {
  const { timezone } = await getSettings(client);
  must(await pulso(client).from("workouts").update({ local_date: date, planned_at: plannedAt(date, time, timezone) }).eq("id", id).select("id").single());
}

export async function skipSession(client: LifeClient, id: string, skip = true): Promise<void> {
  must(await pulso(client).from("workouts").update({ status: skip ? "skipped" : "planned" }).eq("id", id).select("id").single());
}

export type SessionView = {
  workout: Workout;
  status: SessionStatus;
  sets: number;
  prescribed: number;
  exercises: ProgramExercise[];
  minutes: number;
};

async function setCounts(client: LifeClient, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = must(await pulso(client).from("workout_sets").select("workout_id").in("workout_id", ids).eq("done", true));
  for (const r of rows) counts.set(r.workout_id, (counts.get(r.workout_id) ?? 0) + 1);
  return counts;
}

function view(w: Workout, days: ProgramDay[], counts: Map<string, number>, today: string): SessionView {
  const exercises = w.exercises ?? days.find((d) => d.id === w.program_day_id)?.exercises ?? [];
  const prescribed = prescribedSets(exercises);
  const sets = counts.get(w.id) ?? 0;
  return { workout: w, status: sessionStatus(w, today, sets, prescribed), sets, prescribed, exercises, minutes: estimateMinutes(exercises) };
}

export type BlockWeek = { number: number; from: string; to: string; deload: boolean; sessions: SessionView[] };

export type EntrenoOverview = {
  today: string;
  timezone: string;
  unit: WeightUnit;
  block: Block | null;
  currentWeek: number | null;
  weeks: BlockWeek[];
  inProgress: Workout | null;
  next: SessionView | null;
  history: HistoryItem[];
};

/** Everything the Entreno page shows; materializes the active block's sessions first. */
export async function getEntrenoOverview(client: LifeClient): Promise<EntrenoOverview> {
  const settings = await getSettings(client);
  const today = localDate(new Date(), settings.timezone);
  const block = await getActiveProgram(client);
  const inProgress = await getInProgress(client);
  const history = await listHistory(client, 12);
  if (!block) return { today, timezone: settings.timezone, unit: settings.weight_unit, block: null, currentWeek: null, weeks: [], inProgress, next: null, history };
  await ensureBlockSessions(client, block);
  const rows = must(await pulso(client).from("workouts").select("*").eq("program_id", block.program.id).order("week").order("local_date", { nullsFirst: false }));
  const counts = await setCounts(client, rows.filter((r) => r.status === "done" || r.started_at).map((r) => r.id));
  const views = rows.map((w) => view(w, block.days, counts, today));
  const weeks: BlockWeek[] = [];
  for (let n = 1; n <= block.program.weeks; n++) {
    const range = weekRange(block.program.starts_on, n);
    weeks.push({ number: n, ...range, deload: block.program.deload_weeks.includes(n), sessions: views.filter((v) => v.workout.week === n) });
  }
  const week = currentWeek(block.program.starts_on, block.program.weeks, today);
  return { today, timezone: settings.timezone, unit: settings.weight_unit, block, currentWeek: week, weeks, inProgress, next: pickNext(views, today, week), history };
}

/** Today's planned session, else the first planned one from today on, else the current week's first undated one. */
function pickNext(views: SessionView[], today: string, week: number): SessionView | null {
  const open = views.filter((v) => v.status === "planned");
  const dated = open.filter((v) => v.workout.local_date && v.workout.local_date >= today).sort((a, b) => a.workout.local_date!.localeCompare(b.workout.local_date!));
  return dated[0] ?? open.find((v) => !v.workout.local_date && (v.workout.week ?? 0) >= week) ?? null;
}

// ---------------------------------------------------------------------------
// The session in progress
// ---------------------------------------------------------------------------

export async function getInProgress(client: LifeClient): Promise<Workout | null> {
  const rows = must(await pulso(client).from("workouts").select("*").not("started_at", "is", null).is("ended_at", null).neq("status", "done").order("started_at", { ascending: false }).limit(1));
  return rows[0] ?? null;
}

async function resolveList(client: LifeClient, exercises: ProgramExercise[]): Promise<ProgramExercise[]> {
  const out: ProgramExercise[] = [];
  for (const e of exercises) {
    const ex = await resolveExercise(client, e.exerciseId);
    out.push({ ...e, exerciseId: ex.id, name: e.name || ex.name, muscle: e.muscle ?? ex.muscle_group });
  }
  return out;
}

/**
 * Starts a session: a dated one (`workoutId`), a block day outside the plan
 * (`dayId`), or an empty one. Only one runs at a time: with one in progress,
 * that one is returned. The session's exercise list is copied (with personal
 * exercise ids) so it can change without touching the template.
 */
export async function startSession(client: LifeClient, from: { workoutId?: string; dayId?: string; title?: string }): Promise<Workout> {
  const open = await getInProgress(client);
  if (open) return open;
  const uid = await userId(client);
  const now = new Date().toISOString();
  const { timezone } = await getSettings(client);
  const today = localDate(new Date(), timezone);
  if (from.workoutId) {
    const w = must(await pulso(client).from("workouts").select("*").eq("id", from.workoutId).single());
    if (w.status === "done") throw new PulsoError("Esa sesión ya está hecha.", "conflict");
    const day = w.program_day_id ? (await pulso(client).from("program_days").select("*").eq("id", w.program_day_id).maybeSingle()).data : null;
    const exercises = await resolveList(client, w.exercises ?? day?.exercises ?? []);
    return must(
      await pulso(client)
        .from("workouts")
        .update({ started_at: now, status: "planned", exercises, local_date: today })
        .eq("id", w.id)
        .select("*")
        .single(),
    );
  }
  if (from.dayId) {
    const day = must(await pulso(client).from("program_days").select("*").eq("id", from.dayId).single());
    const program = must(await pulso(client).from("programs").select("*").eq("id", day.program_id).single());
    const exercises = await resolveList(client, day.exercises);
    // Doing a block day off-plan counts for that week's dated session when it is still open.
    const week = weekOf(program.starts_on, today);
    const dated = await pulso(client).from("workouts").select("*").eq("program_day_id", day.id).eq("week", week).maybeSingle();
    if (dated.data && dated.data.status !== "done" && !dated.data.started_at) {
      return must(await pulso(client).from("workouts").update({ started_at: now, status: "planned", exercises, local_date: today }).eq("id", dated.data.id).select("*").single());
    }
    return must(
      await pulso(client)
        .from("workouts")
        .insert({ user_id: uid, title: day.name, focus: day.focus, program_id: program.id, program_day_id: day.id, started_at: now, local_date: today, exercises, source: "pulso" })
        .select("*")
        .single(),
    );
  }
  return must(
    await pulso(client)
      .from("workouts")
      .insert({ user_id: uid, title: from.title?.trim() || "Sesión libre", started_at: now, local_date: today, exercises: [], source: "pulso" })
      .select("*")
      .single(),
  );
}

export async function setSessionExercises(client: LifeClient, workoutId: string, exercises: ProgramExercise[]): Promise<void> {
  const list = await resolveList(client, exercises);
  must(await pulso(client).from("workouts").update({ exercises: list }).eq("id", workoutId).select("id").single());
}

/** Adds an exercise (library slug or personal id) at the end of the session, with the day's usual prescription. */
export async function addSessionExercise(client: LifeClient, workoutId: string, exerciseId: string, rx?: Partial<ProgramExercise>): Promise<void> {
  const w = must(await pulso(client).from("workouts").select("*").eq("id", workoutId).single());
  const ex = await resolveExercise(client, exerciseId);
  const cardio = ex.kind === "cardio";
  const item: ProgramExercise = { exerciseId: ex.id, name: ex.name, muscle: ex.muscle_group, sets: cardio ? 1 : 3, repMin: 8, repMax: 12, restSeconds: 90, ...(cardio ? { cardio: { minutes: 20 } } : {}), ...rx };
  must(await pulso(client).from("workouts").update({ exercises: [...(w.exercises ?? []), item] }).eq("id", workoutId).select("id").single());
}

/** Swaps the exercise at `index` for another, keeping its prescription. Sets already logged stay with the old one. */
export async function swapSessionExercise(client: LifeClient, workoutId: string, index: number, exerciseId: string): Promise<void> {
  const w = must(await pulso(client).from("workouts").select("*").eq("id", workoutId).single());
  const list = [...(w.exercises ?? [])];
  const current = list[index];
  if (!current) throw new PulsoError("Ese ejercicio ya no está en la sesión.", "not_found");
  const ex = await resolveExercise(client, exerciseId);
  list[index] = { ...current, exerciseId: ex.id, name: ex.name, muscle: ex.muscle_group, weightKg: null };
  must(await pulso(client).from("workouts").update({ exercises: list }).eq("id", workoutId).select("id").single());
}

export async function removeSessionExercise(client: LifeClient, workoutId: string, index: number): Promise<void> {
  const w = must(await pulso(client).from("workouts").select("*").eq("id", workoutId).single());
  const list = (w.exercises ?? []).filter((_, i) => i !== index);
  must(await pulso(client).from("workouts").update({ exercises: list }).eq("id", workoutId).select("id").single());
}

export type SetInput = {
  weightKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  drops?: SetDrop[] | null;
  durationS?: number | null;
  distanceKm?: number | null;
  level?: number | null;
  inclinePct?: number | null;
  avgHr?: number | null;
  kcal?: number | null;
};

export async function logSet(client: LifeClient, workoutId: string, exerciseId: string, input: SetInput): Promise<WorkoutSet> {
  const uid = await userId(client);
  const cardio = input.durationS != null;
  if (!cardio && !(input.reps != null && input.reps > 0)) throw new PulsoError("Anota cuántas repeticiones hiciste.", "invalid");
  const last = must(await pulso(client).from("workout_sets").select("set_no").eq("workout_id", workoutId).eq("exercise_id", exerciseId).order("set_no", { ascending: false }).limit(1));
  return must(
    await pulso(client)
      .from("workout_sets")
      .insert({
        user_id: uid,
        workout_id: workoutId,
        exercise_id: exerciseId,
        set_no: (last[0]?.set_no ?? 0) + 1,
        weight_kg: input.weightKg ?? (cardio ? null : 0),
        reps: input.reps ?? null,
        rpe: input.rpe ?? null,
        drops: input.drops?.length ? input.drops : null,
        duration_s: input.durationS ?? null,
        distance_km: input.distanceKm ?? null,
        level: input.level ?? null,
        incline_pct: input.inclinePct ?? null,
        avg_hr: input.avgHr ?? null,
        kcal: input.kcal ?? null,
        done: true,
        done_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
  );
}

export async function deleteSet(client: LifeClient, setId: string): Promise<void> {
  must(await pulso(client).from("workout_sets").delete().eq("id", setId).select("id"));
}

/** Finishes a session: done, ended now. Its exercise list stays as the record of what was done. */
export async function finishSession(client: LifeClient, workoutId: string, notes?: string | null): Promise<void> {
  const sets = must(await pulso(client).from("workout_sets").select("id, kcal").eq("workout_id", workoutId));
  if (sets.length === 0) throw new PulsoError("La sesión no tiene ninguna serie. Anota alguna o cancélala.", "invalid");
  const kcal = sets.reduce((n, s) => n + (s.kcal ?? 0), 0);
  must(
    await pulso(client)
      .from("workouts")
      .update({ status: "done", ended_at: new Date().toISOString(), notes: notes ?? null, ...(kcal > 0 ? { energy_kcal: kcal } : {}) })
      .eq("id", workoutId)
      .select("id")
      .single(),
  );
}

/** Cancels the session in progress: its sets go; a dated session goes back to planned, an off-plan one is deleted. */
export async function cancelSession(client: LifeClient, workoutId: string): Promise<void> {
  const w = must(await pulso(client).from("workouts").select("*").eq("id", workoutId).single());
  must(await pulso(client).from("workout_sets").delete().eq("workout_id", workoutId).select("id"));
  if (w.week != null && w.program_day_id) {
    must(await pulso(client).from("workouts").update({ started_at: null, ended_at: null, exercises: null, status: "planned" }).eq("id", workoutId).select("id"));
  } else {
    must(await pulso(client).from("workouts").delete().eq("id", workoutId).select("id"));
  }
}

export async function deleteSession(client: LifeClient, workoutId: string): Promise<void> {
  must(await pulso(client).from("health_workouts").update({ workout_id: null }).eq("workout_id", workoutId).select("id"));
  must(await pulso(client).from("workouts").delete().eq("id", workoutId).select("id"));
}

const toLogged = (s: Pick<WorkoutSet, "weight_kg" | "reps" | "drops">): LoggedSet => ({ weightKg: s.weight_kg ?? 0, reps: s.reps ?? 0, drops: s.drops });

export type SessionExercise = {
  index: number;
  rx: ProgramExercise;
  exercise: Exercise;
  unit: WeightUnit;
  cardio: boolean;
  sets: WorkoutSet[];
  /** The last earlier session's sets on this exercise. */
  previous: { at: string; sets: WorkoutSet[] } | null;
  suggestion: LoadSuggestion | null;
};

export type SessionDetail = {
  workout: Workout;
  exercises: SessionExercise[];
  /** Sets logged for exercises no longer in the list (after a swap). */
  orphanSets: (WorkoutSet & { name: string })[];
  deload: boolean;
  restSeconds: number;
  defaultUnit: WeightUnit;
};

/** A session (in progress or done) with each exercise's sets, last time and the suggested load. */
export async function getSession(client: LifeClient, workoutId: string): Promise<SessionDetail> {
  const settings = await getSettings(client);
  const workout = must(await pulso(client).from("workouts").select("*").eq("id", workoutId).single());
  const sets = must(await pulso(client).from("workout_sets").select("*").eq("workout_id", workoutId).order("set_no"));
  let list = workout.exercises;
  if (!list) {
    const day = workout.program_day_id ? (await pulso(client).from("program_days").select("*").eq("id", workout.program_day_id).maybeSingle()).data : null;
    list = day?.exercises ?? [];
  }
  const ids = [...new Set([...list.map((e) => e.exerciseId), ...sets.map((s) => s.exercise_id)])];
  const uuids = ids.filter(isUuid);
  const slugs = ids.filter((i) => !isUuid(i));
  const personal = uuids.length ? must(await pulso(client).from("exercises").select("*").in("id", uuids)) : [];
  const bySlug = slugs.length ? must(await pulso(client).from("exercises").select("*").in("library_id", slugs)) : [];
  const lib = slugs.length ? must(await pulso(client).from("exercise_library").select("*").in("id", slugs)) : [];
  const find = (id: string): Exercise | null => {
    if (isUuid(id)) return personal.find((e) => e.id === id) ?? null;
    const own = bySlug.find((e) => e.library_id === id);
    if (own) return own;
    const l = lib.find((x) => x.id === id);
    return l ? { id: l.id, user_id: "", name: l.name, muscle_group: String(l.muscle), library_id: l.id, secondary: l.secondary, equipment: String(l.equipment), kind: l.kind, unit: null, notes: null, created_at: "", updated_at: "" } : null;
  };
  const program = workout.program_id ? (await pulso(client).from("programs").select("*").eq("id", workout.program_id).maybeSingle()).data : null;
  const deload = !!(program && workout.week && program.deload_weeks.includes(workout.week));
  const exercises: SessionExercise[] = [];
  for (const [index, rx] of list.entries()) {
    const ex = find(rx.exerciseId);
    if (!ex) continue;
    const unit = ex.unit ?? settings.weight_unit;
    const cardio = ex.kind === "cardio" || !!rx.cardio;
    const own = sets.filter((s) => s.exercise_id === ex.id);
    const previous = isUuid(ex.id) ? await lastSessionSets(client, ex.id, workoutId, workout.started_at ?? workout.created_at) : null;
    const suggestion = cardio ? null : nextLoad(rx, previous ? previous.sets.map(toLogged) : null, INCREMENT_KG[ex.equipment ?? ""] ?? 2.5, unit, deload);
    exercises.push({ index, rx, exercise: ex, unit, cardio, sets: own, previous, suggestion });
  }
  const listed = new Set(exercises.map((e) => e.exercise.id));
  const orphanSets = sets.filter((s) => !listed.has(s.exercise_id)).map((s) => ({ ...s, name: find(s.exercise_id)?.name ?? "Ejercicio" }));
  return { workout, exercises, orphanSets, deload, restSeconds: settings.rest_seconds, defaultUnit: settings.weight_unit };
}

async function lastSessionSets(client: LifeClient, exerciseId: string, excludeWorkout: string, before: string): Promise<{ at: string; sets: WorkoutSet[] } | null> {
  const rows = must(
    await pulso(client)
      .from("workout_sets")
      .select("*")
      .eq("exercise_id", exerciseId)
      .neq("workout_id", excludeWorkout)
      .lt("created_at", before)
      .order("created_at", { ascending: false })
      .limit(30),
  );
  const first = rows[0];
  if (!first) return null;
  const sets = rows.filter((r) => r.workout_id === first.workout_id).sort((a, b) => a.set_no - b.set_no);
  return { at: first.done_at ?? first.created_at, sets };
}

// ---------------------------------------------------------------------------
// History and exercises
// ---------------------------------------------------------------------------

export type HistoryItem = { workout: Workout; sets: number; volumeKg: number; minutes: number | null };

const minutesOf = (w: Pick<Workout, "started_at" | "ended_at">) => (w.started_at && w.ended_at ? Math.round((Date.parse(w.ended_at) - Date.parse(w.started_at)) / 60_000) : null);

export async function listHistory(client: LifeClient, limit = 30, offset = 0): Promise<HistoryItem[]> {
  const rows = must(await pulso(client).from("workouts").select("*").eq("status", "done").order("ended_at", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1));
  if (rows.length === 0) return [];
  const sets = must(await pulso(client).from("workout_sets").select("workout_id, weight_kg, reps, drops").in("workout_id", rows.map((r) => r.id)));
  return rows.map((w) => {
    const own = sets.filter((s) => s.workout_id === w.id);
    const volumeKg = Math.round(own.reduce((n, s) => n + toLogged(s).weightKg * toLogged(s).reps + (s.drops ?? []).reduce((m, d) => m + d.weightKg * d.reps, 0), 0));
    return { workout: w, sets: own.length, volumeKg, minutes: minutesOf(w) };
  });
}

export type ExerciseDetail = {
  exercise: Exercise | null;
  library: LibraryExercise | null;
  name: string;
  unit: WeightUnit;
  performance: Performance;
  sessions: { workoutId: string; title: string; at: string; sets: WorkoutSet[] }[];
  similar: SimilarExercise[];
};

/** An exercise by personal id or library slug: its records, sessions and alternatives. Reading never creates rows. */
export async function getExerciseDetail(client: LifeClient, id: string): Promise<ExerciseDetail> {
  const settings = await getSettings(client);
  const libraryAll = await listLibrary(client);
  let exercise: Exercise | null = null;
  if (isUuid(id)) exercise = must(await pulso(client).from("exercises").select("*").eq("id", id).single());
  else exercise = (await pulso(client).from("exercises").select("*").eq("library_id", id).maybeSingle()).data ?? null;
  const library = libraryAll.find((l) => l.id === (exercise?.library_id ?? id)) ?? null;
  if (!exercise && !library) throw new PulsoError("Ese ejercicio no existe.", "not_found");
  const sets = exercise ? must(await pulso(client).from("workout_sets").select("*").eq("exercise_id", exercise.id).order("created_at", { ascending: false }).limit(400)) : [];
  const workoutIds = [...new Set(sets.map((s) => s.workout_id))];
  const workouts = workoutIds.length ? must(await pulso(client).from("workouts").select("id, title, started_at, ended_at, created_at").in("id", workoutIds)) : [];
  const sessions = workoutIds.map((wid) => {
    const w = workouts.find((x) => x.id === wid);
    return { workoutId: wid, title: w?.title ?? "Sesión", at: w?.started_at ?? w?.created_at ?? "", sets: sets.filter((s) => s.workout_id === wid).sort((a, b) => a.set_no - b.set_no) };
  });
  const self = exercise ? asLibrary(exercise, libraryAll) : library!;
  return {
    exercise,
    library,
    name: exercise?.name ?? library!.name,
    unit: exercise?.unit ?? settings.weight_unit,
    performance: performance(sessions.map((s) => ({ at: s.at, sets: s.sets.map(toLogged) }))),
    sessions,
    similar: similarExercises(self, libraryAll, [], 8),
  };
}

// ---------------------------------------------------------------------------
// Apple Health workouts
// ---------------------------------------------------------------------------

export type HealthWorkoutView = HealthWorkout & { linked: Pick<Workout, "id" | "title"> | null; candidates: Pick<Workout, "id" | "title" | "started_at">[] };

/** Recent Apple Health workouts with the Pulso session each is linked to and the ones it could be (overlapping in time). */
export async function listHealthWorkouts(client: LifeClient, days = 30): Promise<HealthWorkoutView[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = must(await pulso(client).from("health_workouts").select("*").gte("started_at", since).order("started_at", { ascending: false }));
  if (rows.length === 0) return [];
  const sessions = must(await pulso(client).from("workouts").select("id, title, started_at, ended_at").eq("status", "done").gte("started_at", new Date(Date.parse(since) - 86_400_000).toISOString()));
  const near = (h: HealthWorkout) =>
    sessions.filter((s) => s.started_at && Math.abs(Date.parse(s.started_at) - Date.parse(h.started_at)) < 3 * 3_600_000).map((s) => ({ id: s.id, title: s.title, started_at: s.started_at }));
  return rows.map((h) => {
    const linked = h.workout_id ? sessions.find((s) => s.id === h.workout_id) ?? null : null;
    return { ...h, linked: linked ? { id: linked.id, title: linked.title } : h.workout_id ? { id: h.workout_id, title: "Sesión" } : null, candidates: near(h) };
  });
}

/** Ties an Apple Health workout to a Pulso session (null unties it). */
export async function linkHealthWorkout(client: LifeClient, healthWorkoutId: string, workoutId: string | null): Promise<void> {
  const h = must(await pulso(client).from("health_workouts").update({ workout_id: workoutId }).eq("id", healthWorkoutId).select("*").single());
  if (workoutId && (h.energy_kcal != null || h.avg_hr != null)) {
    must(await pulso(client).from("workouts").update({ energy_kcal: h.energy_kcal, avg_hr: h.avg_hr }).eq("id", workoutId).select("id"));
  }
}

// ---------------------------------------------------------------------------
// Hoy
// ---------------------------------------------------------------------------

export type TrainingToday = {
  inProgress: Workout | null;
  today: Workout | null;
  next: { workout: Workout; exercises: number; minutes: number } | null;
  week: {
    program: string;
    number: number;
    weeks: number;
    deload: boolean;
    days: { id: string; name: string; date: string | null; status: "done" | "partial" | "missed" | "planned" | "skipped" }[];
    done: number;
  } | null;
  doneToday: { title: string; minutes: number | null; sets: number; energyKcal: number | null }[];
};

/** What Hoy needs from Entreno. Start a session at `/entreno/sesion?workout=<id>`. */
export async function getTrainingToday(client: LifeClient): Promise<TrainingToday> {
  const { timezone } = await getSettings(client);
  const today = localDate(new Date(), timezone);
  const inProgress = await getInProgress(client);
  const block = await getActiveProgram(client);
  let week: TrainingToday["week"] = null;
  let next: TrainingToday["next"] = null;
  let todayRow: Workout | null = null;
  if (block) {
    await ensureBlockSessions(client, block);
    const n = currentWeek(block.program.starts_on, block.program.weeks, today);
    const rows = must(await pulso(client).from("workouts").select("*").eq("program_id", block.program.id).order("local_date", { nullsFirst: false }));
    const counts = await setCounts(client, rows.filter((r) => r.status === "done").map((r) => r.id));
    const views = rows.map((w) => view(w, block.days, counts, today));
    const thisWeek = views.filter((v) => v.workout.week === n);
    week = {
      program: block.program.name,
      number: n,
      weeks: block.program.weeks,
      deload: block.program.deload_weeks.includes(n),
      days: thisWeek.map((v) => ({ id: v.workout.id, name: v.workout.title, date: v.workout.local_date, status: v.status === "in_progress" ? "planned" : v.status })),
      done: thisWeek.filter((v) => v.status === "done" || v.status === "partial").length,
    };
    const t = views.find((v) => v.workout.local_date === today && v.status !== "skipped");
    todayRow = t?.workout ?? null;
    const nv = pickNext(views, today, n);
    if (nv) next = { workout: nv.workout, exercises: nv.exercises.length, minutes: nv.minutes };
  }
  const doneRows = must(await pulso(client).from("workouts").select("*").eq("status", "done").eq("local_date", today));
  const counts = await setCounts(client, doneRows.map((r) => r.id));
  const doneToday: TrainingToday["doneToday"] = doneRows.map((w) => ({ title: w.title, minutes: minutesOf(w), sets: counts.get(w.id) ?? 0, energyKcal: w.energy_kcal }));
  const since = zonedInstant(today, "00:00", timezone).toISOString();
  const health = must(await pulso(client).from("health_workouts").select("*").is("workout_id", null).gte("started_at", since));
  for (const h of health) doneToday.push({ title: h.activity, minutes: Math.round((Date.parse(h.ended_at) - Date.parse(h.started_at)) / 60_000), sets: 0, energyKcal: h.energy_kcal });
  if (!todayRow) todayRow = doneRows[0] ?? null;
  return { inProgress, today: todayRow, next, week, doneToday };
}

export async function getDay(client: LifeClient, dayId: string): Promise<ProgramDay> {
  return must(await pulso(client).from("program_days").select("*").eq("id", dayId).single());
}
