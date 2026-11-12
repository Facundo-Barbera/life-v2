"use server";
import { revalidatePath } from "next/cache";
import { createInvitation, revokeInvitation } from "@life/auth";
import { updateSettings } from "@life/db/pulso";
import type { ActivityLevel, WeightUnit } from "@life/db";
import type { ActionResult } from "@/components/client";
import { attempt, bool, num, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

export async function saveSettings(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const sex = str(data, "sex");
  const result = await attempt(async () => {
    const tz = str(data, "timezone") ?? "America/Mexico_City";
    try {
      new Intl.DateTimeFormat("es", { timeZone: tz });
    } catch {
      throw new Error("Esa zona horaria no existe.");
    }
    const sleepH = num(data, "sleep_target_h");
    await updateSettings(client, {
      timezone: tz,
      weight_unit: (str(data, "weight_unit") ?? "kg") as WeightUnit,
      height_cm: num(data, "height_cm"),
      sex: sex === "male" || sex === "female" ? sex : null,
      birth_date: str(data, "birth_date"),
      activity_level: str(data, "activity_level") as ActivityLevel | null,
      sleep_target_min: sleepH == null ? null : Math.round(sleepH * 60),
      rest_seconds: num(data, "rest_seconds") ?? 120,
      substances_in_timeline: bool(data, "substances_in_timeline"),
    });
  }, "Guardado.");
  revalidatePath("/", "layout");
  return result;
}

export async function invite(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client, user } = await requireMember();
  const email = str(data, "email") ?? "";
  const result = await attempt(() => createInvitation(client, user.id, email, str(data, "note") ?? undefined), `Invitación lista. Que entre en Pulso con ${email}.`);
  revalidatePath("/ajustes");
  return result;
}

export async function revoke(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await revokeInvitation(client, id);
  revalidatePath("/ajustes");
}
