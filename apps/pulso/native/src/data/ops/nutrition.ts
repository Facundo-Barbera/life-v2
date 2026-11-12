import type { FoodItem, Meal as MealRow, PlanSlot as PlanSlotRow, PulsoSettings, Recipe as RecipeRow, SavedDish as SavedDishRow, Water as WaterRow } from "@life/db";
import { addDays, computeBudget, localDate, zonedInstant } from "@life/db/pulso";
import type {
  DailySummary,
  DietDay,
  DietHorizon,
  DishComponent,
  FrequentFood,
  Macros,
  MealEntry,
  MealSlot,
  Measure,
  NutrientZone,
  NutritionTargets,
  PlanItem,
  PlanSlot,
  QuantityUnit,
  Recipe,
  SavedDish,
  TargetZone,
  WaterDay,
  WaterEntry,
  ZoneInput,
  ZoneKind,
} from "@/contract";
import { lookupBarcode, normalizeBarcode } from "../logic/barcode";
import { MACRO_KEYS, sum } from "../logic/macros";
import { parseMeasure, toQuantity } from "../logic/measure";
import { estimatePortion } from "../logic/portion";
import { NotAvailableError } from "../errors";
import { today } from "./daily";
import { maybe, ms, n, nn, ok, one, P, rows } from "./db";
import type { Ctx, OpTable } from "./types";

// Dieta on Supabase: pulso.meals (one row per food; a dish's components share
// dish_id), pulso.waters, pulso.saved_dishes, the targets in pulso.settings
// (or the budget the goal decides), and the dated plan the web writes
// (pulso.plan_slots). Plan operations (skip, move, rebalance…) and undo live on
// the web for now.

type Row = MealRow & { saved_dish_id?: string | null };
type Settings = PulsoSettings & { nutrition_zones?: Partial<Record<Nutrient, TargetZone>>; water_unit?: "ml" | "vaso" | "botella" };
type Nutrient = keyof Macros;

/** The database keeps four meals; the phone's «media mañana» and «merienda» are snacks there. */
const DB_SLOTS = ["desayuno", "comida", "cena", "snack"] as const;
type DbSlot = (typeof DB_SLOTS)[number];
const toDbSlot = (slot: MealSlot): DbSlot => ((DB_SLOTS as readonly string[]).includes(slot) ? (slot as DbSlot) : "snack");

const r1 = (x: number) => Math.round(x * 10) / 10;
const QUANTITY_UNITS: QuantityUnit[] = ["g", "ml", "serving"];

export function toEntry(row: Row, tz: string): MealEntry {
  const unit = (QUANTITY_UNITS as string[]).includes(row.unit ?? "") ? (row.unit as QuantityUnit) : "g";
  return {
    id: row.id,
    date: row.local_date ?? localDate(row.eaten_at, tz),
    eatenAt: ms(row.eaten_at),
    slot: row.slot,
    name: row.name,
    quantity: nn(row.quantity) ?? 1,
    unit,
    kcal: n(row.kcal),
    protein: n(row.protein_g),
    carbs: n(row.carbs_g),
    fat: n(row.fat_g),
    fiber: n(row.fiber_g),
    caffeineMg: nn(row.caffeine_mg),
    alcoholG: nn(row.alcohol_g),
    source: (["manual", "barcode", "plan", "agent"].includes(row.source) ? row.source : "manual") as MealEntry["source"],
    barcode: row.barcode,
    planItemId: null,
    slotId: row.plan_slot_id,
    offPlan: row.off_plan,
    note: row.notes,
    measure: (row.measure as Measure | null) ?? null,
    dish: row.dish_id ? { id: row.dish_id, name: row.dish_name ?? row.name, savedDishId: row.saved_dish_id ?? null } : null,
  };
}

const macrosOf = (e: Pick<MealEntry, Nutrient>): Macros => ({ kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, fiber: e.fiber });

async function settingsOf(ctx: Ctx): Promise<Settings> {
  const found = maybe(await P(ctx).from("settings").select("*").maybeSingle());
  if (found) return found as Settings;
  return one(await P(ctx).from("settings").upsert({ user_id: ctx.userId, timezone: ctx.tz }).select("*").single()) as Settings;
}

async function latestWeight(ctx: Ctx): Promise<number | null> {
  const row = maybe(await P(ctx).from("weigh_ins").select("weight_kg").order("measured_at", { ascending: false }).limit(1).maybeSingle());
  return row ? n(row.weight_kg) : null;
}

// ── Targets and zones ──

