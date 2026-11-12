// The dated diet plan: a plan is rotation days (DietPlanDay[]) starting on a
// date; materializing writes one plan_slots row per meal per date, which you
// then eat (a meal linked by plan_slot_id), skip or edit. Plus recipes.
import type { LifeClient } from "../index";
import type { DietPlan, DietPlanDay, FoodItem, Meal, MealSlot, PlanSlot, Recipe } from "../types";
import { must, pulso, PulsoError, userId } from "./core";
import { addDays, daysBetween, localDate } from "./dates";
import { itemTotals, logDish, MEAL_SLOTS, scaleItems } from "./nutrition";
import { getSettings } from "./settings";

/** Which rotation day a date falls on. */
export function rotationIndex(startsOn: string, date: string, length: number): number {
  if (length <= 0) return 0;
  return ((daysBetween(startsOn, date) % length) + length) % length;
}

/** The items a planned meal stands for: its own, else its recipe scaled to the portions. */
export function slotItems(slot: { items: FoodItem[]; recipe_id?: string | null; portions?: number | null }, recipes: Map<string, Recipe>): FoodItem[] {
  if (slot.items?.length) return slot.items;
  const recipe = slot.recipe_id ? recipes.get(slot.recipe_id) : undefined;
  if (!recipe) return [];
  return scaleItems(recipe.ingredients, (slot.portions ?? 1) / (recipe.servings || 1));
}

