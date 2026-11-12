"use server";
import { revalidatePath } from "next/cache";
import { addManualSleep, deleteManualSleep, getSettings, resolveManualTimes, updateManualSleep, updateSettings } from "@life/db/pulso";
import type { ActionResult } from "@/components/client";
import { attempt, num, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

const refresh = () => {
  revalidatePath("/sueno");
  revalidatePath("/");
};

export async function saveManualNight(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = str(data, "id");
  const result = await attempt(async () => {
    const { timezone } = await getSettings(client);
    const wakeDate = str(data, "wakeDate");
    const asleep = str(data, "asleep");
    const wake = str(data, "wake");
    if (!wakeDate || !asleep || !wake) throw new Error("Faltan la hora de dormir o la de despertar.");
    const { start, end } = resolveManualTimes(wakeDate, asleep, wake, timezone);
    const input = { start, end, note: str(data, "note"), quality: num(data, "quality") };
    await (id ? updateManualSleep(client, id, input) : addManualSleep(client, input));
  }, id ? "Guardada." : "Anotada.");
  refresh();
  return result;
}

export async function deleteManualNightAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await deleteManualSleep(client, id);
  refresh();
}

export async function saveSleepTarget(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const hours = num(data, "hours");
  const result = await attempt(async () => {
    if (hours !== null && (hours < 3 || hours > 15)) throw new Error("La meta va de 3 a 15 horas.");
    await updateSettings(client, { sleep_target_min: hours === null ? null : Math.round(hours * 60) });
  }, "Meta guardada.");
  refresh();
  return result;
}