type Direction = "loss" | "maintain" | "gain";
const MIN_BAND = 1.25;
const DEFAULTS: Record<Nutrient, { kind: ZoneKind; min: number; max: number }> = {
  kcal: { kind: "range", min: 0.95, max: 1.05 },
  protein: { kind: "min", min: 1, max: MIN_BAND },
  carbs: { kind: "range", min: 0.8, max: 1.1 },
  fat: { kind: "range", min: 0.8, max: 1.1 },
  fiber: { kind: "min", min: 1, max: MIN_BAND },
};
const KCAL: Record<Direction, { min: number; max: number }> = { loss: { min: 0.9, max: 1.05 }, maintain: { min: 0.95, max: 1.05 }, gain: { min: 0.95, max: 1.1 } };
const tidy = (k: Nutrient, v: number) => (k === "kcal" ? Math.round(v / 10) * 10 : Math.round(v));

function derivedZone(k: Nutrient, target: number, direction: Direction): TargetZone {
  const d = k === "kcal" ? { ...DEFAULTS.kcal, ...KCAL[direction] } : DEFAULTS[k];
  return { kind: d.kind, min: tidy(k, target * d.min), max: tidy(k, target * d.max), custom: false };
}

function customZone(k: Nutrient, target: number, input: ZoneInput, direction: Direction): TargetZone {
  const fallback = derivedZone(k, target, direction);
  const hasMin = input.min != null;
  const hasMax = input.max != null;
  const kind = input.kind ?? (hasMin && hasMax ? "range" : hasMin ? "min" : hasMax ? "max" : fallback.kind);
  if (kind === "max") return { kind, min: null, max: hasMax ? input.max! : target, custom: true };
  const min = hasMin ? input.min! : kind === "min" ? target : fallback.min!;
  const max = hasMax ? input.max! : kind === "min" ? tidy(k, min * MIN_BAND) : fallback.max!;
  return { kind, min, max: Math.max(min, max), custom: true };
}

function statusOf(value: number, zone: TargetZone): NutrientZone["status"] {
  if (zone.kind !== "max" && zone.min !== null && value < zone.min) return "below";
  if (zone.kind !== "min" && zone.max !== null && value > zone.max) return "above";
  return "inZone";
}

