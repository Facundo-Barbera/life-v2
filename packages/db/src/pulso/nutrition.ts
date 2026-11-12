// Dieta: the day's meals and water against the budget the goal sets, frequent
// foods, saved dishes (Mis platillos), nutrition targets and barcode lookup.
// Pure helpers first (tested), then Supabase reads and writes.
import type { LifeClient } from "../index";
import type { FoodItem, Meal, MealSlot, PlanSlot, SavedDish, Water } from "../types";
import { type Budget, computeBudget, pacing, paceState, type PaceState } from "./budget";
import { must, pulso, PulsoError, userId } from "./core";
import { addDays, localDate, localMinutes, localTime, zonedInstant } from "./dates";
import { getSettings, type SettingsPatch, updateSettings } from "./settings";

export const MEAL_SLOTS: MealSlot[] = ["desayuno", "comida", "cena", "snack"];
export const SLOT_LABEL: Record<MealSlot, string> = { desayuno: "Desayuno", comida: "Comida", cena: "Cena", snack: "Snacks" };

export type Macros = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Sum of a day's meals. */
export function totals(meals: Pick<Meal, "kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g">[]): Macros {
  const t = meals.reduce(
    (a, m) => ({ kcal: a.kcal + Number(m.kcal), protein: a.protein + Number(m.protein_g), carbs: a.carbs + Number(m.carbs_g), fat: a.fat + Number(m.fat_g), fiber: a.fiber + Number(m.fiber_g ?? 0) }),
    { ...ZERO },
  );
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), fiber: r1(t.fiber) };
}

/** Sum of food items (a dish's components, a recipe's ingredients). */
export function itemTotals(items: FoodItem[]): Macros {
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat, fiber: a.fiber + (i.fiber ?? 0) }), { ...ZERO });
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), fiber: r1(t.fiber) };
}

/** Scales items by a factor (portions of a recipe, half a dish). */
export function scaleItems(items: FoodItem[], factor: number): FoodItem[] {
  return items.map((i) => ({
    ...i,
    quantity: r1(i.quantity * factor),
    kcal: Math.round(i.kcal * factor),
    protein: r1(i.protein * factor),
    carbs: r1(i.carbs * factor),
    fat: r1(i.fat * factor),
    fiber: i.fiber == null ? undefined : r1(i.fiber * factor),
  }));
}

/** The slot a meal logged at this local time most likely belongs to. */
export function slotForTime(minutes: number): MealSlot {
  if (minutes >= 5 * 60 && minutes < 11 * 60 + 30) return "desayuno";
  if (minutes >= 13 * 60 && minutes < 17 * 60) return "comida";
  if (minutes >= 19 * 60 && minutes < 23 * 60 + 30) return "cena";
  return "snack";
}

export type FrequentFood = { name: string; quantity: number | null; unit: string | null; kcal: number; protein: number; carbs: number; fat: number; fiber: number; slot: MealSlot; times: number };

/** Foods logged most often (by name), with their latest portion; most frequent first. */
export function frequentFoods(meals: Meal[], limit = 12): FrequentFood[] {
  const byName = new Map<string, { latest: Meal; times: number }>();
  for (const m of meals) {
    if (m.dish_id) continue;
    const key = m.name.trim().toLowerCase();
    const seen = byName.get(key);
    if (!seen) byName.set(key, { latest: m, times: 1 });
    else {
      seen.times++;
      if (m.eaten_at > seen.latest.eaten_at) seen.latest = m;
    }
  }
  return [...byName.values()]
    .filter((x) => x.times >= 2)
    .sort((a, b) => b.times - a.times || (b.latest.eaten_at > a.latest.eaten_at ? 1 : -1))
    .slice(0, limit)
    .map(({ latest: m, times }) => ({
      name: m.name,
      quantity: m.quantity,
      unit: m.unit,
      kcal: Number(m.kcal),
      protein: Number(m.protein_g),
      carbs: Number(m.carbs_g),
      fat: Number(m.fat_g),
      fiber: Number(m.fiber_g ?? 0),
      slot: m.slot,
      times,
    }));
}

// ---------------------------------------------------------------------------
// Barcodes (Open Food Facts)
// ---------------------------------------------------------------------------

