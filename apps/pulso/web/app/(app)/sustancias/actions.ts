"use server";
import { revalidatePath } from "next/cache";
import { createSubstance, deleteUse, logUse, moveSubstance, type SubstanceAmount, type SubstanceContext, updateSubstance, updateUse, type UseInput } from "@life/db/pulso";
import type { ActionResult } from "@/components/client";
import { attempt, num, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/sustancias");

function useFrom(data: FormData): UseInput {
  const form = str(data, "form");
  return {
    substanceId: str(data, "substanceId") ?? undefined,
    date: str(data, "date") ?? undefined,
    time: str(data, "time") ?? undefined,
    form: form === "—" ? null : (form ?? undefined),
    amount: (str(data, "amount") ?? "normal") as SubstanceAmount,
    quantity: num(data, "quantity"),
    thcMg: num(data, "thcMg"),
    context: str(data, "context") as SubstanceContext | null,
    note: str(data, "note"),
  };
}

export async function saveUse(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = str(data, "id");
  const input = useFrom(data);
  const result = await attempt(() => (id ? updateUse(client, id, input) : logUse(client, input)), id ? "Guardado." : "Anotado.");
  refresh();
  return result;
}

export async function deleteUseAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await deleteUse(client, id);
  refresh();
}

const formsFrom = (data: FormData) =>
  (str(data, "forms") ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

export async function saveSubstance(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = str(data, "id");
  const goal = str(data, "maxDaysPerWeek");
  const input = {
    name: str(data, "name") ?? "",
    unit: str(data, "unit") ?? "veces",
    forms: formsFrom(data),
    maxDaysPerWeek: goal === null ? null : Number(goal),
  };
  const result = await attempt(() => (id ? updateSubstance(client, id, input) : createSubstance(client, input)), id ? "Guardado." : "Añadida.");
  refresh();
  return result;
}

export async function setGoal(_: ActionResult, data: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = str(data, "id");
  const goal = str(data, "maxDaysPerWeek");
  const result = await attempt(async () => {
    if (!id) throw new Error("Falta la sustancia.");
    await updateSubstance(client, id, { maxDaysPerWeek: goal === null ? null : Number(goal) });
  }, "Meta guardada.");
  refresh();
  return result;
}

export async function archiveSubstance(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await updateSubstance(client, id, { archived: str(data, "archived") === "true" });
  refresh();
}

export async function moveSubstanceAction(data: FormData) {
  const { client } = await requireMember();
  const id = str(data, "id");
  if (id) await moveSubstance(client, id, str(data, "dir") === "up" ? -1 : 1);
  refresh();
}