/** Targets set by hand (settings.*_target), else the budget the goal decides (see @life/db/pulso budget). */
export async function targetsOf(ctx: Ctx, settings?: Settings): Promise<NutritionTargets> {
  const s = settings ?? (await settingsOf(ctx));
  const [weight, scan] = await Promise.all([
    latestWeight(ctx),
    P(ctx).from("body_scans").select("metrics").order("scanned_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const scanBmr = nn((maybe(scan)?.metrics as Record<string, number> | undefined)?.bmr);
  const budget = computeBudget({ settings: s, weightKg: weight, scanBmr, today: today(ctx) });
  const direction: Direction = budget.direction === "bajar" ? "loss" : budget.direction === "subir" ? "gain" : "maintain";
  const macros: Macros = {
    kcal: s.kcal_target ?? budget.kcal,
    protein: nn(s.protein_g_target) ?? budget.protein,
    carbs: nn(s.carbs_g_target) ?? budget.carbs,
    fat: nn(s.fat_g_target) ?? budget.fat,
    fiber: nn(s.fiber_g_target) ?? budget.fiber,
  };
  const custom = s.nutrition_zones ?? {};
  const zones = Object.fromEntries(MACRO_KEYS.map((k) => [k, custom[k] ? { ...custom[k]!, custom: true } : derivedZone(k, macros[k], direction)])) as Record<Nutrient, TargetZone>;
  return { ...macros, updatedAt: ms(s.updated_at), zones };
}

function summarize(date: string, entries: MealEntry[], targets: NutritionTargets | null): DailySummary {
  const totals = sum(entries.map(macrosOf));
  const bySlot: DailySummary["bySlot"] = {};
  for (const e of entries) bySlot[e.slot] = sum([bySlot[e.slot] ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, macrosOf(e)]);
  const zones = targets
    ? (Object.fromEntries(MACRO_KEYS.map((k) => [k, { ...targets.zones[k], value: totals[k], target: targets[k], status: statusOf(totals[k], targets.zones[k]) }])) as Record<Nutrient, NutrientZone>)
    : null;
  return {
    date,
    totals,
    targets,
    remaining: targets ? (Object.fromEntries(MACRO_KEYS.map((k) => [k, r1(targets[k] - totals[k])])) as Macros) : null,
    zones,
    inZone: !!zones && entries.length > 0 && zones.kcal.status === "inZone" && zones.protein.status !== "below",
    bySlot,
    entries: entries.length,
    caffeineMg: r1(entries.reduce((t, e) => t + (e.caffeineMg ?? 0), 0)),
    alcoholG: r1(entries.reduce((t, e) => t + (e.alcoholG ?? 0), 0)),
  };
}

async function mealsBetween(ctx: Ctx, from: string, to: string): Promise<MealEntry[]> {
  const list = rows(await P(ctx).from("meals").select("*").gte("local_date", from).lte("local_date", to).order("eaten_at"));
  return (list as Row[]).map((r) => toEntry(r, ctx.tz));
}

// ── Water ──

const toWater = (row: WaterRow, tz: string): WaterEntry => ({
  id: row.id,
  date: row.local_date ?? localDate(row.drunk_at, tz),
  loggedAt: ms(row.drunk_at),
  amountMl: n(row.amount_ml),
  source: row.source === "agent" ? "agent" : "manual",
});

async function waterDay(ctx: Ctx, date: string, settings?: Settings): Promise<WaterDay> {
  const s = settings ?? (await settingsOf(ctx));
  const entries = rows(await P(ctx).from("waters").select("*").eq("local_date", date).order("drunk_at")).map((w) => toWater(w, ctx.tz));
  let goalMl = s.water_goal_ml ?? null;
  let goalSource: WaterDay["goalSource"] = "custom";
  if (goalMl == null) {
    const w = await latestWeight(ctx);
    goalMl = w ? Math.min(3700, Math.max(2000, Math.round((w * 35) / 50) * 50)) : 2000;
    goalSource = w ? "weight" : "default";
  }
  return {
    date,
    totalMl: entries.reduce((t, e) => t + e.amountMl, 0),
    goalMl,
    goalSource,
    entries,
    settings: { goalMl: s.water_goal_ml ?? null, unit: s.water_unit ?? "ml", glassMl: s.water_glass_ml, bottleMl: s.water_bottle_ml },
  };
}

// ── Dishes ──

const componentMacros = (c: DishComponent): Macros => ({ kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, fiber: c.fiber });

function toSavedDish(row: SavedDishRow, uses: { count: number; last: number | null }): SavedDish {
  const components = (row.components as unknown as DishComponent[]).map((c) => ({
    ...c,
    unit: (QUANTITY_UNITS as string[]).includes(c.unit) ? c.unit : "g",
    fiber: c.fiber ?? 0,
    measure: c.measure ?? null,
    barcode: c.barcode ?? null,
    caffeineMg: c.caffeineMg ?? null,
    alcoholG: c.alcoholG ?? null,
  })) as DishComponent[];
  return {
    id: row.id,
    name: row.name,
    slot: row.slot,
    components,
    macros: sum(components.map(componentMacros)),
    recipeId: row.recipe_id,
    uses: uses.count,
    lastUsedAt: uses.last,
    createdAt: ms(row.created_at),
    updatedAt: ms(row.updated_at),
  };
}

async function savedDishes(ctx: Ctx): Promise<SavedDish[]> {
  const [dishes, used] = await Promise.all([
    P(ctx).from("saved_dishes").select("*"),
    P(ctx).from("meals").select("saved_dish_id, dish_id, eaten_at").not("saved_dish_id" as never, "is", null).gte("local_date", addDays(today(ctx), -180)),
  ]);
  const uses = new Map<string, { logs: Set<string>; last: number | null }>();
  for (const m of rows(used) as unknown as { saved_dish_id: string; dish_id: string | null; eaten_at: string }[]) {
    const u = uses.get(m.saved_dish_id) ?? { logs: new Set<string>(), last: null };
    u.logs.add(m.dish_id ?? m.eaten_at);
    u.last = Math.max(u.last ?? 0, ms(m.eaten_at));
    uses.set(m.saved_dish_id, u);
  }
  return rows(dishes)
    .map((d) => toSavedDish(d, { count: uses.get(d.id)?.logs.size ?? 0, last: uses.get(d.id)?.last ?? null }))
    .sort((a, b) => b.uses - a.uses || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name, "es"));
}

// ── Logging ──

type FoodInput = {
  name: string;
  measure?: string | { amount: number; unit: Measure["unit"]; size?: number | null; base?: "g" | "ml" };
  quantity?: number;
  unit?: QuantityUnit;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  caffeineMg?: number | null;
  alcoholG?: number | null;
  barcode?: string | null;
};

/** The normalized amount of an input: its measure in words or as an object, else quantity + unit. */
function amountOf(input: FoodInput): { quantity: number; unit: QuantityUnit; measure: Measure | null } {
  if (typeof input.measure === "string") {
    const parsed = parseMeasure(input.measure);
    if (!parsed) throw new Error(`No entendí la cantidad «${input.measure}».`);
    const plain = parsed.measure.unit === "g" || parsed.measure.unit === "ml" || parsed.measure.unit === "serving";
    return { quantity: parsed.quantity, unit: parsed.unit, measure: plain ? null : parsed.measure };
  }
  if (input.measure) {
    const measure: Measure = { amount: input.measure.amount, unit: input.measure.unit, size: input.measure.size ?? null };
    const q = toQuantity(measure, input.measure.base);
    const plain = measure.unit === "g" || measure.unit === "ml" || measure.unit === "serving";
    return { ...q, measure: plain ? null : measure };
  }
  return { quantity: input.quantity ?? 1, unit: input.unit ?? "g", measure: null };
}

type When = { eatenAt?: number; time?: string; date?: string; slot?: MealSlot; slotId?: string | null };

function whenOf(ctx: Ctx, w: When, fallbackSlot: MealSlot = "snack"): { at: Date; date: string; slot: MealSlot } {
  let at: Date;
  if (w.time) at = zonedInstant(w.date ?? today(ctx), w.time.padStart(5, "0"), ctx.tz);
  else if (w.eatenAt) at = new Date(w.eatenAt);
  else if (w.date && w.date !== today(ctx)) at = zonedInstant(w.date, "13:00", ctx.tz);
  else at = new Date();
  return { at, date: w.date ?? localDate(at, ctx.tz), slot: w.slot ?? fallbackSlot };
}

function mealRow(ctx: Ctx, food: FoodInput, when: { at: Date; date: string; slot: MealSlot }, extra: Partial<Row> = {}) {
  const amount = amountOf(food);
  return {
    user_id: ctx.userId,
    eaten_at: when.at.toISOString(),
    local_date: when.date,
    slot: toDbSlot(when.slot),
    name: food.name.trim(),
    quantity: amount.quantity,
    unit: amount.unit,
    measure: amount.measure,
    kcal: Math.round(food.kcal),
    protein_g: r1(food.protein),
    carbs_g: r1(food.carbs),
    fat_g: r1(food.fat),
    fiber_g: r1(food.fiber ?? 0),
    caffeine_mg: food.caffeineMg ?? null,
    alcohol_g: food.alcoholG ?? null,
    barcode: food.barcode ?? null,
    source: "manual",
    ...extra,
  } as unknown as MealRow;
}

async function insertMeals(ctx: Ctx, list: MealRow[]): Promise<MealEntry[]> {
  if (!list.length) return [];
  const inserted = rows(await P(ctx).from("meals").insert(list).select("*")) as Row[];
  return inserted.map((r) => toEntry(r, ctx.tz)).sort((a, b) => a.eatenAt - b.eatenAt);
}

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const componentOf = (food: FoodInput): DishComponent => {
  const amount = amountOf(food);
  return {
    name: food.name.trim(),
    quantity: amount.quantity,
    unit: amount.unit,
    measure: amount.measure,
    kcal: Math.round(food.kcal),
    protein: r1(food.protein),
    carbs: r1(food.carbs),
    fat: r1(food.fat),
    fiber: r1(food.fiber ?? 0),
    caffeineMg: food.caffeineMg ?? null,
    alcoholG: food.alcoholG ?? null,
    barcode: food.barcode ?? null,
  };
};

const componentAsFood = (c: DishComponent, factor = 1): FoodInput => ({
  name: c.name,
  quantity: r1(c.quantity * factor),
  unit: c.unit,
  measure: c.measure ? { amount: r1(c.measure.amount * factor), unit: c.measure.unit, size: c.measure.size } : undefined,
  kcal: c.kcal * factor,
  protein: c.protein * factor,
  carbs: c.carbs * factor,
  fat: c.fat * factor,
  fiber: c.fiber * factor,
  caffeineMg: c.caffeineMg == null ? null : c.caffeineMg * factor,
  alcoholG: c.alcoholG == null ? null : c.alcoholG * factor,
  barcode: c.barcode,
});

// ── Plan (read; the web edits it) ──

function planItems(slot: PlanSlotRow, recipes: Map<string, RecipeRow>): PlanItem[] {
  const items: FoodItem[] = slot.recipe_id && recipes.has(slot.recipe_id) && !slot.items.length ? recipeServing(recipes.get(slot.recipe_id)!, n(slot.portions ?? 1)) : slot.items;
  return items.map((it, i) => ({
    id: `${slot.id}:${i}`,
    name: it.name,
    quantity: n(it.quantity),
    unit: (QUANTITY_UNITS as string[]).includes(it.unit) ? (it.unit as QuantityUnit) : "serving",
    kcal: n(it.kcal),
    protein: n(it.protein),
    carbs: n(it.carbs),
    fat: n(it.fat),
    fiber: n(it.fiber ?? 0),
  }));
}

function recipeServing(recipe: RecipeRow, portions: number): FoodItem[] {
  const f = portions / Math.max(1, n(recipe.servings));
  const total = recipe.ingredients.reduce(
    (t, i) => ({ kcal: t.kcal + n(i.kcal), protein: t.protein + n(i.protein), carbs: t.carbs + n(i.carbs), fat: t.fat + n(i.fat), fiber: t.fiber + n(i.fiber ?? 0) }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  return [{ name: recipe.name, quantity: portions, unit: "serving", kcal: total.kcal * f, protein: total.protein * f, carbs: total.carbs * f, fat: total.fat * f, fiber: total.fiber * f }];
}

function toRecipe(row: RecipeRow): Recipe {
  const ingredients = row.ingredients.map((i) => ({ name: i.name, quantity: n(i.quantity), unit: i.unit as Recipe["ingredients"][number]["unit"], kcal: n(i.kcal), protein: n(i.protein), carbs: n(i.carbs), fat: n(i.fat), fiber: n(i.fiber ?? 0) }));
  const total = sum(ingredients);
  const s = Math.max(1, n(row.servings));
  return {
    id: row.id,
    name: row.name,
    servings: n(row.servings),
    prepMinutes: row.prep_minutes,
    batch: row.batch,
    ingredients,
    perServing: Object.fromEntries(MACRO_KEYS.map((k) => [k, r1(total[k] / s)])) as Macros,
    steps: row.steps,
    variantOf: null,
    createdAt: ms(row.created_at),
  };
}

async function horizon(ctx: Ctx, from: string, days: number): Promise<DietHorizon | null> {
  const plan = maybe(await P(ctx).from("diet_plans").select("*").eq("active", true).maybeSingle());
  if (!plan) return null;
  const to = addDays(from, days - 1);
  const [slots, meals, recipes, settings] = await Promise.all([
    P(ctx).from("plan_slots").select("*").eq("plan_id", plan.id).gte("date", from).lte("date", to).order("date").order("position"),
    mealsBetween(ctx, from, to),
    P(ctx).from("recipes").select("*"),
    settingsOf(ctx),
  ]);
  const targets = await targetsOf(ctx, settings);
  const recipeMap = new Map(rows(recipes).map((r) => [r.id, r]));
  const todayDate = today(ctx);
  const nowMin = (() => {
    const t = new Date();
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: ctx.tz, hour: "2-digit", hourCycle: "h23" }).format(t)) * 60;
  })();
  const out: DietDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const dayMeals = meals.filter((m) => m.date === date);
    const daySlots = rows(slots).filter((s) => s.date === date);
    const planSlots: PlanSlot[] = daySlots.map((s) => {
      const items = planItems(s, recipeMap);
      const tied = dayMeals.filter((m) => m.slotId === s.id);
      const eaten = tied.length > 0;
      const macros = sum(items);
      const time = s.time ? Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3, 5)) : null;
      return {
        id: s.id,
        planId: s.plan_id,
        date,
        slot: s.slot,
        kind: s.recipe_id ? "recipe" : "items",
        name: s.name,
        recipeId: s.recipe_id,
        prepId: null,
        portions: nn(s.portions),
        items,
        adjusted: null,
        macros,
        status: eaten ? (tied.some((m) => m.offPlan) ? "replaced" : "eaten") : s.status,
        entryIds: tied.map((m) => m.id),
        replacedBy: tied.some((m) => m.offPlan) ? tied.map((m) => m.name).join(", ") : null,
        real: eaten
          ? { label: tied.map((m) => m.dish?.name ?? m.name).filter((v, k, a) => a.indexOf(v) === k).join(", "), entryIds: tied.map((m) => m.id), macros: sum(tied.map(macrosOf)), eatenAt: tied[0]!.eatenAt, asPlanned: !tied.some((m) => m.offPlan) }
          : null,
        missed: !eaten && s.status === "planned" && (date < todayDate || (date === todayDate && time !== null && nowMin > time + 120)),
        cookMinutes: s.recipe_id ? (recipeMap.get(s.recipe_id)?.prep_minutes ?? null) : null,
        note: s.note,
      };
    });
    const tiedIds = new Set(planSlots.flatMap((s) => s.entryIds));
    out.push({
      date,
      label: plan.days.length ? (plan.days[((Math.round((Date.parse(date) - Date.parse(plan.starts_on)) / 86_400_000) % plan.days.length) + plan.days.length) % plan.days.length]?.label ?? "") : "",
      slots: planSlots,
      planned: sum(planSlots.filter((s) => s.status !== "skipped").map((s) => (s.real ? s.real.macros : s.macros))),
      asPlanned: sum(planSlots.map((s) => s.macros)),
      real: sum(dayMeals.map(macrosOf)),
      extraIds: dayMeals.filter((m) => !tiedIds.has(m.id)).map((m) => m.id),
      shiftKcal: 0,
      goalKcal: targets.kcal,
      adjustment: null,
    });
  }
  return { planId: plan.id, planName: plan.name, from, to, horizonDays: days, days: out, preps: [], lastRevision: null };
}

