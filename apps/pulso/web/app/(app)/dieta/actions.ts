"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DietPlanDay, FoodItem, MealSlot } from "@life/db";
import {
  activatePlan,
  addMeal,
  addWater,
  copyMeals,
  deactivatePlan,
  deleteDishLog,
  deleteMeal,
  deletePlan,
  deletePlanSlot,
  deleteRecipe,
  deleteSavedDish,
  deleteWater,
  eatPlannedSlot,
  type FoodProduct,
  logSavedDish,
  lookupBarcode,
  type MealInput,
  MEAL_SLOTS,
  refillPlan,
  saveDish,
  savePlan,
  saveRecipe,
  setMealTimes,
  setNutritionTargets,
  setSlotStatus,
  uneatPlannedSlot,
  updateMeal,
  updatePlanSlot,
} from "@life/db/pulso";
import type { ActionResult } from "@/components/client";
import { attempt, bool, num, req, str } from "@/lib/actions";
import { requireMember } from "@/lib/supabase/server";

const done = () => revalidatePath("/dieta", "layout");

const slotOf = (d: FormData): MealSlot | null => {
  const s = str(d, "slot");
  return s && (MEAL_SLOTS as string[]).includes(s) ? (s as MealSlot) : null;
};

function parseItems(d: FormData, key = "items"): FoodItem[] {
  const raw = str(d, key);
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error("No se pudieron leer los ingredientes.");
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.name === "string" && x.name.trim())
    .map((x) => ({
      name: String(x.name).trim(),
      quantity: Number(x.quantity) || 0,
      unit: String(x.unit ?? "g") || "g",
      kcal: Number(x.kcal) || 0,
      protein: Number(x.protein) || 0,
      carbs: Number(x.carbs) || 0,
      fat: Number(x.fat) || 0,
      fiber: Number(x.fiber) || 0,
      category: typeof x.category === "string" && x.category ? x.category : undefined,
    }));
}

function mealInput(d: FormData): MealInput {
  return {
    name: req(str(d, "name"), "el nombre"),
    date: req(str(d, "date"), "la fecha"),
    slot: slotOf(d),
    time: str(d, "time"),
    quantity: num(d, "quantity"),
    unit: str(d, "unit"),
    kcal: req(num(d, "kcal"), "las calorías"),
    protein: num(d, "protein"),
    carbs: num(d, "carbs"),
    fat: num(d, "fat"),
    fiber: num(d, "fiber"),
    source: str(d, "source") ?? "manual",
    barcode: str(d, "barcode"),
    notes: str(d, "notes"),
  };
}

// ---------- Meals ----------

export async function saveMealAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = str(d, "id");
  const r = await attempt(() => (id ? updateMeal(client, id, mealInput(d)) : addMeal(client, mealInput(d))));
  done();
  return r;
}

export async function deleteMealAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  const dish = str(d, "dish");
  if (dish) await deleteDishLog(client, dish);
  else if (id) await deleteMeal(client, id);
  done();
}

/** Quick-add a frequent food (fields as hidden inputs). */
export async function quickAddAction(d: FormData) {
  const { client } = await requireMember();
  await addMeal(client, { ...mealInput(d), source: "frecuente" });
  done();
}

export async function copyDayAction(d: FormData) {
  const { client } = await requireMember();
  const from = str(d, "from");
  const to = str(d, "to");
  if (from && to) await copyMeals(client, from, to);
  done();
}

export async function lookupProductAction(code: string): Promise<{ product: FoodProduct | null; error?: string }> {
  await requireMember();
  try {
    return { product: await lookupBarcode(code) };
  } catch (e) {
    return { product: null, error: e instanceof Error ? e.message : "No se pudo buscar." };
  }
}

// ---------- Water ----------

export async function addWaterAction(d: FormData) {
  const { client } = await requireMember();
  const ml = num(d, "ml");
  if (ml) await addWater(client, ml, str(d, "date") ?? undefined);
  done();
}

export async function addWaterFormAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const r = await attempt(() => addWater(client, req(num(d, "ml"), "la cantidad"), str(d, "date") ?? undefined));
  done();
  return r;
}

export async function deleteWaterAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await deleteWater(client, id);
  done();
}

// ---------- Targets ----------