export type FoodProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  /** Macros per 100 g (or 100 ml). */
  per100: Macros;
  /** One serving in g/ml when the label says. */
  servingSize: number | null;
  liquid: boolean;
  image: string | null;
};

/** EAN-8, UPC-A, EAN-13 or GTIN-14, digits only. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

const pos = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Maps an Open Food Facts v2 product response; null when not found or without energy. */
export function parseOffProduct(barcode: string, body: unknown): FoodProduct | null {
  const b = body as { status?: number; product?: Record<string, unknown> } | null;
  const p = b?.product;
  if (!p || b?.status === 0) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kj = pos(n["energy_100g"]);
  const kcal = pos(n["energy-kcal_100g"]) ?? (kj === undefined ? undefined : kj / 4.184);
  if (kcal === undefined) return null;
  const qty = String(p.quantity ?? p.serving_size ?? "").toLowerCase();
  const liquid = /\b\d+(?:[.,]\d+)?\s*(ml|cl|dl|l)\b/.test(qty);
  const name = String(p.product_name_es || p.product_name || p.generic_name || "Producto").trim();
  return {
    barcode,
    name,
    brand: typeof p.brands === "string" && p.brands ? p.brands.split(",")[0]!.trim() : null,
    per100: { kcal: Math.round(kcal), protein: r1(pos(n["proteins_100g"]) ?? 0), carbs: r1(pos(n["carbohydrates_100g"]) ?? 0), fat: r1(pos(n["fat_100g"]) ?? 0), fiber: r1(pos(n["fiber_100g"]) ?? 0) },
    servingSize: pos(p.serving_quantity) ?? null,
    liquid,
    image: typeof p.image_front_small_url === "string" ? p.image_front_small_url : null,
  };
}

/** Macros of `amount` g/ml of a product. */
export function portionOf(product: Pick<FoodProduct, "per100">, amount: number): Macros {
  const f = amount / 100;
  const p = product.per100;
  return { kcal: Math.round(p.kcal * f), protein: r1(p.protein * f), carbs: r1(p.carbs * f), fat: r1(p.fat * f), fiber: r1(p.fiber * f) };
}

