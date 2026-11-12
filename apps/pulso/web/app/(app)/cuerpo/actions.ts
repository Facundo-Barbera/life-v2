"use server";
import { revalidatePath } from "next/cache";
import type { BodyGoalMetric, GoalMode, TimeOfDay } from "@life/db";
import {
  addWeighIn, blankScan, deleteScan, deleteWeighIn, getSettings, importInBodyCsv, PulsoError, saveInBodyQr, saveScan,
  saveWeightGoal, setBodyGoal, setManualKcal, updateWeighIn, VALUE_KEYS, zonedInstant, type Segmental, SEGMENTS,
} from "@life/db/pulso";
import type { ActionResult } from "@/components/client";
import { attempt, num, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

const LB = 0.45359237;

const done = () => {
  revalidatePath("/cuerpo");
  revalidatePath("/");
  revalidatePath("/dieta");
};

/** "YYYY-MM-DD" + "HH:MM" in the person's zone, or now. */
async function instant(data: FormData, tz: string): Promise<Date | undefined> {
  const date = str(data, "date");
  const time = str(data, "time");
  if (!date) return undefined;
  return zonedInstant(date, time ?? "08:00", tz);
}

const tod = (v: string | null): TimeOfDay | null => (v === "morning" || v === "evening" || v === "unknown" ? v : null);

export async function addWeighInAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(async () => {
    const s = await getSettings(client);
    const value = num(data, "weight");
    if (value == null) throw new PulsoError("Escribe tu peso.");
    await addWeighIn(client, {
      weightKg: s.weight_unit === "lb" ? value * LB : value,
      at: await instant(data, s.timezone),
      timeOfDay: tod(str(data, "time_of_day")),
      note: str(data, "note"),
    });
  }, "Pesaje guardado.");
  done();
  return result;
}

export async function editWeighInAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(async () => {
    const s = await getSettings(client);
    const id = str(data, "id");
    if (!id) throw new PulsoError("Falta el pesaje.");
    const value = num(data, "weight");
    await updateWeighIn(client, id, {
      weightKg: value == null ? undefined : s.weight_unit === "lb" ? value * LB : value,
      at: await instant(data, s.timezone),
      timeOfDay: tod(str(data, "time_of_day")) ?? undefined,
      note: str(data, "note"),
    });
  });
  done();
  return result;
}

export async function deleteWeighInAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await deleteWeighIn(client, id);
  done();
}

export async function saveGoalAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(async () => {
    const s = await getSettings(client);
    const goal = num(data, "goal_weight");
    const mode = str(data, "mode");
    const pace = str(data, "pace_by");
    await saveWeightGoal(client, {
      goalWeightKg: goal == null ? null : s.weight_unit === "lb" ? goal * LB : goal,
      mode: mode === "suave" || mode === "constante" || mode === "rapido" ? (mode as GoalMode) : "constante",
      reachBy: pace === "fecha" ? str(data, "reach_by") : null,
    });
    const manual = num(data, "kcal_target");
    if (manual !== (s.kcal_target ?? null)) await setManualKcal(client, manual);
  }, "Meta guardada; el presupuesto ya cambió.");
  done();
  return result;
}

export async function setTargetAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const metric = str(data, "metric") as BodyGoalMetric | null;
  const result = await attempt(async () => {
    if (!metric) throw new PulsoError("Falta la métrica.");
    if (metric === "weight") {
      const s = await getSettings(client);
      await saveWeightGoal(client, { goalWeightKg: num(data, "target"), mode: s.goal_mode, reachBy: s.goal_reach_by });
    } else await setBodyGoal(client, metric, num(data, "target"));
  }, "Objetivo guardado.");
  done();
  return result;
}

export async function saveScanAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const result = await attempt(async () => {
    const s = await getSettings(client);
    const at = (await instant(data, s.timezone)) ?? new Date();
    const scan = blankScan(str(data, "source") === "inbody" ? "inbody" : "manual", at.getTime());
    for (const k of VALUE_KEYS) scan[k] = num(data, k);
    scan.device = str(data, "device");
    const seg = (prefix: string): Segmental | null => {
      const values = SEGMENTS.map((k) => num(data, `${prefix}_${k}`));
      return values.every((v) => v != null) ? (Object.fromEntries(SEGMENTS.map((k, i) => [k, values[i]])) as Segmental) : null;
    };
    scan.segmentalLean = seg("lean");
    scan.segmentalFat = seg("fat");
    await saveScan(client, scan);
  }, "Medición guardada.");
  done();
  return result;
}

export async function importAction(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  let message = "";
  const result = await attempt(async () => {
    const file = data.get("file");
    const text = str(data, "text") ?? (file instanceof File && file.size > 0 ? await file.text() : null);
    if (!text) throw new PulsoError("Pega el texto del QR o elige el CSV.");
    if (/IBData=|^\s*\{|^https?:\/\//i.test(text) && !text.includes("\n")) {
      await saveInBodyQr(client, text);
      message = "Escaneo del QR guardado.";
      return;
    }
    const { saved, skipped } = await importInBodyCsv(client, text);
    message = `${saved} ${saved === 1 ? "medición importada" : "mediciones importadas"}${skipped.length ? `; ${skipped.length} sin leer (${skipped.slice(0, 3).map((x) => `línea ${x.line}: ${x.reason}`).join(" ")})` : ""}.`;
  });
  done();
  return result?.ok ? { ok: true, message } : result;
}

export async function deleteScanAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await deleteScan(client, id);
  done();
}