/** Plan slot rows for `days` dates from `from`, skipping dates in `existing`. */
export function materialize(plan: Pick<DietPlan, "id" | "starts_on" | "days">, from: string, days: number, existing: Set<string>, uid: string) {
  const rows: Omit<PlanSlot, "id" | "created_at" | "updated_at">[] = [];
  if (!plan.days.length) return rows;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (date < plan.starts_on || existing.has(date)) continue;
    const day = plan.days[rotationIndex(plan.starts_on, date, plan.days.length)]!;
    const ordered = [...day.meals].sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
    ordered.forEach((m, position) =>
      rows.push({
        user_id: uid,
        plan_id: plan.id,
        date,
        slot: m.slot,
        position,
        time: m.time ?? null,
        name: m.name,
        recipe_id: m.recipeId ?? null,
        portions: m.portions ?? null,
        items: m.items ?? [],
        status: "planned",
        note: null,
      }),
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function listPlans(client: LifeClient): Promise<DietPlan[]> {
  return must(await pulso(client).from("diet_plans").select("*").order("created_at", { ascending: false }));
}

export async function getActivePlan(client: LifeClient): Promise<DietPlan | null> {
  const { data } = await pulso(client).from("diet_plans").select("*").eq("active", true).maybeSingle();
  return data ?? null;
}

export async function getPlan(client: LifeClient, id: string): Promise<DietPlan> {
  return must(await pulso(client).from("diet_plans").select("*").eq("id", id).single());
}

export type PlanInput = { id?: string | null; name: string; notes?: string | null; startsOn: string; days: DietPlanDay[] };

export async function savePlan(client: LifeClient, input: PlanInput): Promise<DietPlan> {
  if (!input.name.trim()) throw new PulsoError("Ponle nombre al plan.", "invalid");
  const row = { name: input.name.trim(), notes: input.notes ?? null, starts_on: input.startsOn, days: input.days };
  if (input.id) return must(await pulso(client).from("diet_plans").update(row).eq("id", input.id).select("*").single());
  return must(await pulso(client).from("diet_plans").insert({ ...row, user_id: await userId(client) }).select("*").single());
}

/** Makes a plan the active one and fills its next `days` dates. */
export async function activatePlan(client: LifeClient, id: string, days = 14): Promise<number> {
  const db = pulso(client);
  must(await db.from("diet_plans").update({ active: false }).eq("active", true).neq("id", id).select("id"));
  const plan = must(await db.from("diet_plans").update({ active: true }).eq("id", id).select("*").single());
  const today = localDate(new Date(), (await getSettings(client)).timezone);
  return fillPlan(client, plan, today < plan.starts_on ? plan.starts_on : today, days);
}

export async function deactivatePlan(client: LifeClient, id: string): Promise<void> {
  must(await pulso(client).from("diet_plans").update({ active: false }).eq("id", id).select("id"));
}

/** Deletes a plan and its slots (meals already eaten stay in the log). */
export async function deletePlan(client: LifeClient, id: string): Promise<void> {
  must(await pulso(client).from("diet_plans").delete().eq("id", id).select("id"));
}

/** Writes the plan's slots for dates that have none yet. Returns how many rows. */
export async function fillPlan(client: LifeClient, plan: DietPlan, from: string, days: number): Promise<number> {
  const db = pulso(client);
  const to = addDays(from, days - 1);
  const have = must(await db.from("plan_slots").select("date").eq("plan_id", plan.id).gte("date", from).lte("date", to));
  const rows = materialize(plan, from, days, new Set(have.map((r) => r.date)), await userId(client));
  if (rows.length) must(await db.from("plan_slots").insert(rows).select("id"));
  return rows.length;
}

/** Rewrites future planned (not eaten) slots after the plan's days changed. */
export async function refillPlan(client: LifeClient, id: string, days = 14): Promise<number> {
  const db = pulso(client);
  const plan = await getPlan(client, id);
  const today = localDate(new Date(), (await getSettings(client)).timezone);
  const from = today < plan.starts_on ? plan.starts_on : today;
  const eaten = must(await db.from("meals").select("plan_slot_id").gte("local_date", from).not("plan_slot_id", "is", null));
  const keep = new Set(eaten.map((m) => m.plan_slot_id!));
  const future = must(await db.from("plan_slots").select("id, date").eq("plan_id", id).gte("date", from));
  const drop = future.filter((s) => !keep.has(s.id));
  const keptDates = new Set(future.filter((s) => keep.has(s.id)).map((s) => s.date));
  if (drop.length) must(await db.from("plan_slots").delete().in("id", drop.map((s) => s.id)).select("id"));
  const rows = materialize(plan, from, days, keptDates, await userId(client));
  if (rows.length) must(await db.from("plan_slots").insert(rows).select("id"));
  return rows.length;
}

export type PlanWeekDay = { date: string; slots: (PlanSlot & { eaten: boolean; kcal: number })[]; kcal: number };

/** The plan's slots for `days` dates from `from`, with what was eaten. */
export async function getPlanRange(client: LifeClient, from: string, days = 7): Promise<{ plan: DietPlan | null; days: PlanWeekDay[]; recipes: Recipe[] }> {
  const db = pulso(client);
  const to = addDays(from, days - 1);
  const [plan, slots, meals, recipes] = await Promise.all([
    getActivePlan(client),
    db.from("plan_slots").select("*").gte("date", from).lte("date", to).order("date").order("position"),
    db.from("meals").select("plan_slot_id").gte("local_date", from).lte("local_date", to).not("plan_slot_id", "is", null),
    listRecipes(client),
  ]);
  const eaten = new Set(must(meals).map((m) => m.plan_slot_id));
  const byRecipe = new Map(recipes.map((r) => [r.id, r]));
  const all = must(slots);
  return {
    plan,
    recipes,
    days: Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      const list = all
        .filter((s) => s.date === date)
        .map((s) => ({ ...s, eaten: eaten.has(s.id), kcal: itemTotals(slotItems(s, byRecipe)).kcal }));
      return { date, slots: list, kcal: list.filter((s) => s.status !== "skipped").reduce((a, s) => a + s.kcal, 0) };
    }),
  };
}

