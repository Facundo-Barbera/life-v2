"use server";
import { revalidatePath } from "next/cache";
import { createMedication, deleteMedication, type DoseLogInput, type MedicationInput, recordDose, type ScheduleInput, undoDose, updateMedication } from "@life/db/pulso";
import type { DayPart, DoseStatus, MedicationKind } from "@life/db";
import type { ActionResult } from "@/components/client";
import { attempt, bool, num, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

const refresh = () => {
  revalidatePath("/medicacion");
  revalidatePath("/");
};

const PARTS: DayPart[] = ["manana", "tarde", "noche"];
const MEALS = ["desayuno", "comida", "cena"] as const;

/** The editor's fields as a schedule (see editor.tsx for the names). */
function scheduleFrom(data: FormData): ScheduleInput {
  if (str(data, "mode") === "demanda") return { asNeeded: true };
  const freq = str(data, "freq") ?? "diario";
  const days = data.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  const times = (str(data, "times") ?? "")
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/^\d:\d\d$/.test(t) ? `0${t}` : t));
  const windows = PARTS.filter((p) => bool(data, `win_${p}`)).map((part) => ({ part, start: str(data, `win_${part}_start`) ?? undefined, end: str(data, `win_${part}_end`) ?? undefined }));
  const anyTime = bool(data, "anyTime");
  return {
    asNeeded: false,
    times,
    days: freq === "semana" || freq === "intervalo" ? days : [],
    interval: freq === "intervalo" ? { every: num(data, "every") ?? 2, unit: str(data, "unit") === "week" ? "week" : "day" } : null,
    monthDay: freq === "mes" ? num(data, "monthDay") : null,
    windows,
    anyTime,
    reminder: anyTime ? (bool(data, "noReminder") ? null : (str(data, "reminder") ?? undefined)) : undefined,
    meals: MEALS.filter((m) => bool(data, `meal_${m}`)),
    bedtime: bool(data, "bedtime"),
    training: bool(data, "training") ? { withinMinutes: num(data, "withinMinutes") ?? 60, restDayTime: bool(data, "restNone") ? null : (str(data, "restDayTime") ?? null) } : null,
  };
}

function medicationFrom(data: FormData): MedicationInput {
  return {
    name: str(data, "name") ?? "",
    kind: (str(data, "kind") ?? "medicamento") as MedicationKind,
    dose: num(data, "dose") ?? 0,
    unit: str(data, "unit_label") ?? "",
    form: str(data, "form"),
    instructions: str(data, "instructions"),
    schedule: scheduleFrom(data),
    startDate: str(data, "startDate") ?? undefined,
    endDate: str(data, "endDate"),
    stock: num(data, "stock"),
    lowStockThreshold: num(data, "lowStockThreshold"),
    notes: str(data, "notes"),
  };
}

export async function saveMedication(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = str(data, "id");
  const input = medicationFrom(data);
  const result = await attempt(() => (id ? updateMedication(client, id, input) : createMedication(client, input)), id ? "Guardado." : "Añadido.");
  refresh();
  return result;
}

export async function deleteMedicationAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await deleteMedication(client, id);
  refresh();
}

export async function setActiveAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await updateMedication(client, id, { active: bool(data, "active") });
  refresh();
}

/** Applies a suggested schedule (JSON) to an as-needed medication. */
export async function applyNudgeAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  const schedule = str(data, "schedule");
  if (!id || !schedule) return;
  const instructions = str(data, "instructions");
  await updateMedication(client, id, { schedule: JSON.parse(schedule) as ScheduleInput, ...(instructions ? { instructions } : {}) });
  refresh();
}

/**
 * One-tap dose logging, also used from Hoy. Fields: medicationId, date, slot
 * (empty for as-needed/extra), status (tomada | omitida | pospuesta). With
 * `doseId` and no status (or status "deshacer") it undoes that dose.
 */
export async function recordDoseAction(data: FormData) {
  const { client } = await requireMember();
  const doseId = str(data, "doseId");
  const status = str(data, "status");
  if (doseId && (!status || status === "deshacer")) {
    await undoDose(client, doseId);
  } else {
    const medicationId = str(data, "medicationId");
    if (!medicationId || !status) return;
    const input: DoseLogInput = { medicationId, date: str(data, "date") ?? undefined, scheduledTime: str(data, "slot"), status: status as DoseStatus };
    await recordDose(client, input);
  }
  refresh();
}
