"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  activateProgram,
  addDay,
  addSessionExercise,
  cancelSession,
  createExercise,
  createProgram,
  deleteDay,
  deleteProgram,
  deleteSession,
  deleteSet,
  endProgram,
  finishSession,
  fromUnit,
  getDay,
  linkHealthWorkout,
  logSet,
  moveDay,
  moveSession,
  removeSessionExercise,
  resolveExercise,
  setDayExercises,
  setExerciseNotes,
  setExerciseUnit,
  skipSession,
  startSession,
  swapSessionExercise,
  updateDay,
  updateProgram,
  type SetInput,
} from "@life/db/pulso";
import type { ProgramExercise, WeightUnit } from "@life/db";
import type { ActionResult } from "@/components/client";
import { attempt, bool, num, req, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

const done = (paths: string[] = []) => {
  revalidatePath("/entreno", "layout");
  revalidatePath("/");
  for (const p of paths) revalidatePath(p);
};

// ---------- Blocks ----------

export async function createBlockAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  let id: string | null = null;
  const result = await attempt(async () => {
    const program = await createProgram(
      client,
      {
        name: str(data, "name") ?? "",
        goal: str(data, "goal") ?? undefined,
        weeks: req(num(data, "weeks"), "cuántas semanas"),
        startsOn: req(str(data, "starts_on"), "la fecha de inicio"),
        notes: str(data, "notes"),
        deloadWeeks: parseWeeks(str(data, "deload")),
      },
      bool(data, "activate"),
    );
    id = program.id;
  });
  if (!result?.ok || !id) return result;
  done();
  redirect(`/entreno/bloque/${id}`);
}

const parseWeeks = (s: string | null) => (s ? s.split(/[ ,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

export async function updateBlockAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = req(str(data, "id"), "el bloque");
  const result = await attempt(
    () =>
      updateProgram(client, id, {
        name: str(data, "name") ?? "",
        goal: str(data, "goal") ?? "",
        weeks: req(num(data, "weeks"), "cuántas semanas"),
        startsOn: req(str(data, "starts_on"), "la fecha de inicio"),
        notes: str(data, "notes"),
        deloadWeeks: parseWeeks(str(data, "deload")),
      }),
    "Guardado.",
  );
  done();
  return result;
}

export async function activateBlockAction(data: FormData) {
  const { client } = await requireMember();
  await activateProgram(client, req(str(data, "id"), "el bloque"));
  done();
}

export async function endBlockAction(data: FormData) {
  const { client } = await requireMember();
  await endProgram(client, req(str(data, "id"), "el bloque"));
  done();
}

export async function deleteBlockAction(data: FormData) {
  const { client } = await requireMember();
  await deleteProgram(client, req(str(data, "id"), "el bloque"));
  done();
  redirect("/entreno");
}

// ---------- Days ----------

const time = (s: string | null) => (s && /^\d{2}:\d{2}/.test(s) ? s.slice(0, 5) : null);

export async function addDayAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const programId = req(str(data, "program_id"), "el bloque");
  const result = await attempt(() =>
    addDay(client, programId, { name: str(data, "name") ?? "Día", focus: str(data, "focus"), weekday: num(data, "weekday"), time: time(str(data, "time")), durationMin: num(data, "duration") }),
  );
  done();
  return result;
}

export async function updateDayAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = req(str(data, "id"), "el día");
  const result = await attempt(
    () => updateDay(client, id, { name: str(data, "name") ?? "Día", focus: str(data, "focus"), weekday: num(data, "weekday"), time: time(str(data, "time")), durationMin: num(data, "duration") }),
    "Guardado.",
  );
  done();
  return result;
}

export async function deleteDayAction(data: FormData) {
  const { client } = await requireMember();
  await deleteDay(client, req(str(data, "id"), "el día"));
  done();
}

export async function moveDayAction(data: FormData) {
  const { client } = await requireMember();
  await moveDay(client, req(str(data, "id"), "el día"), num(data, "delta") === -1 ? -1 : 1);
  done();
}

// ---------- A day's exercises ----------

async function editDay(dayId: string, fn: (list: ProgramExercise[]) => ProgramExercise[] | Promise<ProgramExercise[]>) {
  const { client } = await requireMember();
  const day = await getDay(client, dayId);
  await setDayExercises(client, dayId, await fn([...day.exercises]));
  done();
}

export async function addDayExerciseAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const dayId = req(str(data, "day_id"), "el día");
  const exerciseId = str(data, "exercise_id");
  return attempt(async () => {
    const id = req(exerciseId, "el ejercicio");
    const ex = await resolveExercise(client, id);
    const cardio = ex.kind === "cardio";
    await editDay(dayId, (list) => [
      ...list,
      {
        exerciseId: ex.library_id ?? ex.id,
        name: ex.name,
        muscle: ex.muscle_group,
        sets: cardio ? 1 : (num(data, "sets") ?? 3),
        repMin: num(data, "rep_min") ?? 8,
        repMax: num(data, "rep_max") ?? 12,
        targetRir: num(data, "rir"),
        restSeconds: num(data, "rest") ?? 90,
        weightKg: null,
        notes: null,
        ...(cardio ? { cardio: { minutes: num(data, "minutes") ?? 20 } } : {}),
      },
    ]);
  });
}

