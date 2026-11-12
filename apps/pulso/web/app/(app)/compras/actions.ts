"use server";
import { revalidatePath } from "next/cache";
import { addShoppingItem, buildShoppingList, clearChecked, clearShopping, deleteShoppingItem, updateShoppingItem } from "@life/db/pulso";
import type { ActionResult } from "@/components/client";
import { attempt, bool, num, req, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

const done = () => revalidatePath("/compras");

export async function buildAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const r = await attempt(async () => {
    const view = await buildShoppingList(client, req(str(d, "from"), "la fecha"), num(d, "days") ?? 7);
    return view;
  }, "Lista actualizada con el plan.");
  done();
  return r;
}

export async function addItemAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const r = await attempt(() => addShoppingItem(client, { name: req(str(d, "name"), "qué comprar"), amount: str(d, "amount"), category: str(d, "category") }));
  done();
  return r;
}

export async function toggleAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await updateShoppingItem(client, id, { checked: bool(d, "checked") });
  done();
}

export async function categoryAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  const category = str(d, "category");
  if (id && category) await updateShoppingItem(client, id, { category });
  done();
}

export async function deleteItemAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await deleteShoppingItem(client, id);
  done();
}

export async function clearCheckedAction() {
  const { client } = await requireMember();
  await clearChecked(client);
  done();
}

export async function clearAllAction() {
  const { client } = await requireMember();
  await clearShopping(client);
  done();
}