/** Logs a planned meal as eaten (its items as one dish linked to the slot). */
export async function eatPlannedSlot(client: LifeClient, slotId: string, time?: string | null): Promise<Meal[]> {
  const db = pulso(client);
  const slot = must(await db.from("plan_slots").select("*").eq("id", slotId).single());
  const already = must(await db.from("meals").select("id").eq("plan_slot_id", slotId));
  if (already.length) throw new PulsoError("Esa comida ya está registrada.", "conflict");
  const recipes = new Map((await listRecipes(client)).map((r) => [r.id, r]));
  const items = slotItems(slot, recipes);
  if (!items.length) throw new PulsoError("Esa comida del plan no tiene ingredientes.", "invalid");
  if (slot.status !== "planned") must(await db.from("plan_slots").update({ status: "planned" }).eq("id", slotId).select("id"));
  return logDish(client, { name: slot.name ?? "Comida del plan", items, date: slot.date, slot: slot.slot, time: time ?? slot.time?.slice(0, 5) ?? null, planSlotId: slotId });
}

/** Undo "eaten": removes the meals logged for a slot. */
export async function uneatPlannedSlot(client: LifeClient, slotId: string): Promise<void> {
  must(await pulso(client).from("meals").delete().eq("plan_slot_id", slotId).select("id"));
}

export async function setSlotStatus(client: LifeClient, slotId: string, status: PlanSlot["status"]): Promise<void> {
  must(await pulso(client).from("plan_slots").update({ status }).eq("id", slotId).select("id"));
}

export async function updatePlanSlot(client: LifeClient, slotId: string, patch: { name?: string | null; time?: string | null; slot?: MealSlot; recipeId?: string | null; portions?: number | null; items?: FoodItem[]; note?: string | null }): Promise<PlanSlot> {
  const row: Partial<PlanSlot> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.time !== undefined) row.time = patch.time;
  if (patch.slot !== undefined) row.slot = patch.slot;
  if (patch.recipeId !== undefined) row.recipe_id = patch.recipeId;
  if (patch.portions !== undefined) row.portions = patch.portions;
  if (patch.items !== undefined) row.items = patch.items;
  if (patch.note !== undefined) row.note = patch.note;
  return must(await pulso(client).from("plan_slots").update(row).eq("id", slotId).select("*").single());
}

export async function deletePlanSlot(client: LifeClient, slotId: string): Promise<void> {
  must(await pulso(client).from("plan_slots").delete().eq("id", slotId).select("id"));
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export async function listRecipes(client: LifeClient): Promise<Recipe[]> {
  return must(await pulso(client).from("recipes").select("*").order("name"));
}

export async function getRecipe(client: LifeClient, id: string): Promise<Recipe> {
  return must(await pulso(client).from("recipes").select("*").eq("id", id).single());
}

export type RecipeInput = { id?: string | null; name: string; servings: number; prepMinutes?: number; batch?: boolean; ingredients: FoodItem[]; steps?: string | null; notes?: string | null };

export async function saveRecipe(client: LifeClient, input: RecipeInput): Promise<Recipe> {
  if (!input.name.trim()) throw new PulsoError("Ponle nombre a la receta.", "invalid");
  if (!(input.servings > 0)) throw new PulsoError("Las porciones deben ser más de cero.", "invalid");
  const row = {
    name: input.name.trim(),
    servings: input.servings,
    prep_minutes: Math.max(0, Math.round(input.prepMinutes ?? 0)),
    batch: input.batch ?? false,
    ingredients: input.ingredients,
    steps: input.steps ?? null,
    notes: input.notes ?? null,
  };
  if (input.id) return must(await pulso(client).from("recipes").update(row).eq("id", input.id).select("*").single());
  return must(await pulso(client).from("recipes").insert({ ...row, user_id: await userId(client) }).select("*").single());
}

export async function deleteRecipe(client: LifeClient, id: string): Promise<void> {
  must(await pulso(client).from("recipes").delete().eq("id", id).select("id"));
}

/** Per-serving macros of a recipe. */
export function recipePerServing(recipe: Pick<Recipe, "ingredients" | "servings">) {
  return itemTotals(scaleItems(recipe.ingredients, 1 / (recipe.servings || 1)));
}