export async function updateDayExerciseAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  await requireMember();
  const dayId = req(str(data, "day_id"), "el día");
  const index = req(num(data, "index"), "el ejercicio");
  const unit = (str(data, "unit") ?? "kg") as WeightUnit;
  return attempt(
    () =>
      editDay(dayId, (list) => {
        const cur = list[index];
        if (!cur) throw new Error("Ese ejercicio ya no está.");
        const repMin = num(data, "rep_min") ?? cur.repMin;
        const repMax = Math.max(repMin, num(data, "rep_max") ?? cur.repMax);
        const w = num(data, "weight");
        list[index] = {
          ...cur,
          sets: Math.max(1, num(data, "sets") ?? cur.sets),
          repMin,
          repMax,
          targetRir: num(data, "rir"),
          restSeconds: num(data, "rest") ?? cur.restSeconds,
          weightKg: w == null ? null : fromUnit(w, unit),
          notes: str(data, "notes"),
          ...(cur.cardio ? { cardio: { minutes: num(data, "minutes"), distanceKm: num(data, "distance"), level: num(data, "level") } } : {}),
        };
        return list;
      }),
    "Guardado.",
  );
}

export async function removeDayExerciseAction(data: FormData) {
  const index = num(data, "index");
  await editDay(req(str(data, "day_id"), "el día"), (list) => list.filter((_, i) => i !== index));
}

export async function moveDayExerciseAction(data: FormData) {
  const index = req(num(data, "index"), "el ejercicio");
  const delta = num(data, "delta") === -1 ? -1 : 1;
  await editDay(req(str(data, "day_id"), "el día"), (list) => {
    const j = index + delta;
    if (j < 0 || j >= list.length) return list;
    [list[index], list[j]] = [list[j]!, list[index]!];
    return list;
  });
}

export async function createExerciseAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(
    () =>
      createExercise(client, {
        name: str(data, "name") ?? "",
        muscle: str(data, "muscle") ?? "full_body",
        equipment: str(data, "equipment") ?? "bodyweight",
        kind: (str(data, "kind") ?? "compound") as "compound" | "isolation" | "cardio",
      }),
    "Ejercicio creado.",
  );
  done();
  return result;
}

// ---------- Dated sessions ----------

export async function moveSessionAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => moveSession(client, req(str(data, "id"), "la sesión"), req(str(data, "date"), "la fecha"), time(str(data, "time"))));
  done();
  return result;
}

export async function skipSessionAction(data: FormData) {
  const { client } = await requireMember();
  await skipSession(client, req(str(data, "id"), "la sesión"), str(data, "skip") !== "false");
  done();
}

// ---------- The session in progress ----------

export async function startSessionAction(data: FormData) {
  const { client } = await requireMember();
  const w = await startSession(client, { workoutId: str(data, "workout") ?? undefined, dayId: str(data, "day") ?? undefined, title: str(data, "title") ?? undefined });
  done();
  redirect(`/entreno/sesion?workout=${w.id}`);
}

export async function logSetAction(workoutId: string, exerciseId: string, input: SetInput): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => logSet(client, workoutId, exerciseId, input));
  revalidatePath("/entreno/sesion");
  return result;
}

export async function deleteSetAction(setId: string): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => deleteSet(client, setId));
  revalidatePath("/entreno/sesion");
  return result;
}

export async function addSessionExerciseAction(workoutId: string, exerciseId: string): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => addSessionExercise(client, workoutId, exerciseId));
  revalidatePath("/entreno/sesion");
  return result;
}

export async function swapSessionExerciseAction(workoutId: string, index: number, exerciseId: string): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => swapSessionExercise(client, workoutId, index, exerciseId));
  revalidatePath("/entreno/sesion");
  return result;
}

export async function removeSessionExerciseAction(workoutId: string, index: number): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => removeSessionExercise(client, workoutId, index));
  revalidatePath("/entreno/sesion");
  return result;
}

export async function finishSessionAction(workoutId: string, notes: string | null): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => finishSession(client, workoutId, notes));
  if (!result?.ok) return result;
  done();
  redirect(`/entreno/sesiones/${workoutId}`);
}

export async function cancelSessionAction(workoutId: string): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => cancelSession(client, workoutId));
  if (!result?.ok) return result;
  done();
  redirect("/entreno");
}

export async function deleteSessionAction(data: FormData) {
  const { client } = await requireMember();
  await deleteSession(client, req(str(data, "id"), "la sesión"));
  done();
  redirect("/entreno");
}

// ---------- Exercises and Apple Health ----------

export async function setUnitAction(data: FormData) {
  const { client } = await requireMember();
  const unit = str(data, "unit");
  await setExerciseUnit(client, req(str(data, "exercise_id"), "el ejercicio"), unit === "kg" || unit === "lb" ? unit : null);
  done();
}

export async function setNotesAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(() => setExerciseNotes(client, req(str(data, "exercise_id"), "el ejercicio"), str(data, "notes")), "Guardado.");
  done();
  return result;
}

export async function linkHealthAction(data: FormData) {
  const { client } = await requireMember();
  await linkHealthWorkout(client, req(str(data, "id"), "el entrenamiento"), str(data, "workout_id"));
  done();
}