// ── Operations ──

const MEALS_HISTORY_DAYS = 60;

export async function nutritionDay(ctx: Ctx, date: string) {
  const settings = await settingsOf(ctx);
  const [meals, targets, water, dishes] = await Promise.all([mealsBetween(ctx, date, date), targetsOf(ctx, settings), waterDay(ctx, date, settings), savedDishes(ctx)]);
  return { summary: summarize(date, meals, targets), meals, plan: null, water, dishes };
}

export const nutritionOps: OpTable = {
  async get_nutrition_day(ctx, { date }) {
    return nutritionDay(ctx, date ?? today(ctx));
  },
  async get_nutrition_history(ctx, { days, to }) {
    const end = to ?? today(ctx);
    const from = addDays(end, -(days - 1));
    const [meals, targets, waters] = await Promise.all([mealsBetween(ctx, from, end), targetsOf(ctx), P(ctx).from("waters").select("local_date, amount_ml").gte("local_date", from).lte("local_date", end)]);
    const water: Record<string, number> = {};
    for (const w of rows(waters)) if (w.local_date) water[w.local_date] = (water[w.local_date] ?? 0) + n(w.amount_ml);
    return { days: Array.from({ length: days }, (_, i) => addDays(from, i)).map((d) => summarize(d, meals.filter((m) => m.date === d), targets)), water };
  },
  async list_frequent_foods(ctx) {
    const meals = await mealsBetween(ctx, addDays(today(ctx), -MEALS_HISTORY_DAYS), today(ctx));
    const by = new Map<string, FrequentFood>();
    for (const m of meals) {
      if (m.dish) continue;
      const key = `${m.name.toLowerCase()}|${m.quantity}|${m.unit}`;
      const f = by.get(key);
      if (f) f.count++;
      else by.set(key, { name: m.name, quantity: m.quantity, unit: m.unit, measure: m.measure, slot: m.slot, barcode: m.barcode, count: 1, ...macrosOf(m), caffeineMg: m.caffeineMg, alcoholG: m.alcoholG });
    }
    const foods = [...by.values()].filter((f) => f.count >= 2).sort((a, b) => b.count - a.count).slice(0, 30);
    return { dishes: await savedDishes(ctx), foods };
  },
  async get_nutrition_targets(ctx) {
    return { targets: await targetsOf(ctx) };
  },
  async replace_nutrition_targets(ctx, input) {
    const fiber = input.fiber ?? Math.round((input.kcal / 1000) * 14);
    const direction: Direction = "maintain";
    const target: Macros = { kcal: input.kcal, protein: input.protein, carbs: input.carbs, fat: input.fat, fiber };
    const zones: Partial<Record<Nutrient, TargetZone>> = {};
    for (const [k, z] of Object.entries(input.zones ?? {}) as [Nutrient, ZoneInput][]) zones[k] = customZone(k, target[k], z, direction);
    ok(
      await P(ctx)
        .from("settings")
        .update({ kcal_target: Math.round(input.kcal), protein_g_target: input.protein, carbs_g_target: input.carbs, fat_g_target: input.fat, fiber_g_target: fiber, nutrition_zones: zones } as never)
        .eq("user_id", ctx.userId),
    );
    return { targets: await targetsOf(ctx) };
  },
  async get_barcode_product(_ctx, { code }) {
    const barcode = normalizeBarcode(code);
    if (!barcode) throw new Error("Ese código no parece un código de barras.");
    return { product: await lookupBarcode(barcode) };
  },
  async estimate_barcode_portion(_ctx, { barcode, amount }) {
    const code = normalizeBarcode(barcode);
    if (!code) throw new Error("Ese código no parece un código de barras.");
    const product = await lookupBarcode(code);
    if (!product) throw new Error("No encontré ese producto.");
    return { estimate: estimatePortion(product, amount) };
  },
  async add_meal_entry(ctx, input) {
    const when = whenOf(ctx, { eatenAt: input.eatenAt, date: input.date, slot: input.slot });
    const [meal] = await insertMeals(ctx, [mealRow(ctx, input, when, { source: input.source } as Partial<Row>)]);
    return { meal: meal! };
  },
  async update_meal(ctx, { id, time, ...input }) {
    const before = one(await P(ctx).from("meals").select("*").eq("id", id).single(), "Esa comida") as Row;
    const date = input.date ?? before.local_date ?? localDate(before.eaten_at, ctx.tz);
    const when = before.dish_id && !time && !input.eatenAt ? { at: new Date(before.eaten_at), date, slot: before.slot } : whenOf(ctx, { time, eatenAt: input.eatenAt, date, slot: input.slot });
    const next = mealRow(ctx, input, when, {});
    const { user_id: _u, source: _s, ...patch } = next as unknown as Record<string, unknown>;
    const sameMeal = when.date === date && toDbSlot(when.slot) === before.slot;
    const updated = one(await P(ctx).from("meals").update({ ...patch, plan_slot_id: sameMeal ? before.plan_slot_id : null, barcode: input.barcode ?? before.barcode } as never).eq("id", id).select("*").single()) as Row;
    return { meal: toEntry(updated, ctx.tz) };
  },
  async delete_meal_entry(ctx, { id }) {
    ok(await P(ctx).from("meals").delete().eq("id", id));
    return { deleted: id };
  },
  async copy_meals(ctx, { from, to }) {
    const source = from ?? addDays(to, -1);
    const list = rows(await P(ctx).from("meals").select("*").eq("local_date", source)) as Row[];
    const dishIds = new Map<string, string>();
    const copies = list.map((r) => {
      const time = new Intl.DateTimeFormat("en-GB", { timeZone: ctx.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(r.eaten_at));
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = r;
      if (r.dish_id && !dishIds.has(r.dish_id)) dishIds.set(r.dish_id, uuid());
      return { ...rest, eaten_at: zonedInstant(to, time, ctx.tz).toISOString(), local_date: to, plan_slot_id: null, dish_id: r.dish_id ? dishIds.get(r.dish_id)! : null } as MealRow;
    });
    return { meals: await insertMeals(ctx, copies) };
  },
  async log_new_dish(ctx, { name, components, ...when }) {
    const w = whenOf(ctx, when);
    const dishId = uuid();
    const dishName = name ?? components.map((c) => c.name).join(", ");
    return { meals: await insertMeals(ctx, components.map((c) => mealRow(ctx, c, w, { dish_id: dishId, dish_name: dishName, plan_slot_id: when.slotId ?? null }))) };
  },
  async edit_logged_dish(ctx, { id, name, add }) {
    const parts = rows(await P(ctx).from("meals").select("*").eq("dish_id", id)) as Row[];
    const first = parts[0];
    if (!first) throw new Error("Ese platillo ya no existe.");
    if (name) ok(await P(ctx).from("meals").update({ dish_name: name }).eq("dish_id", id));
    if (add?.length) {
      const w = { at: new Date(first.eaten_at), date: first.local_date ?? localDate(first.eaten_at, ctx.tz), slot: first.slot };
      await insertMeals(ctx, add.map((c) => mealRow(ctx, c, w, { dish_id: id, dish_name: name ?? first.dish_name, plan_slot_id: first.plan_slot_id, saved_dish_id: first.saved_dish_id ?? null })));
    }
    return { meals: (rows(await P(ctx).from("meals").select("*").eq("dish_id", id).order("eaten_at")) as Row[]).map((r) => toEntry(r, ctx.tz)) };
  },
  async list_saved_dishes(ctx) {
    return { dishes: await savedDishes(ctx) };
  },
  async create_saved_dish(ctx, input) {
    let components: DishComponent[];
    let name = input.name;
    if (input.loggedDishId) {
      const parts = (rows(await P(ctx).from("meals").select("*").eq("dish_id", input.loggedDishId).order("eaten_at")) as Row[]).map((r) => toEntry(r, ctx.tz));
      if (!parts.length) throw new Error("Ese platillo ya no existe.");
      components = parts.map((p) => ({ name: p.name, quantity: p.quantity, unit: p.unit, measure: p.measure, barcode: p.barcode, caffeineMg: p.caffeineMg, alcoholG: p.alcoholG, ...macrosOf(p) }));
      name ??= parts[0]!.dish?.name ?? parts[0]!.name;
    } else if (input.recipeId) {
      const recipe = one(await P(ctx).from("recipes").select("*").eq("id", input.recipeId).single(), "Esa receta");
      components = recipeServing(recipe, 1).map((i) => ({ name: i.name, quantity: 1, unit: "serving", measure: null, barcode: null, caffeineMg: null, alcoholG: null, kcal: Math.round(i.kcal), protein: r1(i.protein), carbs: r1(i.carbs), fat: r1(i.fat), fiber: r1(i.fiber ?? 0) }));
      name ??= recipe.name;
    } else if (input.components?.length && name) components = input.components.map(componentOf);
    else throw new Error("Dale un nombre y al menos un alimento.");
    const row = one(
      await P(ctx)
        .from("saved_dishes")
        .insert({ user_id: ctx.userId, name, slot: input.slot ? toDbSlot(input.slot) : null, components: components as unknown as FoodItem[], recipe_id: input.recipeId ?? null })
        .select("*")
        .single(),
    );
    return { dish: toSavedDish(row, { count: 0, last: null }) };
  },
  async edit_saved_dish(ctx, { id, name, slot, components }) {
    const patch: Partial<SavedDishRow> = {};
    if (name) patch.name = name;
    if (slot !== undefined) patch.slot = slot ? toDbSlot(slot) : null;
    if (components) patch.components = components.map(componentOf) as unknown as FoodItem[];
    const row = one(await P(ctx).from("saved_dishes").update(patch).eq("id", id).select("*").single(), "Ese platillo");
    const dish = (await savedDishes(ctx)).find((d) => d.id === id);
    return { dish: dish ?? toSavedDish(row, { count: 0, last: null }) };
  },
  async delete_saved_dish(ctx, { id }) {
    ok(await P(ctx).from("saved_dishes").delete().eq("id", id));
    return { deleted: id };
  },
  async log_saved_dish(ctx, { id, scale, overrides, add, ...when }) {
    const row = one(await P(ctx).from("saved_dishes").select("*").eq("id", id).single(), "Ese platillo");
    const dish = toSavedDish(row, { count: 0, last: null });
    const factor = scale ?? 1;
    const foods: FoodInput[] = [];
    dish.components.forEach((c, i) => {
      const o = overrides?.find((x) => x.component === i || (typeof x.component === "string" && x.component.toLowerCase() === c.name.toLowerCase()));
      if (o?.remove) return;
      if (o?.measure) {
        const parsed = parseMeasure(o.measure);
        if (!parsed) throw new Error(`No entendí la cantidad «${o.measure}».`);
        const f = c.quantity > 0 && parsed.unit === c.unit ? parsed.quantity / c.quantity : NaN;
        if (!Number.isFinite(f)) throw new Error(`«${o.measure}» no se puede comparar con ${c.name}.`);
        foods.push({ ...componentAsFood(c, f), measure: o.measure });
      } else foods.push(componentAsFood(c, factor));
    });
    for (const a of add ?? []) foods.push(a);
    const w = whenOf(ctx, when, dish.slot ?? "snack");
    const dishId = uuid();
    return { meals: await insertMeals(ctx, foods.map((f) => mealRow(ctx, f, w, { dish_id: dishId, dish_name: dish.name, saved_dish_id: id, plan_slot_id: when.slotId ?? null } as Partial<Row>))) };
  },
  async get_water_day(ctx, { date }) {
    return waterDay(ctx, date ?? today(ctx));
  },
  async add_water_entry(ctx, { amountMl, loggedAt, date }) {
    const at = loggedAt ? new Date(loggedAt) : date && date !== today(ctx) ? zonedInstant(date, "13:00", ctx.tz) : new Date();
    const day = date ?? localDate(at, ctx.tz);
    const row = one(await P(ctx).from("waters").insert({ user_id: ctx.userId, drunk_at: at.toISOString(), local_date: day, amount_ml: Math.round(amountMl), source: "manual" }).select("*").single());
    return { entry: toWater(row, ctx.tz), day: await waterDay(ctx, day) };
  },
  async delete_water(ctx, { id }) {
    ok(await P(ctx).from("waters").delete().eq("id", id));
    return { deleted: id };
  },
  async set_water_settings(ctx, input) {
    const patch: Record<string, unknown> = {};
    if (input.goalMl !== undefined) patch.water_goal_ml = input.goalMl == null ? null : Math.round(input.goalMl);
    if (input.unit) patch.water_unit = input.unit;
    if (input.glassMl) patch.water_glass_ml = Math.round(input.glassMl);
    if (input.bottleMl) patch.water_bottle_ml = Math.round(input.bottleMl);
    ok(await P(ctx).from("settings").update(patch as never).eq("user_id", ctx.userId));
    return { settings: (await waterDay(ctx, today(ctx))).settings };
  },
  async get_plan_day() {
    return { plan: null };
  },
  async get_plan_horizon(ctx, { from, days }) {
    return { horizon: await horizon(ctx, from ?? today(ctx), days ?? 7) };
  },
  async eat_planned_meal(ctx, { slotId }) {
    if (!slotId) throw new NotAvailableError("Marcar un alimento suelto del plan");
    const slot = one(await P(ctx).from("plan_slots").select("*").eq("id", slotId).single(), "Esa comida del plan");
    const recipes = new Map(rows(await P(ctx).from("recipes").select("*")).map((r) => [r.id, r]));
    const items = planItems(slot, recipes);
    const w = whenOf(ctx, { date: slot.date, time: slot.date === today(ctx) ? undefined : (slot.time ?? undefined)?.slice(0, 5), slot: slot.slot });
    const dishId = items.length > 1 ? uuid() : null;
    const meals = await insertMeals(
      ctx,
      items.map((it) => mealRow(ctx, { ...it, measure: undefined }, w, { plan_slot_id: slot.id, source: "plan", dish_id: dishId, dish_name: dishId ? (slot.name ?? "Comida del plan") : null })),
    );
    return { meals };
  },
  async list_diet_recipes(ctx) {
    return { recipes: rows(await P(ctx).from("recipes").select("*").order("name")).map(toRecipe) };
  },
  async get_recipe(ctx, { id }) {
    return { recipe: toRecipe(one(await P(ctx).from("recipes").select("*").eq("id", id).single(), "Esa receta")) };
  },
  async list_plan_revisions() {
    return { revisions: [] };
  },
};