export async function saveTargetsAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const useGoal = str(d, "mode") !== "manual";
  const r = await attempt(async () => {
    await setNutritionTargets(client, {
      kcal: useGoal ? null : req(num(d, "kcal"), "las calorías"),
      protein: num(d, "protein"),
      carbs: num(d, "carbs"),
      fat: num(d, "fat"),
      fiber: num(d, "fiber"),
      waterGoalMl: num(d, "water_goal_ml"),
      glassMl: num(d, "glass_ml"),
      bottleMl: num(d, "bottle_ml"),
    });
    await setMealTimes(client, { desayuno: str(d, "t_desayuno") ?? undefined, comida: str(d, "t_comida") ?? undefined, cena: str(d, "t_cena") ?? undefined });
  }, "Guardado.");
  revalidatePath("/", "layout");
  return r;
}

// ---------- Dishes ----------

export async function saveDishAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const r = await attempt(() => saveDish(client, { id: str(d, "id"), name: req(str(d, "name"), "el nombre"), slot: slotOf(d), components: parseItems(d) }), "Platillo guardado.");
  done();
  return r;
}

export async function deleteDishAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await deleteSavedDish(client, id);
  done();
}

export async function logDishAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  const date = str(d, "date");
  if (id && date) await logSavedDish(client, id, date, num(d, "factor") ?? 1, slotOf(d));
  done();
}

// ---------- Plan ----------

export async function eatSlotAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await eatPlannedSlot(client, id);
  done();
}

export async function uneatSlotAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await uneatPlannedSlot(client, id);
  done();
}

export async function slotStatusAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  const status = str(d, "status");
  if (id && (status === "planned" || status === "skipped")) await setSlotStatus(client, id, status);
  done();
}

export async function editSlotAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const id = req(str(d, "id"), "la comida");
  const items = parseItems(d);
  const r = await attempt(() =>
    updatePlanSlot(client, id, {
      name: str(d, "name"),
      time: str(d, "time"),
      slot: slotOf(d) ?? undefined,
      recipeId: str(d, "recipe_id"),
      portions: num(d, "portions"),
      items,
      note: str(d, "note"),
    }),
  );
  done();
  return r;
}

export async function deleteSlotAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await deletePlanSlot(client, id);
  done();
}

export async function savePlanAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const r = await attempt(async () => {
    const raw = req(str(d, "days"), "los días");
    let days: DietPlanDay[];
    try {
      days = JSON.parse(raw) as DietPlanDay[];
    } catch {
      throw new Error("No se pudieron leer los días del plan.");
    }
    if (!days.length) throw new Error("Agrega al menos un día.");
    const id = str(d, "id");
    const plan = await savePlan(client, { id, name: req(str(d, "name"), "el nombre"), notes: str(d, "notes"), startsOn: req(str(d, "starts_on"), "la fecha de inicio"), days });
    if (bool(d, "activate")) await activatePlan(client, plan.id, num(d, "horizon") ?? 14);
    else if (id && plan.active) await refillPlan(client, plan.id, num(d, "horizon") ?? 14);
  }, "Plan guardado.");
  done();
  revalidatePath("/compras");
  return r;
}

export async function activatePlanAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await activatePlan(client, id, num(d, "horizon") ?? 14);
  done();
}

export async function deactivatePlanAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await deactivatePlan(client, id);
  done();
}

export async function refillPlanAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await refillPlan(client, id, num(d, "horizon") ?? 14);
  done();
}

export async function deletePlanAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await deletePlan(client, id);
  done();
}

// ---------- Recipes ----------

export async function saveRecipeAction(_: ActionResult, d: FormData): Promise<ActionResult> {
  const { client } = await requireMember();
  const r = await attempt(
    () =>
      saveRecipe(client, {
        id: str(d, "id"),
        name: req(str(d, "name"), "el nombre"),
        servings: req(num(d, "servings"), "las porciones"),
        prepMinutes: num(d, "prep_minutes") ?? 0,
        batch: bool(d, "batch"),
        ingredients: parseItems(d),
        steps: str(d, "steps"),
        notes: str(d, "notes"),
      }),
    "Receta guardada.",
  );
  done();
  return r;
}

export async function deleteRecipeAction(d: FormData) {
  const { client } = await requireMember();
  const id = str(d, "id");
  if (id) await deleteRecipe(client, id);
  done();
  redirect("/dieta?vista=recetas");
}