/** Looks a barcode up on Open Food Facts. Server-side; sends no personal data. */
export async function lookupBarcode(raw: string, fetcher: typeof fetch = fetch): Promise<FoodProduct | null> {
  const code = normalizeBarcode(raw);
  if (!code) throw new PulsoError("Ese código de barras no es válido.", "invalid");
  const fields = "product_name,product_name_es,generic_name,brands,nutriments,serving_quantity,serving_size,quantity,image_front_small_url";
  let res: Response;
  try {
    res = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, {
      headers: { "User-Agent": "Pulso/1.0 (nutrition lookup)" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PulsoError("No se pudo consultar Open Food Facts. Intenta más tarde.", "db");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new PulsoError("No se pudo consultar Open Food Facts. Intenta más tarde.", "db");
  return parseOffProduct(code, await res.json());
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type NutritionDay = {
  date: string;
  today: string;
  isToday: boolean;
  timezone: string;
  budget: Budget;
  eaten: Macros;
  remaining: number;
  /** kcal you'd have eaten by now on pace; null when the date isn't today. */
  expectedNow: number | null;
  pace: PaceState | null;
  meals: Meal[];
  bySlot: Record<MealSlot, Meal[]>;
  water: Water[];
  waterMl: number;
  waterGoalMl: number | null;
  glassMl: number;
  bottleMl: number;
  planned: PlanSlot[];
  nextPlanned: PlanSlot | null;
  /** Weight used for the budget. */
  weightKg: number | null;
};

/** The weight the budget uses: latest morning weigh-in, else the latest. */
export async function budgetWeight(client: LifeClient): Promise<number | null> {
  const db = pulso(client);
  const morning = await db.from("weigh_ins").select("weight_kg").eq("time_of_day", "morning").order("measured_at", { ascending: false }).limit(1).maybeSingle();
  if (morning.data) return Number(morning.data.weight_kg);
  const any = await db.from("weigh_ins").select("weight_kg").order("measured_at", { ascending: false }).limit(1).maybeSingle();
  return any.data ? Number(any.data.weight_kg) : null;
}

/** BMR measured by the latest scan that has one. */
export async function latestScanBmr(client: LifeClient): Promise<number | null> {
  const { data } = await pulso(client).from("body_scans").select("metrics").order("scanned_at", { ascending: false }).limit(5);
  for (const row of data ?? []) {
    const bmr = Number((row.metrics as Record<string, unknown>)?.bmr);
    if (Number.isFinite(bmr) && bmr > 0) return bmr;
  }
  return null;
}

/** The budget for today, from the goal and the body. */
export async function getBudget(client: LifeClient): Promise<{ budget: Budget; weightKg: number | null }> {
  const settings = await getSettings(client);
  const [weightKg, scanBmr] = await Promise.all([budgetWeight(client), latestScanBmr(client)]);
  return { budget: computeBudget({ settings, weightKg, scanBmr, today: localDate(new Date(), settings.timezone) }), weightKg };
}

export async function getNutritionDay(client: LifeClient, date?: string): Promise<NutritionDay> {
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const now = new Date();
  const today = localDate(now, tz);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const db = pulso(client);
  const [meals, water, planned, weightKg, scanBmr] = await Promise.all([
    db.from("meals").select("*").eq("local_date", day).order("eaten_at"),
    db.from("waters").select("*").eq("local_date", day).order("drunk_at"),
    db.from("plan_slots").select("*").eq("date", day).order("position"),
    budgetWeight(client),
    latestScanBmr(client),
  ]);
  const list = must(meals);
  const budget = computeBudget({ settings, weightKg, scanBmr, today });
  const eaten = totals(list);
  const isToday = day === today;
  const expectedNow = isToday ? pacing(budget.kcal, localMinutes(now, tz), settings.meal_times) : null;
  const slots = must(planned);
  const eatenSlotIds = new Set(list.map((m) => m.plan_slot_id).filter(Boolean));
  const bySlot = Object.fromEntries(MEAL_SLOTS.map((s) => [s, list.filter((m) => m.slot === s)])) as Record<MealSlot, Meal[]>;
  const waters = must(water);
  return {
    date: day,
    today,
    isToday,
    timezone: tz,
    budget,
    eaten,
    remaining: budget.kcal - eaten.kcal,
    expectedNow,
    pace: expectedNow == null ? null : paceState(eaten.kcal, budget.kcal, expectedNow),
    meals: list,
    bySlot,
    water: waters,
    waterMl: waters.reduce((s, w) => s + Number(w.amount_ml), 0),
    waterGoalMl: settings.water_goal_ml,
    glassMl: settings.water_glass_ml,
    bottleMl: settings.water_bottle_ml,
    planned: slots,
    nextPlanned: slots.find((s) => s.status === "planned" && !eatenSlotIds.has(s.id)) ?? null,
    weightKg,
  };
}

/** Per-day totals for the last `days` days ending on `to` (oldest first). */
export async function getNutritionHistory(client: LifeClient, to: string, days = 14): Promise<{ date: string; kcal: number; protein: number; logged: boolean }[]> {
  const from = addDays(to, -(days - 1));
  const rows = must(await pulso(client).from("meals").select("local_date, kcal, protein_g").gte("local_date", from).lte("local_date", to));
  const by = new Map<string, { kcal: number; protein: number }>();
  for (const r of rows) {
    const d = r.local_date!;
    const t = by.get(d) ?? { kcal: 0, protein: 0 };
    t.kcal += Number(r.kcal);
    t.protein += Number(r.protein_g);
    by.set(d, t);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const t = by.get(date);
    return { date, kcal: Math.round(t?.kcal ?? 0), protein: Math.round(t?.protein ?? 0), logged: !!t };
  });
}

export async function getFrequentFoods(client: LifeClient, limit = 12): Promise<FrequentFood[]> {
  const rows = must(await pulso(client).from("meals").select("*").order("eaten_at", { ascending: false }).limit(400));
  return frequentFoods(rows, limit);
}

export async function listSavedDishes(client: LifeClient): Promise<SavedDish[]> {
  return must(await pulso(client).from("saved_dishes").select("*").order("name"));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type MealInput = {
  name: string;
  slot?: MealSlot | null;
  date: string;
  /** Local "HH:MM"; default now (today) or the slot's usual time. */
  time?: string | null;
  quantity?: number | null;
  unit?: string | null;
  kcal: number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  source?: string;
  barcode?: string | null;
  notes?: string | null;
  planSlotId?: string | null;
  dishId?: string | null;
  dishName?: string | null;
};

const SLOT_TIME: Record<MealSlot, string> = { desayuno: "08:30", comida: "14:30", cena: "20:30", snack: "17:30" };

function checkMeal(m: { name: string; kcal: number }) {
  if (!m.name.trim()) throw new PulsoError("Ponle nombre a la comida.", "invalid");
  if (!(m.kcal >= 0) || m.kcal > 10000) throw new PulsoError("Las calorías no cuadran.", "invalid");
}

async function mealRow(client: LifeClient, m: MealInput) {
  checkMeal(m);
  const settings = await getSettings(client);
  const tz = settings.timezone;
  const today = localDate(new Date(), tz);
  const slot = m.slot ?? null;
  const time = m.time ?? (m.date === today ? localTime(new Date(), tz) : (slot ? (settings.meal_times[slot] ?? SLOT_TIME[slot]) : "13:00"));
  const eatenAt = zonedInstant(m.date, time, tz);
  const [h, mm] = time.split(":").map(Number) as [number, number];
  return {
    user_id: await userId(client),
    name: m.name.trim(),
    slot: slot ?? slotForTime(h * 60 + mm),
    local_date: m.date,
    eaten_at: eatenAt.toISOString(),
    quantity: m.quantity ?? null,
    unit: m.unit ?? null,
    kcal: Math.round(m.kcal),
    protein_g: r1(m.protein ?? 0),
    carbs_g: r1(m.carbs ?? 0),
    fat_g: r1(m.fat ?? 0),
    fiber_g: r1(m.fiber ?? 0),
    source: m.source ?? "manual",
    barcode: m.barcode ?? null,
    notes: m.notes ?? null,
    plan_slot_id: m.planSlotId ?? null,
    dish_id: m.dishId ?? null,
    dish_name: m.dishName ?? null,
  };
}

export async function addMeal(client: LifeClient, m: MealInput): Promise<Meal> {
  return must(await pulso(client).from("meals").insert(await mealRow(client, m)).select("*").single());
}

export async function updateMeal(client: LifeClient, id: string, m: MealInput): Promise<Meal> {
  const { user_id: _, ...row } = await mealRow(client, m);
  return must(await pulso(client).from("meals").update(row).eq("id", id).select("*").single());
}

export async function deleteMeal(client: LifeClient, id: string): Promise<void> {
  must(await pulso(client).from("meals").delete().eq("id", id).select("id"));
}

/** Copies every meal of `from` onto `to` at the same local times. Returns how many. */
export async function copyMeals(client: LifeClient, from: string, to: string): Promise<number> {
  const rows = must(await pulso(client).from("meals").select("*").eq("local_date", from).order("eaten_at"));
  if (!rows.length) return 0;
  const tz = (await getSettings(client)).timezone;
  const uid = await userId(client);
  const copies = rows.map((r) => ({
    user_id: uid,
    name: r.name,
    slot: r.slot,
    local_date: to,
    eaten_at: zonedInstant(to, localTime(r.eaten_at, tz), tz).toISOString(),
    quantity: r.quantity,
    unit: r.unit,
    kcal: r.kcal,
    protein_g: r.protein_g,
    carbs_g: r.carbs_g,
    fat_g: r.fat_g,
    fiber_g: r.fiber_g,
    source: "copia",
    barcode: r.barcode,
    dish_name: r.dish_name,
    notes: r.notes,
  }));
  must(await pulso(client).from("meals").insert(copies).select("id"));
  return copies.length;
}

/** Logs a dish (its components as meals sharing one dish_id). */
export async function logDish(client: LifeClient, input: { name: string; items: FoodItem[]; date: string; slot?: MealSlot | null; time?: string | null; factor?: number; planSlotId?: string | null }): Promise<Meal[]> {
  const items = scaleItems(input.items, input.factor ?? 1);
  if (!items.length) throw new PulsoError("El platillo no tiene ingredientes.", "invalid");
  const dishId = crypto.randomUUID();
  const rows = [];
  for (const i of items) {
    rows.push(
      await mealRow(client, {
        name: i.name,
        date: input.date,
        slot: input.slot,
        time: input.time,
        quantity: i.quantity,
        unit: i.unit,
        kcal: i.kcal,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
        fiber: i.fiber ?? 0,
        source: "platillo",
        dishId,
        dishName: input.name,
        planSlotId: input.planSlotId ?? null,
      }),
    );
  }
  return must(await pulso(client).from("meals").insert(rows).select("*"));
}

export async function deleteDishLog(client: LifeClient, dishId: string): Promise<void> {
  must(await pulso(client).from("meals").delete().eq("dish_id", dishId).select("id"));
}

export async function saveDish(client: LifeClient, input: { id?: string | null; name: string; slot?: MealSlot | null; components: FoodItem[] }): Promise<SavedDish> {
  if (!input.name.trim()) throw new PulsoError("Ponle nombre al platillo.", "invalid");
  if (!input.components.length) throw new PulsoError("Agrega al menos un ingrediente.", "invalid");
  const row = { name: input.name.trim(), slot: input.slot ?? null, components: input.components };
  if (input.id) return must(await pulso(client).from("saved_dishes").update(row).eq("id", input.id).select("*").single());
  return must(await pulso(client).from("saved_dishes").insert({ ...row, user_id: await userId(client) }).select("*").single());
}

export async function deleteSavedDish(client: LifeClient, id: string): Promise<void> {
  must(await pulso(client).from("saved_dishes").delete().eq("id", id).select("id"));
}

export async function logSavedDish(client: LifeClient, id: string, date: string, factor = 1, slot?: MealSlot | null): Promise<Meal[]> {
  const dish = must(await pulso(client).from("saved_dishes").select("*").eq("id", id).single());
  return logDish(client, { name: dish.name, items: dish.components, date, slot: slot ?? dish.slot, factor });
}

export async function addWater(client: LifeClient, amountMl: number, date?: string): Promise<Water> {
  if (!(amountMl > 0) || amountMl > 5000) throw new PulsoError("Esa cantidad de agua no cuadra.", "invalid");
  const tz = (await getSettings(client)).timezone;
  const now = new Date();
  const today = localDate(now, tz);
  const day = date ?? today;
  const at = day === today ? now : zonedInstant(day, "13:00", tz);
  return must(await pulso(client).from("waters").insert({ user_id: await userId(client), amount_ml: Math.round(amountMl), drunk_at: at.toISOString(), local_date: day }).select("*").single());
}

export async function deleteWater(client: LifeClient, id: string): Promise<void> {
  must(await pulso(client).from("waters").delete().eq("id", id).select("id"));
}

export type TargetsInput = {
  /** null = let the goal decide. */
  kcal: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  waterGoalMl?: number | null;
  glassMl?: number | null;
  bottleMl?: number | null;
};

export async function setNutritionTargets(client: LifeClient, t: TargetsInput) {
  const patch: SettingsPatch = {
    kcal_target: t.kcal ? Math.round(t.kcal) : null,
    protein_g_target: t.protein ?? null,
    carbs_g_target: t.carbs ?? null,
    fat_g_target: t.fat ?? null,
    fiber_g_target: t.fiber ?? null,
  };
  if (t.waterGoalMl !== undefined) patch.water_goal_ml = t.waterGoalMl ? Math.round(t.waterGoalMl) : null;
  if (t.glassMl) patch.water_glass_ml = Math.round(t.glassMl);
  if (t.bottleMl) patch.water_bottle_ml = Math.round(t.bottleMl);
  return updateSettings(client, patch);
}

export async function setMealTimes(client: LifeClient, times: Partial<Record<MealSlot, string>>) {
  const clean: Partial<Record<MealSlot, string>> = {};
  for (const [k, v] of Object.entries(times)) if (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) clean[k as MealSlot] = v;
  return updateSettings(client, { meal_times: clean });
}
