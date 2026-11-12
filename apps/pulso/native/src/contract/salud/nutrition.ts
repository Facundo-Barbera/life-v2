// Pulso's `@pulso/contract` `nutrition.ts` as it is (its types keep their Pulso names), then its operations.
import { z } from "zod";
import { op } from "./operation";

/** Nutrition: meal log, daily targets, diet plans, day adjustments, water and barcode lookups. */

export const MEAL_SLOTS = ["desayuno", "media_manana", "comida", "merienda", "cena", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SOURCES = ["manual", "barcode", "plan", "agent"] as const;
export type MealSource = (typeof MEAL_SOURCES)[number];

/** What macros are counted against: grams, millilitres, or whole servings. Older entries logged drinks as `g`. */
export const QUANTITY_UNITS = ["g", "ml", "serving"] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const HOUSEHOLD_UNITS = ["taza", "vaso", "lata", "botella", "cucharada", "cucharadita", "unidad", "puño"] as const;
/** Measures people say out loud. Each converts to g or ml with a default size, which an entry can override. */
export type HouseholdUnit = (typeof HOUSEHOLD_UNITS)[number];

/**
 * Default size of one household unit. `unidad` has none: without a size it
 * counts as servings ("2 galletas"), with one as grams ("2 galletas de 11 g").
 */
export const HOUSEHOLD_SIZES: Record<HouseholdUnit, { base: "g" | "ml"; size: number | null }> = {
  taza: { base: "ml", size: 240 },
  vaso: { base: "ml", size: 250 },
  lata: { base: "ml", size: 355 },
  botella: { base: "ml", size: 500 },
  cucharada: { base: "ml", size: 15 },
  cucharadita: { base: "ml", size: 5 },
  unidad: { base: "g", size: null },
  puño: { base: "g", size: 30 },
};

export const MEASURE_UNITS = [...QUANTITY_UNITS, ...HOUSEHOLD_UNITS] as const;
export type MeasureUnit = (typeof MEASURE_UNITS)[number];

// Every type the phone's operations answer with is a zod schema of the same name (the registry parses answers with
// it, so each field Pulso sent is here); the input shapes stay types.
export const MealSlot = z.enum(MEAL_SLOTS);
export const MealSource = z.enum(MEAL_SOURCES);
export const QuantityUnit = z.enum(QUANTITY_UNITS);
export const MeasureUnit = z.enum(MEASURE_UNITS);
const MACRO_NAMES = ["kcal", "protein", "carbs", "fat", "fiber"] as const;

/** How much, as the person said it: "2 latas", "1 taza de 300 ml", "30 g". */
export const Measure = z.object({
  amount: z.number(),
  unit: MeasureUnit,
  /** g or ml in one household unit, when not its default (e.g. a 330 ml can). null for g, ml and serving. */
  size: z.number().nullable(),
});
export type Measure = z.infer<typeof Measure>;

/** Energy in kcal, everything else in grams. */
export const Macros = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), fiber: z.number() });
export type Macros = z.infer<typeof Macros>;

/** Caffeine and alcohol in an entry, when the food or drink has them. */
export const Stimulants = z.object({
  /** Caffeine in mg. */
  caffeineMg: z.number().nullable(),
  /** Pure alcohol in grams. */
  alcoholG: z.number().nullable(),
});
export type Stimulants = z.infer<typeof Stimulants>;

/**
 * A dish eaten: several foods eaten together as one thing ("Batido de proteína
 * con fresas"). Its components are ordinary entries carrying this ref, so day
 * totals, the plan and history read them as before; the dish's total is theirs.
 */
export const DishRef = z.object({
  id: z.string(),
  name: z.string(),
  /** The saved dish (Mis platillos) it was logged from, if any. */
  savedDishId: z.string().nullable(),
});
export type DishRef = z.infer<typeof DishRef>;

/**
 * A logged food or drink. Macros are totals for `quantity`, not per 100 g.
 * `quantity` + `unit` are the normalized amount; `measure` is what the person said.
 */
export const MealEntry = z.object({
  ...Macros.shape,
  ...Stimulants.shape,
  id: z.string(),
  /** Local calendar day (YYYY-MM-DD) the entry counts toward. */
  date: z.string(),
  /** Epoch ms. */
  eatenAt: z.number(),
  slot: MealSlot,
  name: z.string(),
  quantity: z.number(),
  unit: QuantityUnit,
  source: MealSource,
  barcode: z.string().nullable(),
  /** The plan item this entry fulfils, when logged from the plan. */
  planItemId: z.string().nullable(),
  /** The dated plan slot this entry is the real meal of (eaten as planned, or instead); null for an extra. */
  slotId: z.string().nullable(),
  /** Derived: true when it was eaten instead of the planned meal of `slotId`. Kept for older clients. */
  offPlan: z.boolean(),
  /** The person's own words for the meal, e.g. "Big Mac y papas medianas". */
  note: z.string().nullable(),
  /** The amount as said ("2 latas"); null when it was logged straight in g, ml or servings. */
  measure: Measure.nullable(),
  /** The dish (platillo) this entry is a component of; null for a food logged on its own. */
  dish: DishRef.nullable(),
});
export type MealEntry = z.infer<typeof MealEntry>;

export type MealInput = Omit<
  MealEntry,
  "id" | "date" | "eatenAt" | "source" | "barcode" | "planItemId" | "slotId" | "offPlan" | "note" | "measure" | "caffeineMg" | "alcoholG" | "dish"
> & {
  /** Defaults to now. */
  eatenAt?: number;
  /** Defaults to the local day of `eatenAt`. */
  date?: string;
  source?: MealSource;
  barcode?: string | null;
  planItemId?: string | null;
  /** The slot this meal is; omitted, the engine finds it (see reconcile.ts). */
  slotId?: string | null;
  /** With slotId: eaten instead of that meal even if it carries plan items. Otherwise ignored. */
  offPlan?: boolean;
  note?: string | null;
  measure?: Measure | null;
  caffeineMg?: number | null;
  alcoholG?: number | null;
};

/**
 * How a nutrient's zone reads: `min` = reach at least `min` (protein, fiber; going
 * past `max` is fine, `max` only ends the band drawn); `range` = stay between `min`
 * and `max` (kcal, carbs, fat); `max` = stay under `max`.
 */
export const ZoneKind = z.enum(["min", "range", "max"]);
export type ZoneKind = z.infer<typeof ZoneKind>;

/** The "estás bien aquí" band around one target. kcal or grams, like the target. */
export const TargetZone = z.object({
  kind: ZoneKind,
  /** null for `max` zones. */
  min: z.number().nullable(),
  max: z.number().nullable(),
  /** Set by the Coach or the person; false when derived from the target and the body goal. */
  custom: z.boolean(),
});
export type TargetZone = z.infer<typeof TargetZone>;

export const ZoneStatus = z.enum(["below", "inZone", "above"]);
export type ZoneStatus = z.infer<typeof ZoneStatus>;

/** One nutrient of one day against its zone. `above` only exists for `range` and `max` zones. */
export const NutrientZone = TargetZone.extend({ value: z.number(), target: z.number(), status: ZoneStatus });
export type NutrientZone = z.infer<typeof NutrientZone>;

export const NutritionTargets = Macros.extend({ updatedAt: z.number(), zones: z.record(z.enum(MACRO_NAMES), TargetZone) });
export type NutritionTargets = z.infer<typeof NutritionTargets>;

/** A zone as set by the Coach or the person: either bound may be left out (kind follows from which are given). */
export type ZoneInput = { min?: number | null; max?: number | null; kind?: ZoneKind };

export const DailySummary = z.object({
  date: z.string(),
  totals: Macros,
  /** null until targets are set. */
  targets: NutritionTargets.nullable(),
  /** targets − totals (negative = over). null without targets. */
  remaining: Macros.nullable(),
  /** Each nutrient against its zone; null without targets. */
  zones: z.record(z.enum(MACRO_NAMES), NutrientZone).nullable(),
  /** Something logged, kcal in its zone and protein at least its minimum. False without targets. */
  inZone: z.boolean(),
  bySlot: z.partialRecord(MealSlot, Macros),
  entries: z.number(),
  /** Caffeine (mg) and alcohol (g) logged that day; 0 when none. */
  caffeineMg: z.number(),
  alcoholG: z.number(),
});
export type DailySummary = z.infer<typeof DailySummary>;

export const PlanItem = Macros.extend({ id: z.string(), name: z.string(), quantity: z.number(), unit: QuantityUnit });
export type PlanItem = z.infer<typeof PlanItem>;
export const PlanMeal = z.object({ slot: MealSlot, name: z.string().nullable(), items: z.array(PlanItem) });
export type PlanMeal = z.infer<typeof PlanMeal>;
export const PlanDay = z.object({ label: z.string(), meals: z.array(PlanMeal) });
export type PlanDay = z.infer<typeof PlanDay>;

/** A diet plan. Days repeat in order starting on `startsOn` (one day = same every day; seven = a week). */
export const DietPlan = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  startsOn: z.string(),
  active: z.boolean(),
  createdAt: z.number(),
  days: z.array(PlanDay),
});
export type DietPlan = z.infer<typeof DietPlan>;

/** Plan items and meals before ids are assigned. */
export type DietPlanInput = {
  name: string;
  notes?: string | null;
  startsOn?: string;
  activate?: boolean;
  days: { label: string; meals: { slot: MealSlot; name?: string | null; items: Omit<PlanItem, "id">[] }[] }[];
};

/** How an adjusted meal differs from the plan: portions scaled, or replaced by the Coach. */
export const AdjustedMeal = PlanMeal.extend({ change: z.enum(["scaled", "swapped", "same"]) });
export type AdjustedMeal = z.infer<typeof AdjustedMeal>;

/**
 * The Coach's rewrite of what is left of one day, on top of the plan (which stays
 * untouched). Scaled items keep their plan item id; swapped ones get new ids.
 */
export const DayAdjustment = z.object({
  date: z.string(),
  planId: z.string(),
  dayIndex: z.number(),
  /** Portion factor applied to the planned meals that were not swapped. */
  factor: z.number(),
  /** The meals still ahead that day, as they should now be eaten. */
  meals: z.array(AdjustedMeal),
  /** Eaten when the adjustment was made. */
  eaten: Macros,
  targets: Macros,
  /** Where the day ends if the adjusted meals are eaten. */
  projected: Macros,
  /** One Spanish line, e.g. "Merienda y cena al 80 %. Cierras el día en 2.180 de 2.200 kcal." */
  summary: z.string(),
  /** The Coach's reason, in Spanish. */
  note: z.string().nullable(),
  createdAt: z.number(),
});
export type DayAdjustment = z.infer<typeof DayAdjustment>;

/** The active plan as seen on one date: which day applies, which items are already logged, and the day's adjustment. */
export const PlanForDay = z.object({ plan: DietPlan, dayIndex: z.number(), day: PlanDay, eatenItemIds: z.array(z.string()), adjustment: DayAdjustment.nullable() });
export type PlanForDay = z.infer<typeof PlanForDay>;

/** A packaged food from Open Food Facts. Macros per 100 g, or per 100 ml when `liquid`. */
export const FoodProduct = z.object({
  barcode: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  per100g: Macros,
  /** Grams (ml when `liquid`) in one serving, when the label says. */
  servingGrams: z.number().nullable(),
  imageUrl: z.string().nullable(),
  /** A drink, counted in ml: the package or serving is in ml/cl/L, or it is filed under beverages. */
  liquid: z.boolean(),
  /** Grams (ml when `liquid`) in the package as sold; one unit of a multipack ("6 x 330 ml" → 330). */
  packageSize: z.number().nullable(),
  /** The package, when Open Food Facts knows it, so a drink logs as "1 lata" or "1 botella". */
  packageKind: z.enum(["lata", "botella"]).nullable(),
});
export type FoodProduct = z.infer<typeof FoodProduct>;

/**
 * How much of a packaged product an amount said in words is ("una cucharada",
 * "la mitad del paquete", "3 galletas"), with the macros for it.
 */
export const PortionEstimate = z.object({
  barcode: z.string(),
  name: z.string(),
  /** g, or ml for a drink. */
  quantity: z.number(),
  unit: z.enum(["g", "ml"]),
  /** Totals for `quantity`. */
  macros: Macros,
  /** The amount as said, to log; null for a share of a package that isn't a can or bottle. */
  measure: Measure.nullable(),
  /** Share of the package (0–1) when its size is known. */
  packageShare: z.number().nullable(),
  /** One line in Spanish: "1 cucharada de Crema de cacahuete ≈ 16 g → 94 kcal". */
  assumption: z.string(),
});
export type PortionEstimate = z.infer<typeof PortionEstimate>;

/** `POST …/nutrition/portion` (phone) and `…/dieta/portion` (web). */
export type PortionRequest = { barcode: string; amount: string };

export const WATER_UNITS = ["ml", "vaso", "botella"] as const;
/** How the person counts water: millilitres, glasses or bottles of their own sizes. */
export const WaterUnit = z.enum(WATER_UNITS);
export type WaterUnit = z.infer<typeof WaterUnit>;

export const WaterSettings = z.object({
  /** Daily goal in ml; null means derived (35 ml/kg of body weight kept within 2000–3700 ml, or 2000 ml). */
  goalMl: z.number().nullable(),
  unit: WaterUnit,
  glassMl: z.number(),
  bottleMl: z.number(),
});
export type WaterSettings = z.infer<typeof WaterSettings>;

export const WaterEntry = z.object({
  id: z.string(),
  /** Local calendar day (YYYY-MM-DD). */
  date: z.string(),
  /** Epoch ms. */
  loggedAt: z.number(),
  amountMl: z.number(),
  source: z.enum(["manual", "agent"]),
});
export type WaterEntry = z.infer<typeof WaterEntry>;

export const WaterDay = z.object({
  date: z.string(),
  totalMl: z.number(),
  goalMl: z.number(),
  /** Where goalMl came from. */
  goalSource: z.enum(["custom", "weight", "default"]),
  /** Oldest first. */
  entries: z.array(WaterEntry),
  settings: WaterSettings,
});
export type WaterDay = z.infer<typeof WaterDay>;

/** One food in a saved dish, as it is logged by default. Macros are totals for its amount. */
export const DishComponent = z.object({
  ...Macros.shape,
  ...Stimulants.shape,
  name: z.string(),
  quantity: z.number(),
  unit: QuantityUnit,
  measure: Measure.nullable(),
  barcode: z.string().nullable(),
});
export type DishComponent = z.infer<typeof DishComponent>;

/** A saved dish (Mis platillos): a reusable template, logged in one tap and optionally scaled or tweaked. */
export const SavedDish = z.object({
  id: z.string(),
  name: z.string(),
  /** The meal it is usually eaten as; null when it varies. */
  slot: MealSlot.nullable(),
  /** One default portion. */
  components: z.array(DishComponent),
  /** Totals of the components: kcal and grams. */
  macros: Macros,
  /** The plan recipe it was saved from, if any. */
  recipeId: z.string().nullable(),
  /** Times logged. */
  uses: z.number(),
  lastUsedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SavedDish = z.infer<typeof SavedDish>;

/** Everything the Dieta tab draws for one day, in one request. `dishes` are the saved ones, most used first. */
export const NutritionDay = z.object({ summary: DailySummary, meals: z.array(MealEntry), plan: PlanForDay.nullable(), water: WaterDay, dishes: z.array(SavedDish) });
export type NutritionDay = z.infer<typeof NutritionDay>;

/** How to log a saved dish this time: scaled ("medio" = 0.5) and with one-off changes to its components. */
export type LogDishOptions = {
  /** Portion factor, 1 by default. */
  scale?: number;
  /** One-off changes: a component (index or name) with a new amount in words ("300 ml"), or removed. */
  overrides?: { component: number | string; measure?: string; remove?: boolean }[];
};

/** A food the person logs often, for quick add. Macros are per one logged `quantity`. */
export const FrequentFood = z.object({
  ...Macros.shape,
  ...Stimulants.shape,
  name: z.string(),
  quantity: z.number(),
  unit: QuantityUnit,
  measure: Measure.nullable(),
  slot: MealSlot,
  barcode: z.string().nullable(),
  count: z.number(),
});
export type FrequentFood = z.infer<typeof FrequentFood>;

// ── The dated diet (Pulso's `@pulso/contract` `diet.ts`) ─────────────────────
// Its schemas live here, not in ./diet.ts: they are built on the ones above and
// the operations below answer with them, and two modules importing each other's
// values would break on load. ./diet.ts keeps the input types.

/**
 * What fills a slot: the plan's own item list, a portion of a recipe cooked
 * that day, a portion of a prep batch cooked earlier, or a budget for eating out.
 */
export const SLOT_KINDS = ["items", "recipe", "prep", "eat_out"] as const;
export const SlotKind = z.enum(SLOT_KINDS);
export type SlotKind = z.infer<typeof SlotKind>;

/** `eaten` is derived from linked log entries; the other three are stored. */
export const SLOT_STATUSES = ["planned", "eaten", "replaced", "skipped"] as const;
export const SlotStatus = z.enum(SLOT_STATUSES);
export type SlotStatus = z.infer<typeof SlotStatus>;

/** The entries tied to a meal, as one meal: "Tortitas de carne de res, queso amarillo y arroz blanco · 965 kcal". */
export const RealMeal = z.object({
  /** What was eaten in one line: a dish by its name ("Batido de proteína con fresas"), other entries by theirs. `entryIds` expand it. */
  label: z.string(),
  entryIds: z.array(z.string()),
  /** Totals of those entries: kcal and grams. */
  macros: Macros,
  /** When the first of them was eaten, epoch ms. */
  eatenAt: z.number(),
  /** True when it is exactly what the plan had (its items, ticked or logged as planned). */
  asPlanned: z.boolean(),
});
export type RealMeal = z.infer<typeof RealMeal>;

/** One meal on one date. */
export const PlanSlot = z.object({
  id: z.string(),
  planId: z.string(),
  date: z.string(),
  slot: MealSlot,
  kind: SlotKind,
  /** Dish name ("Pasta boloñesa"), or null for a plain item list. */
  name: z.string().nullable(),
  recipeId: z.string().nullable(),
  prepId: z.string().nullable(),
  /** Portions of the recipe or batch (recipe and prep kinds). */
  portions: z.number().nullable(),
  /**
   * What to eat as planned. Recipe and prep slots carry one item (the dish, in
   * servings); an eat-out slot carries its budget as one item.
   */
  items: z.array(PlanItem),
  /** The day's adjustment for this meal (scaled or swapped portions), when the Coach rebalanced the day. */
  adjusted: z.array(PlanItem).nullable(),
  /** Totals of what should be eaten now: `adjusted` when present, else `items`. kcal and grams. */
  macros: Macros,
  status: SlotStatus,
  /** Log entries linked to this slot (eaten as planned, or eaten instead). */
  entryIds: z.array(z.string()),
  /** What was eaten instead, when replaced (entry names). */
  replacedBy: z.string().nullable(),
  /** What was actually eaten for this meal (the entries tied to it), when anything was: Planeado → Real. */
  real: RealMeal.nullable(),
  /** Still pending well after its time (or on a past day) with nothing logged: «sin registrar», a soft state, not a skip. */
  missed: z.boolean(),
  /** Minutes of cooking that day: the recipe's prep time; 0 for a batch portion or eating out; null when unknown. */
  cookMinutes: z.number().nullable(),
  note: z.string().nullable(),
});
export type PlanSlot = z.infer<typeof PlanSlot>;

export const DietDay = z.object({
  date: z.string(),
  /** The plan day's label from the rotation ("Lunes", "Día de entreno"). */
  label: z.string(),
  slots: z.array(PlanSlot),
  /** What the day's planned slots add up to now (eaten + still planned). */
  planned: Macros,
  /** Everything the plan had for the day as written (every slot, whatever happened to it): the «Planeado» total. */
  asPlanned: Macros,
  /** Everything logged that day, meals and extras: the «Real» total. */
  real: Macros,
  /** Entries logged that day that no meal holds (snacks, drinks): the day's «Extras», oldest first. */
  extraIds: z.array(z.string()),
  /** kcal moved onto this day by spreading a deviation (negative = lighter day). */
  shiftKcal: z.number(),
  /** The day's kcal goal: targets (or the plan day's total) plus the shift. */
  goalKcal: z.number(),
  adjustment: DayAdjustment.nullable(),
});
export type DietDay = z.infer<typeof DietDay>;

export const RecipeIngredient = Macros.extend({
  name: z.string(),
  quantity: z.number(),
  /** g, ml, serving or a household unit (lata, taza…), as in meal measures. */
  unit: MeasureUnit,
});
export type RecipeIngredient = z.infer<typeof RecipeIngredient>;

export const Recipe = z.object({
  id: z.string(),
  name: z.string(),
  /** Portions the ingredients make. */
  servings: z.number(),
  prepMinutes: z.number(),
  /** Worth cooking in a batch for several days (keeps well). */
  batch: z.boolean(),
  /** For the whole recipe; macros are totals for each amount. */
  ingredients: z.array(RecipeIngredient),
  /** One portion. */
  perServing: Macros,
  steps: z.string().nullable(),
  /** The recipe this one was derived from (an ingredient swapped). */
  variantOf: z.string().nullable(),
  createdAt: z.number(),
});
export type Recipe = z.infer<typeof Recipe>;

export const PREP_STATUSES = ["planned", "cooked", "discarded"] as const;
export const PrepStatus = z.enum(PREP_STATUSES);
export type PrepStatus = z.infer<typeof PrepStatus>;

/** A recipe cooked on one date that yields several portions, assigned to slots. */
export const PrepBatch = z.object({
  id: z.string(),
  planId: z.string(),
  recipeId: z.string(),
  recipeName: z.string(),
  cookDate: z.string(),
  portions: z.number(),
  status: PrepStatus,
  cookedAt: z.number().nullable(),
  /** Slots holding a portion (skipped or replaced ones excluded). */
  slotIds: z.array(z.string()),
  /** Portions already eaten. */
  eaten: z.number(),
  /** Portions not assigned to any slot: free to use as leftovers. */
  leftover: z.number(),
});
export type PrepBatch = z.infer<typeof PrepBatch>;

export const PlanRevision = z.object({
  id: z.string(),
  planId: z.string(),
  /** The operation: log (a meal tied to its slot), skip, replace, ate_out, place, rebalance, spread, ingredient_unavailable, no_time_to_cook, move, swap_days, fill, schedule_prep, prep_cooked, use_leftover. */
  op: z.string(),
  /** What changed, in Spanish: "Cambié salmón por atún en 2 comidas (mar, jue)." */
  summary: z.string(),
  dates: z.array(z.string()),
  createdAt: z.number(),
  undoneAt: z.number().nullable(),
});
export type PlanRevision = z.infer<typeof PlanRevision>;

/** The plan over a range of dates: what the Dieta UIs draw. */
export const DietHorizon = z.object({
  planId: z.string(),
  planName: z.string(),
  from: z.string(),
  to: z.string(),
  /** The plan's horizon length in days (7 or 14 typical). */
  horizonDays: z.number(),
  days: z.array(DietDay),
  preps: z.array(PrepBatch),
  /** The latest change that can still be undone. */
  lastRevision: PlanRevision.nullable(),
});
export type DietHorizon = z.infer<typeof DietHorizon>;

/** How a deviation was compensated: on the same day, spread over the next days, or not at all. */
export const Compensation = z.object({
  mode: z.enum(["none", "day", "spread"]),
  /** Eaten minus planned, kcal (positive = ate more). */
  deviationKcal: z.number(),
  /** How much of it the change makes up for. */
  absorbedKcal: z.number(),
  /** Left as is: a day never moves more than the bound. */
  unabsorbedKcal: z.number(),
  /** Per-day kcal shifts when spread. */
  days: z.array(z.object({ date: z.string(), shiftKcal: z.number() })),
  summary: z.string(),
});
export type Compensation = z.infer<typeof Compensation>;

/** What every plan change returns. */
export const PlanChange = z.object({
  revision: PlanRevision,
  summary: z.string(),
  /** The slots as they are now, for the dates the change touched. */
  slots: z.array(PlanSlot),
  compensation: Compensation.nullable(),
  /** True when the shopping list was rebuilt to follow the change. */
  shoppingRefreshed: z.boolean(),
});
export type PlanChange = z.infer<typeof PlanChange>;

/** What a plan op answers beyond Pulso's contract (the engine's own types): an ingredient without a substitute only previews the meals using it. */
export const UnavailablePreview = z.object({ preview: z.literal(true), ingredient: z.string(), summary: z.string(), affected: z.array(PlanSlot) });
export type UnavailablePreview = z.infer<typeof UnavailablePreview>;

/** `rebalance` also answers the day's adjustment; `stored` is false when nothing needed to change. */
export const PlanOpResult = z.union([UnavailablePreview, PlanChange.extend({ adjustment: DayAdjustment.extend({ stored: z.boolean() }).optional() })]);
export type PlanOpResult = z.infer<typeof PlanOpResult>;

/** One day of the coming week, ranked by room to cook a batch (from the calendar). */
export const PrepDay = z.object({
  date: z.string(),
  weekday: z.string(),
  /** Free minutes between 16:00 and an hour before bed. */
  freeMinutes: z.number(),
  /** The longest free stretch in that window, "HH:MM–HH:MM", or null. */
  bestWindow: z.string().nullable(),
  busy: z.array(z.string()),
  training: z.array(z.string()),
  /** Planned meals that day needing more than 15 min of cooking. */
  cookingMinutes: z.number(),
  weekend: z.boolean(),
  /** Higher is better: free time, weekends, few cooking meals of its own. */
  score: z.number(),
});
export type PrepDay = z.infer<typeof PrepDay>;

export const PrepDaysView = z.object({
  from: z.string(),
  to: z.string(),
  days: z.array(PrepDay),
  /** Meals in the range that need cooking on a day with little free time: candidates for a batch portion. */
  tightMeals: z.array(PlanSlot),
  batchRecipes: z.array(z.object({ id: z.string(), name: z.string(), servings: z.number(), prepMinutes: z.number() })),
});
export type PrepDaysView = z.infer<typeof PrepDaysView>;

/** Pulso's nutrition operations (its Coach tools), at `/api/v1/salud/nutrition/<operation>`; the engine runs those tools for them (`salud/api/tools.ts`). */
export const nutritionToolOperations = {
  log_meal: op({
    name: "log_meal",
    description: "Log food or drinks the person had (plain water: log_water) as one meal. Foods eaten together are ONE dish: one item per food and the dish's name in `dish`, never several foods in one item's name; items sharing a slot become one dish anyway. A saved dish that matches (list_dishes) → log_dish. Item macros are TOTALS for the amount (not per 100 g): kcal and grams. `at` is the time they said, `description` their words. With an active plan each meal is tied to a plan slot by itself (slotId, else the planned item by planItemId or name, else the item's slot, else the time window): «eaten as planned» or «ate this instead», undoable. Snacks and drinks under ~250 kcal between meals stay extras; the day's first food is breakfast. Returns the entries with slotId (null = extra); fix a wrong one with place_meal.",
    access: "write",
    method: "POST",
    path: "/nutrition/log_meal",
    input: z.object({ items: z.array(z.object({ name: z.string().min(1).max(120).describe("In Spanish, e.g. 'Avena con leche'"), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("snack = anything between meals, at any hour"), measure: z.union([z.string().min(1).max(80), z.object({ amount: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving","taza","vaso","lata","botella","cucharada","cucharadita","unidad","puño"]), size: z.number().max(5000).gt(0).nullable().describe("g or ml in one household unit, when not its default").optional(), base: z.enum(["g","ml"]).describe("Whether `size` is g or ml; default the unit's own. estimate_portion sets it").optional() })]).describe("How much, in the person's words; preferred over quantity + unit: '2 latas', '250 ml', '30 g', 'un puño', '2 galletas' (a count without weight = servings). Defaults: taza 240 ml, vaso 250, lata 355, botella 500, cucharada 15, cucharadita 5, puño 30 g; say the size when it differs ('una botella de 330 ml')").optional(), quantity: z.number().max(10000).gt(0).describe("In `unit`, only without `measure`").optional(), unit: z.enum(["g","ml","serving"]).describe("Default 'g'; ignored with `measure`").optional(), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0), caffeineMg: z.number().min(0).max(2000).nullable().describe("For coffee, tea, mate, cola, energy drinks (espresso ≈ 63 mg)").optional(), alcoholG: z.number().min(0).max(500).nullable().describe("Pure alcohol: ml × ABV × 0.789").optional(), eatenAt: z.number().describe("Epoch ms; default now").optional(), date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day it counts toward; default eatenAt's").optional(), barcode: z.string().max(32).nullable().optional(), planItemId: z.string().describe("Plan item it fulfils (get_active_plan)").optional() })).min(1).max(30).describe("One per food; one meal shares a slot"), at: z.string().max(40).describe("Local 'HH:MM' (24 h) or ISO 8601 date-time; default now").optional(), date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day it counts toward; default `at`'s").optional(), description: z.string().max(300).describe("The person's own words, in Spanish").optional(), offPlan: z.boolean().describe("Legacy, rarely needed: with slotId, counts it as eaten instead of that slot even if it matches the plan").optional(), slotId: z.string().describe("Plan slot (get_diet_horizon), only when the time would pick the wrong meal").optional(), dish: z.string().min(1).max(120).describe("Dish name in Spanish, e.g. 'Batido de proteína con fresas'").optional(), addToDish: z.string().describe("Logged dish id (entry.dish.id) to add these to ('también le puse fresas'); ignores at, slotId, dish").optional() }),
    output: z.unknown(),
  }),
  estimate_portion: op({
    name: "estimate_portion",
    description: "Turn an amount of a packaged product in words ('una cucharada', 'media taza', 'la mitad del paquete', '2 de 6 galletas', 'un scoop', '20 %') into grams and macros. Give `barcode` (looked up in Open Food Facts) or else `product` with its label values. Spoons and cups of solids use a food-specific density (level: cucharada 15 ml, cucharadita 5 ml, taza 240 ml); shares use the package size; counts use unitGrams, unitsPerPackage or a typical weight. Returns `estimate` (g, or ml for drinks; total macros; package share; `assumption`, a Spanish line to tell the person) and `logItem`, to pass as is (plus slot) in log_meal's items. An error is a question to ask the person.",
    access: "read",
    method: "POST",
    path: "/nutrition/estimate_portion",
    input: z.object({ barcode: z.string().describe("8 to 14 digits").optional(), product: z.object({ name: z.string().min(1).max(120), per100g: z.object({ kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) }).describe("Per 100 g (100 ml when liquid)"), liquid: z.boolean().default(false), packageSize: z.number().max(100000).gt(0).nullable().describe("g (ml when liquid)").optional(), servingGrams: z.number().max(5000).gt(0).nullable().optional() }).describe("Label values, without a barcode").optional(), amount: z.string().min(1).max(120).describe("How much, in the person's words"), unitGrams: z.number().max(2000).gt(0).describe("Grams of one counted unit (a cookie, a slice)").optional(), unitsPerPackage: z.int().max(500).gt(0).describe("e.g. '12 galletas'").optional(), density: z.number().max(3).gt(0).describe("g per ml, overriding the table").optional() }),
    output: z.unknown(),
  }),
  delete_meal: op({
    name: "delete_meal",
    description: "Delete a logged food entry by id (list_meals or log_meal).",
    access: "write",
    method: "POST",
    path: "/nutrition/delete_meal",
    input: z.object({ id: z.string() }),
    output: z.unknown(),
  }),
  list_meals: op({
    name: "list_meals",
    description: "Logged food and drink entries for local days from–to (inclusive; default today; max 62 days), oldest first. Per entry: total macros (kcal, g); quantity + unit normalized (g, ml, serving); measure as said (size null = the unit's default) or null; caffeineMg, alcoholG; eatenAt epoch ms; dish ({ id, name, savedDishId }, components together; null alone); slotId (the plan meal it is, null = extra); offPlan (eaten instead of it); note (their words).",
    access: "read",
    method: "GET",
    path: "/nutrition/list_meals",
    input: z.object({ from: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional(), to: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional() }),
    output: z.unknown(),
  }),
  daily_summary: op({
    name: "daily_summary",
    description: "What was eaten on a local day (default today) vs the daily targets, kcal and g: totals, targets, remaining (negative = over), zones (each nutrient vs its min/max/kind: below, inZone, above), inZone (kcal in zone and protein at least its min), per-slot totals, caffeineMg, alcoholG.",
    access: "read",
    method: "GET",
    path: "/nutrition/daily_summary",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional() }),
    output: z.unknown(),
  }),
  get_targets: op({
    name: "get_targets",
    description: "Daily nutrition targets (kcal; g of protein, carbs, fat, fiber), each with its zone (min, max, kind: min = at least, range = between, max = under; custom when set by hand). null if never set.",
    access: "read",
    method: "GET",
    path: "/nutrition/get_targets",
    input: z.object({}),
    output: z.unknown(),
  }),
  set_targets: op({
    name: "set_targets",
    description: "Replace the daily nutrition targets and their zones (the Dieta rings' bands; adherence counts days in zone). Pass zones only to change a derived one (e.g. protein { min: 150 }); custom zones not passed again are dropped.",
    access: "write",
    method: "POST",
    path: "/nutrition/set_targets",
    input: z.object({ kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g; default 14 per 1000 kcal").optional(), zones: z.partialRecord(z.enum(["kcal","protein","carbs","fat","fiber"]), z.object({ min: z.number().min(0).max(20000).nullable().describe("kcal or g; less is 'below'").optional(), max: z.number().min(0).max(20000).nullable().describe("More is 'above'; with kind 'min' it only ends the drawn band").optional(), kind: z.enum(["min","range","max"]).describe("min = at least; range = between; max = under. Default from the bounds").optional() })).describe("Custom 'estás bien aquí' bands, only where the derived ones don't fit. Derived: kcal −10/+5 % losing fat (±5 % maintaining, −5/+10 % gaining), protein and fiber ≥ target, carbs and fat −20/+10 %. Each call replaces all custom zones.").optional() }),
    output: z.unknown(),
  }),
  create_diet_plan: op({
    name: "create_diet_plan",
    description: "Create a NEW diet plan: days → meals by slot → items with quantity and TOTAL macros (kcal, g). Days repeat from startsOn, laid out as dated slots over horizonDays. By default it replaces the active plan and its dated changes. Only when the person asks for a new plan, never for a deviation (skip_slot, ingredient_unavailable, no_time_to_cook… do those). Items should add up near the targets; set_targets if they change.",
    access: "write",
    method: "POST",
    path: "/nutrition/create_diet_plan",
    input: z.object({ name: z.string().min(1).max(120).describe("e.g. 'Definición 2200 kcal'"), notes: z.string().max(4000).nullable().describe("Guidance shown with the plan").optional(), startsOn: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Day the first day applies; default today").optional(), activate: z.boolean().describe("Make it active, deactivating the previous").default(true), horizonDays: z.int().min(3).max(28).describe("Days laid out ahead as dated meals (and the shopping list's default). Default 14").optional(), days: z.array(z.object({ label: z.string().min(1).max(60).describe("e.g. 'Lunes'"), meals: z.array(z.object({ slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]), name: z.string().max(120).nullable().describe("Dish name").optional(), items: z.array(z.object({ name: z.string().min(1).max(120), quantity: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving"]), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })).min(1).max(30).describe("TOTAL macros for each quantity") })).min(1).max(10) })).min(1).max(14).describe("Repeat cyclically from startsOn: 1 = same every day, 7 = weekly") }),
    output: z.unknown(),
  }),
  get_active_plan: op({
    name: "get_active_plan",
    description: "The active diet plan (null if none) and its plan for a local day (default today; from today on with its changes, skipped and replaced meals left out), which items are already eaten, and the day's rebalance_day adjustment if any. Slot ids and status: get_diet_horizon.",
    access: "read",
    method: "GET",
    path: "/nutrition/get_active_plan",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional() }),
    output: z.unknown(),
  }),
  lookup_food_barcode: op({
    name: "lookup_food_barcode",
    description: "Look up a packaged food by EAN/UPC barcode in Open Food Facts: name, brand, macros per 100 g (kcal, g), serving g; null if unknown. Scale per100g by grams/100 before logging.",
    access: "read",
    method: "GET",
    path: "/nutrition/lookup_food_barcode",
    input: z.object({ barcode: z.string().describe("8 to 14 digits") }),
    output: z.unknown(),
  }),
  log_water: op({
    name: "log_water",
    description: "Log plain water. amount in the unit they used: ml, l, vaso or botella (their sizes: get_water). Returns the entry (amountMl), the day's totalMl and goalMl.",
    access: "write",
    method: "POST",
    path: "/nutrition/log_water",
    input: z.object({ amount: z.number().max(10000).gt(0).describe("How much, in `unit`"), unit: z.enum(["ml","l","vaso","botella"]).default("ml"), at: z.string().max(40).describe("Local 'HH:MM' (24 h) or ISO 8601 date-time; default now").optional(), date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default `at`'s").optional() }),
    output: z.unknown(),
  }),
  get_water: op({
    name: "get_water",
    description: "Water on a local day (default today), ml: total, goal (theirs, else 35 ml/kg within 2000–3700, else 2000), entries, and settings (preferred unit, glass and bottle ml).",
    access: "read",
    method: "GET",
    path: "/nutrition/get_water",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional() }),
    output: z.unknown(),
  }),
  set_water_goal: op({
    name: "set_water_goal",
    description: "Set the daily water goal in ml; null = automatic (35 ml/kg, within 2–3.7 L).",
    access: "write",
    method: "POST",
    path: "/nutrition/set_water_goal",
    input: z.object({ goalMl: z.number().min(250).max(10000).nullable() }),
    output: z.unknown(),
  }),
  list_dishes: op({
    name: "list_dishes",
    description: "Saved dishes (Mis platillos), most used first: id, name, usual slot, components (quantity g/ml/serving, measure as said, TOTAL macros), the dish's macros and times logged. Log a match with log_dish.",
    access: "read",
    method: "GET",
    path: "/nutrition/list_dishes",
    input: z.object({}),
    output: z.unknown(),
  }),
  save_dish: op({
    name: "save_dish",
    description: "Save a dish (Mis platillos) to log in one go, once the person agrees or asks: from a logged dish (loggedDishId = the entries' dish.id, as eaten), a plan recipe (recipeId, one portion) or components (one default portion).",
    access: "write",
    method: "POST",
    path: "/nutrition/save_dish",
    input: z.object({ loggedDishId: z.string().optional(), recipeId: z.string().describe("From list_recipes").optional(), name: z.string().min(1).max(120).describe("In Spanish. Required with components; else the source's").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).nullable().describe("Usual meal; null when it varies (then the meal nearest the time)").optional(), components: z.array(z.object({ name: z.string().min(1).max(120).describe("In Spanish, e.g. 'Avena con leche'"), measure: z.union([z.string().min(1).max(80), z.object({ amount: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving","taza","vaso","lata","botella","cucharada","cucharadita","unidad","puño"]), size: z.number().max(5000).gt(0).nullable().describe("g or ml in one household unit, when not its default").optional(), base: z.enum(["g","ml"]).describe("Whether `size` is g or ml; default the unit's own. estimate_portion sets it").optional() })]).describe("Amount in the person's words, as log_meal's measure").optional(), quantity: z.number().max(10000).gt(0).describe("In `unit`, only without `measure`").optional(), unit: z.enum(["g","ml","serving"]).describe("Default 'g'; ignored with `measure`").optional(), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0), caffeineMg: z.number().min(0).max(2000).nullable().describe("For coffee, tea, mate, cola, energy drinks (espresso ≈ 63 mg)").optional(), alcoholG: z.number().min(0).max(500).nullable().describe("Pure alcohol: ml × ABV × 0.789").optional(), barcode: z.string().max(32).nullable().optional() })).min(1).max(30).describe("One per food, with TOTAL macros for its amount (estimate_portion's logItem fits as is)").optional() }),
    output: z.unknown(),
  }),
  log_dish: op({
    name: "log_dish",
    description: "Log a saved dish as one meal: default portion or scaled ('medio' → 0.5), with one-off changes ('con 300 ml de leche hoy' → overrides [{ component: 'leche', measure: '300 ml' }]; 'sin fresas' → remove) and one-off foods (add). The saved dish stays as is (update_dish changes it). Tied to the plan like log_meal.",
    access: "write",
    method: "POST",
    path: "/nutrition/log_dish",
    input: z.object({ id: z.string().describe("Saved dish id (list_dishes)").optional(), name: z.string().min(1).max(120).describe("Or its name").optional(), scale: z.number().max(10).gt(0).describe("Default 1").optional(), overrides: z.array(z.object({ component: z.union([z.int().min(0), z.string().min(1)]).describe("0-based index (list_dishes order) or part of its name"), measure: z.string().min(1).max(80).describe("New amount in words, same kind of unit").optional(), remove: z.boolean().optional() })).max(30).optional(), add: z.array(z.object({ name: z.string().min(1).max(120).describe("In Spanish, e.g. 'Avena con leche'"), measure: z.union([z.string().min(1).max(80), z.object({ amount: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving","taza","vaso","lata","botella","cucharada","cucharadita","unidad","puño"]), size: z.number().max(5000).gt(0).nullable().describe("g or ml in one household unit, when not its default").optional(), base: z.enum(["g","ml"]).describe("Whether `size` is g or ml; default the unit's own. estimate_portion sets it").optional() })]).describe("Amount in the person's words, as log_meal's measure").optional(), quantity: z.number().max(10000).gt(0).describe("In `unit`, only without `measure`").optional(), unit: z.enum(["g","ml","serving"]).describe("Default 'g'; ignored with `measure`").optional(), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0), caffeineMg: z.number().min(0).max(2000).nullable().describe("For coffee, tea, mate, cola, energy drinks (espresso ≈ 63 mg)").optional(), alcoholG: z.number().min(0).max(500).nullable().describe("Pure alcohol: ml × ABV × 0.789").optional(), barcode: z.string().max(32).nullable().optional() })).min(1).max(30).describe("Foods added this time").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Default the dish's usual, else nearest the time").optional(), at: z.string().max(40).describe("Local 'HH:MM' (24 h) or ISO 8601 date-time; default now").optional(), date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day it counts toward; default `at`'s").optional(), slotId: z.string().describe("Plan slot (get_diet_horizon), only when the time would pick the wrong meal").optional(), description: z.string().max(300).describe("Their words, in Spanish").optional() }),
    output: z.unknown(),
  }),
  update_dish: op({
    name: "update_dish",
    description: "Change a saved dish for good: rename, usual slot, or components (the whole new list). Logged dishes keep what they were.",
    access: "write",
    method: "POST",
    path: "/nutrition/update_dish",
    input: z.object({ id: z.string().describe("Saved dish id (list_dishes)").optional(), name: z.string().min(1).max(120).describe("Or its name").optional(), newName: z.string().min(1).max(120).optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).nullable().describe("null when it varies").optional(), components: z.array(z.object({ name: z.string().min(1).max(120).describe("In Spanish, e.g. 'Avena con leche'"), measure: z.union([z.string().min(1).max(80), z.object({ amount: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving","taza","vaso","lata","botella","cucharada","cucharadita","unidad","puño"]), size: z.number().max(5000).gt(0).nullable().describe("g or ml in one household unit, when not its default").optional(), base: z.enum(["g","ml"]).describe("Whether `size` is g or ml; default the unit's own. estimate_portion sets it").optional() })]).describe("Amount in the person's words, as log_meal's measure").optional(), quantity: z.number().max(10000).gt(0).describe("In `unit`, only without `measure`").optional(), unit: z.enum(["g","ml","serving"]).describe("Default 'g'; ignored with `measure`").optional(), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0), caffeineMg: z.number().min(0).max(2000).nullable().describe("For coffee, tea, mate, cola, energy drinks (espresso ≈ 63 mg)").optional(), alcoholG: z.number().min(0).max(500).nullable().describe("Pure alcohol: ml × ABV × 0.789").optional(), barcode: z.string().max(32).nullable().optional() })).min(1).max(30).describe("One per food, with TOTAL macros for its amount (estimate_portion's logItem fits as is)").optional() }),
    output: z.unknown(),
  }),
  delete_dish: op({
    name: "delete_dish",
    description: "Delete a saved dish (Mis platillos). Logged dishes keep their entries.",
    access: "write",
    method: "POST",
    path: "/nutrition/delete_dish",
    input: z.object({ id: z.string().describe("Saved dish id (list_dishes)").optional(), name: z.string().min(1).max(120).describe("Or its name").optional() }),
    output: z.unknown(),
  }),
  get_diet_horizon: op({
    name: "get_diet_horizon",
    description: "The active plan as dated slots from `from` (default today) for `days` (default 7): per day goalKcal, shiftKcal (kcal spread onto it), planned and real (logged) totals, extraIds (entries that are no meal), the rebalance summary, and one line per slot: «<slot id> · meal · «dish» · items as to eat now (\"(ajustado)\" if rebalanced) or receta/tanda <id> × portions or comer fuera · kcal · protein · planned|eaten|replaced|skipped» plus what happened: «(sin registrar)» = pending past its time (ask, don't assume a skip), «en su lugar», «real: … [entry ids]», cooking minutes, note. Then prep batches (id, recipe, cook date, portions assigned/eaten/free, status) and lastRevision (what undo_plan_change would undo). null without an active plan.",
    access: "read",
    method: "GET",
    path: "/nutrition/get_diet_horizon",
    input: z.object({ from: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional(), days: z.int().min(1).max(31).optional() }),
    output: z.unknown(),
  }),
  skip_slot: op({
    name: "skip_slot",
    description: "They skipped a planned meal and ate nothing ('no desayuné'): marks the slot skipped (a meal shown missed, only once they confirm). compensate by magnitude: none for ≲10 % of the day. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/skip_slot",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Required unless slotId").optional(), slotId: z.string().describe("From get_diet_horizon; needed only when a day has two snacks").optional(), compensate: z.enum(["none","day","spread"]).describe("none (minor slip), day (rebalance the rest of that day), spread (over the next days)").default("none"), spreadDays: z.int().min(1).max(7).describe("For spread").default(3), maxChangePct: z.number().min(1).max(15).describe("Most any day may move, % of its kcal goal").default(15), note: z.string().max(200).optional() }),
    output: z.unknown(),
  }),
  replace_slot: op({
    name: "replace_slot",
    description: "They ate something else instead of a planned meal that can't be logged as food: marks the slot replaced with `what`. If it can be logged, log_meal ties it by itself; use this only to compensate or to move logged entryIds here. compensate as in skip_slot. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/replace_slot",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Required unless slotId").optional(), slotId: z.string().describe("From get_diet_horizon; needed only when a day has two snacks").optional(), entryIds: z.array(z.string()).max(20).describe("Logged entries eaten instead").optional(), what: z.string().max(200).describe("What they ate, in their words, when not logged").optional(), compensate: z.enum(["none","day","spread"]).describe("none (minor slip), day (rebalance the rest of that day), spread (over the next days)").default("none"), spreadDays: z.int().min(1).max(7).describe("For spread").default(3), maxChangePct: z.number().min(1).max(15).describe("Most any day may move, % of its kcal goal").default(15) }),
    output: z.unknown(),
  }),
  ate_out: op({
    name: "ate_out",
    description: "They ate out instead of a planned meal ('salí a cenar'): logs it as that meal's real meal. Refused when the meal already has entries (log_meal those). compensate as in skip_slot. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/ate_out",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Required unless slotId").optional(), slotId: z.string().describe("From get_diet_horizon; needed only when a day has two snacks").optional(), name: z.string().max(120).describe("What and where, in their words").optional(), kcal: z.number().min(0).max(5000).describe("Estimate; omit for the planned meal × 1.3").optional(), protein: z.number().min(0).max(500).describe("g").optional(), carbs: z.number().min(0).max(800).describe("g").optional(), fat: z.number().min(0).max(400).describe("g").optional(), fiber: z.number().min(0).max(150).describe("g").optional(), eatenAt: z.int().describe("Epoch ms; default now (midday on another day)").optional(), note: z.string().max(200).optional(), compensate: z.enum(["none","day","spread"]).describe("none (minor slip), day (rebalance the rest of that day), spread (over the next days)").default("none"), spreadDays: z.int().min(1).max(7).describe("For spread").default(3), maxChangePct: z.number().min(1).max(15).describe("Most any day may move, % of its kcal goal").default(15) }),
    output: z.unknown(),
  }),
  place_meal: op({
    name: "place_meal",
    description: "Fix which meal logged entries were: 'eso fue mi desayuno' → slot or slotId; 'eso fue un snack' → extra (never tied to a meal again). The meal they leave goes back to pending if empty. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/place_meal",
    input: z.object({ entryIds: z.array(z.string()).min(1).max(20).describe("One day's entries"), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("The meal they were").optional(), slotId: z.string().describe("From get_diet_horizon").optional(), extra: z.boolean().describe("A snack or extra, no planned meal").optional() }),
    output: z.unknown(),
  }),
  rebalance_day: op({
    name: "rebalance_day",
    description: "Rescale what is LEFT of a day's plan so the day lands near its goal (targets plus kcal spread onto it), in sensible portions, moving at most maxChangePct of the goal; what doesn't fit stays a deviation. `swaps` replace remaining meals (e.g. a lighter dinner after a heavy lunch). Each call replaces the day's adjustment; earlier swaps still ahead are kept unless replaced or resetSwaps. Shown in Dieta as 'Ajustado por el Coach'. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/rebalance_day",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), swaps: z.array(z.object({ slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]), name: z.string().max(120).nullable().optional(), items: z.array(z.object({ name: z.string().min(1).max(120), quantity: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving"]), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })).min(1).max(15) })).max(6).describe("Replacement meals for remaining slots; TOTAL macros per item").optional(), slots: z.array(z.enum(["desayuno","media_manana","comida","merienda","cena","snack"])).max(6).describe("Override which slots are still ahead").optional(), note: z.string().max(200).describe("Why, one short Spanish sentence").optional(), resetSwaps: z.boolean().optional(), maxChangePct: z.number().min(1).max(15).describe("Most any day may move, % of its kcal goal").default(15) }),
    output: z.unknown(),
  }),
  adjust_day_plan: op({
    name: "adjust_day_plan",
    description: "Legacy name of rebalance_day, kept for old conversations: same input and effect, returning the day's adjustment itself plus the revision. Prefer rebalance_day.",
    access: "write",
    method: "POST",
    path: "/nutrition/adjust_day_plan",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), swaps: z.array(z.object({ slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]), name: z.string().max(120).nullable().optional(), items: z.array(z.object({ name: z.string().min(1).max(120), quantity: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving"]), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })).min(1).max(15) })).max(6).describe("Replacement meals for remaining slots; TOTAL macros per item").optional(), slots: z.array(z.enum(["desayuno","media_manana","comida","merienda","cena","snack"])).max(6).describe("Override which slots are still ahead").optional(), note: z.string().max(200).describe("Why, one short Spanish sentence").optional(), resetSwaps: z.boolean().optional(), maxChangePct: z.number().min(1).max(15).describe("Most any day may move, % of its kcal goal").default(15) }),
    output: z.unknown(),
  }),
  spread_deviation: op({
    name: "spread_deviation",
    description: "Spread a big deviation (a dinner out, a party) evenly over `days` after `date`, rescaling their remaining meals: lighter days when they ate more, slightly bigger when less. No day moves over maxChangePct; what doesn't fit is left. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/spread_deviation",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Day of the deviation (default today); spreading starts the next day").optional(), kcal: z.number().min(-5000).max(5000).describe("Eaten minus planned: positive = ate MORE"), days: z.int().min(1).max(7).describe("For spread").default(3), maxChangePct: z.number().min(1).max(15).describe("Most any day may move, % of its kcal goal").default(15) }),
    output: z.unknown(),
  }),
  ingredient_unavailable: op({
    name: "ingredient_unavailable",
    description: "An ingredient can't be had (not at the store, ran out). Without `substitute` it previews the planned meals using it. With it, swaps it only in those meals still planned (and uncooked batches, as a recipe variant). Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/ingredient_unavailable",
    input: z.object({ ingredient: z.string().min(1).max(120).describe("In Spanish, e.g. 'salmón'"), substitute: z.object({ name: z.string().min(1).max(120).describe("In Spanish, e.g. 'Atún al natural'"), ratio: z.number().max(5).gt(0).describe("Per unit of the original (1 = same grams)").default(1), per100: z.object({ kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) }).describe("Per 100 g or ml (per serving when the original is in servings)") }).describe("Omit to preview the affected meals").optional(), from: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Default today").optional(), to: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Default the horizon's end").optional() }),
    output: z.unknown(),
  }),
  no_time_to_cook: op({
    name: "no_time_to_cook",
    description: "No time to cook a meal ('hoy no cocino'); see strategy. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/no_time_to_cook",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Default: every meal that day needing over 15 min").optional(), strategy: z.enum(["auto","leftover","move","quick"]).describe("leftover: a free batch portion cooked by then; move: swap with the same meal on a later no-cook day; quick: `quick`; auto: leftover, else move").default("auto"), toDate: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("For move; default the next no-cook day").optional(), quick: z.discriminatedUnion("kind", [z.object({ kind: z.literal("items"), name: z.string().max(120).nullable().describe("Dish name").optional(), items: z.array(z.object({ name: z.string().min(1).max(120), quantity: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving"]), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })).min(1).max(30).describe("TOTAL macros for each quantity") }), z.object({ kind: z.literal("recipe"), recipeId: z.string(), portions: z.number().max(10).gt(0).default(1) }), z.object({ kind: z.literal("prep"), prepId: z.string(), portions: z.number().max(10).gt(0).default(1) }), z.object({ kind: z.literal("eat_out"), name: z.string().max(120).nullable().describe("e.g. 'Cena con amigos'").optional(), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })]).describe("For quick: what to eat instead").optional() }),
    output: z.unknown(),
  }),
  move_slot: op({
    name: "move_slot",
    description: "Move a planned meal to another day and/or slot; if the target holds a planned meal, the two swap. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/move_slot",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Required unless slotId").optional(), slotId: z.string().describe("From get_diet_horizon; needed only when a day has two snacks").optional(), toDate: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")), toSlot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Default the same slot; a meal there swaps with it").optional() }),
    output: z.unknown(),
  }),
  swap_days: op({
    name: "swap_days",
    description: "Swap the remaining planned meals of two days (e.g. the training-day menu onto the day they now train). Eaten or skipped meals stay. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/swap_days",
    input: z.object({ a: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")), b: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")) }),
    output: z.unknown(),
  }),
  fill_slot: op({
    name: "fill_slot",
    description: "Plan what a slot should be (to record what was eaten: log_meal): items, portions of a recipe cooked that day, a prep batch portion, or an eat_out budget. Adds the slot if the day has none for that meal. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/fill_slot",
    input: z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).describe("Local day; default today").optional(), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]).describe("Required unless slotId").optional(), slotId: z.string().describe("From get_diet_horizon; needed only when a day has two snacks").optional(), fill: z.discriminatedUnion("kind", [z.object({ kind: z.literal("items"), name: z.string().max(120).nullable().describe("Dish name").optional(), items: z.array(z.object({ name: z.string().min(1).max(120), quantity: z.number().max(10000).gt(0), unit: z.enum(["g","ml","serving"]), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })).min(1).max(30).describe("TOTAL macros for each quantity") }), z.object({ kind: z.literal("recipe"), recipeId: z.string(), portions: z.number().max(10).gt(0).default(1) }), z.object({ kind: z.literal("prep"), prepId: z.string(), portions: z.number().max(10).gt(0).default(1) }), z.object({ kind: z.literal("eat_out"), name: z.string().max(120).nullable().describe("e.g. 'Cena con amigos'").optional(), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })]), note: z.string().max(200).optional() }),
    output: z.unknown(),
  }),
  create_recipe: op({
    name: "create_recipe",
    description: "Save a recipe (ingredients for the whole pot). Returns it with perServing macros. Use with fill_slot (cooked that day) or schedule_prep (a batch for several days).",
    access: "write",
    method: "POST",
    path: "/nutrition/create_recipe",
    input: z.object({ name: z.string().min(1).max(120).describe("In Spanish, e.g. 'Pasta boloñesa'"), servings: z.number().max(30).gt(0).describe("Portions it makes"), prepMinutes: z.int().min(0).max(600).describe("Active cooking minutes"), batch: z.boolean().describe("Keeps well for days (stews, lentils): good for meal prep").default(false), ingredients: z.array(z.object({ name: z.string().min(1).max(120).describe("In Spanish, as bought: 'Tomate triturado'"), quantity: z.number().max(10000).gt(0).describe("For the WHOLE recipe"), unit: z.enum(["g","ml","serving","taza","vaso","lata","botella","cucharada","cucharadita","unidad","puño"]), kcal: z.number().min(0).max(20000), protein: z.number().min(0).max(2000).describe("g"), carbs: z.number().min(0).max(2000).describe("g"), fat: z.number().min(0).max(2000).describe("g"), fiber: z.number().min(0).max(2000).describe("g").default(0) })).min(1).max(40).describe("TOTAL macros for each amount"), steps: z.string().max(4000).nullable().describe("Short method, in Spanish").optional() }),
    output: z.unknown(),
  }),
  list_recipes: op({
    name: "list_recipes",
    description: "Saved recipes, newest first: ingredients, servings, prepMinutes, batch, perServing macros; variantOf on versions made by swapping an ingredient.",
    access: "read",
    method: "GET",
    path: "/nutrition/list_recipes",
    input: z.object({}),
    output: z.unknown(),
  }),
  suggest_prep_days: op({
    name: "suggest_prep_days",
    description: "Where a cooking batch fits in the coming days, best first: per day free minutes from 16:00 to an hour before bed, best window, busy blocks, training, cooking its meals need; tight-day meals a batch could cover; batch-friendly recipes. To propose prep days; schedule_prep once they agree.",
    access: "read",
    method: "GET",
    path: "/nutrition/suggest_prep_days",
    input: z.object({ from: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional(), days: z.int().min(3).max(14).default(7) }),
    output: z.unknown(),
  }),
  schedule_prep: op({
    name: "schedule_prep",
    description: "Plan a batch: cook recipeId on cookDate, a portion to each slot in `assign` (replacing what they had); the rest stay free as leftovers. The shopping list asks for the whole batch once. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/schedule_prep",
    input: z.object({ recipeId: z.string(), cookDate: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")), portions: z.int().min(1).max(20).describe("Portions it yields"), assign: z.array(z.object({ date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]) })).max(20).describe("Slots eating a portion each, on or after cookDate").default([]) }),
    output: z.unknown(),
  }),
  mark_prep_cooked: op({
    name: "mark_prep_cooked",
    description: "The person cooked a batch (cooked true) or not yet (false). Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/mark_prep_cooked",
    input: z.object({ prepId: z.string(), cooked: z.boolean().default(true) }),
    output: z.unknown(),
  }),
  use_leftover: op({
    name: "use_leftover",
    description: "Put one free portion of a batch (leftover > 0 in get_diet_horizon) into a slot, replacing what it had. Touches only the slots named. Returns summary (a Spanish line to tell the person), revisionId (for undo_plan_change), the touched slots as get_diet_horizon lines, compensation if asked, and whether the shopping list was rebuilt.",
    access: "write",
    method: "POST",
    path: "/nutrition/use_leftover",
    input: z.object({ prepId: z.string(), date: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")), slot: z.enum(["desayuno","media_manana","comida","merienda","cena","snack"]) }),
    output: z.unknown(),
  }),
  list_plan_changes: op({
    name: "list_plan_changes",
    description: "Recent changes to the active plan, newest first: id, op, Spanish summary, dates, and undoneAt when undone.",
    access: "read",
    method: "GET",
    path: "/nutrition/list_plan_changes",
    input: z.object({ limit: z.int().min(1).max(50).default(10) }),
    output: z.unknown(),
  }),
  undo_plan_change: op({
    name: "undo_plan_change",
    description: "Undo a plan change: the latest by default, or `id` from list_plan_changes (refused while a later change touches the same days: undo that first). Restores the slots, adjustments and batches and rebuilds the shopping list.",
    access: "write",
    method: "POST",
    path: "/nutrition/undo_plan_change",
    input: z.object({ id: z.string().optional() }),
    output: z.unknown(),
  }),
};

// ── What the iPhone's Dieta calls (Pulso's /api/mobile/nutrition/*) ──
// Inputs as the engine's nutrition/inputs.ts, dish-api.ts and plan-inputs.ts parse them (phone.test.ts keeps them equal).

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const grams = z.number().min(0).max(2000);
const macroInputShape = {
  kcal: z.number().min(0).max(20000),
  protein: grams.describe("g"),
  carbs: grams.describe("g"),
  fat: grams.describe("g"),
  fiber: grams.default(0).describe("g"),
};
const measureInput = z.object({
  amount: z.number().positive().max(10000),
  unit: z.enum(MEASURE_UNITS),
  size: z.number().positive().max(5000).nullish().describe("g or ml in one household unit, when not its default"),
  base: z.enum(["g", "ml"]).optional().describe("Whether `size` is g or ml; default the unit's own. estimate_portion sets it"),
});
export const mealInputShape = {
  name: z.string().trim().min(1).max(120).describe("In Spanish, e.g. 'Avena con leche'"),
  slot: MealSlot.describe("snack = anything between meals, at any hour"),
  measure: z
    .union([z.string().trim().min(1).max(80), measureInput])
    .optional()
    .describe(
      "How much, in the person's words; preferred over quantity + unit: '2 latas', '250 ml', '30 g', 'un puño', '2 galletas' (a count without weight = servings). Defaults: taza 240 ml, vaso 250, lata 355, botella 500, cucharada 15, cucharadita 5, puño 30 g; say the size when it differs ('una botella de 330 ml')",
    ),
  quantity: z.number().positive().max(10000).optional().describe("In `unit`, only without `measure`"),
  unit: QuantityUnit.optional().describe("Default 'g'; ignored with `measure`"),
  ...macroInputShape,
  caffeineMg: z.number().min(0).max(2000).nullish().describe("For coffee, tea, mate, cola, energy drinks (espresso ≈ 63 mg)"),
  alcoholG: z.number().min(0).max(500).nullish().describe("Pure alcohol: ml × ABV × 0.789"),
  eatenAt: z.number().optional().describe("Epoch ms; default now"),
  date: dateString.optional().describe("Local day it counts toward; default eatenAt's"),
  barcode: z.string().max(32).nullish(),
};
export const componentInput = z
  .object(mealInputShape)
  .omit({ slot: true, eatenAt: true, date: true })
  .extend({ measure: mealInputShape.measure.describe("Amount in the person's words, as log_meal's measure") });
const componentsInput = z.array(componentInput).min(1).max(30);
const dishName = z.string().trim().min(1).max(120);
/** When a dish was eaten: `eatenAt` (epoch ms, the phone) or `time` ("14:30" on `date`, the engine's clock — the web). */
export const dishWhenShape = {
  eatenAt: z.number().optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  date: dateString.optional(),
  slot: MealSlot.optional(),
  slotId: z.string().nullish(),
};
export const waterSettingsInput = z.object({
  goalMl: z.number().min(250).max(10000).nullable().optional(),
  unit: WaterUnit.optional(),
  glassMl: z.number().min(50).max(1000).optional(),
  bottleMl: z.number().min(100).max(3000).optional(),
});
export const targetsInputShape = {
  kcal: z.number().min(0).max(20000),
  protein: grams.describe("g"),
  carbs: grams.describe("g"),
  fat: grams.describe("g"),
  fiber: grams.optional().describe("g; default 14 per 1000 kcal"),
  zones: z
    .partialRecord(
      z.enum(MACRO_NAMES),
      z
        .object({
          min: z.number().min(0).max(20000).nullish().describe("kcal or g; less is 'below'"),
          max: z.number().min(0).max(20000).nullish().describe("More is 'above'; with kind 'min' it only ends the drawn band"),
          kind: z.enum(["min", "range", "max"]).optional().describe("min = at least; range = between; max = under. Default from the bounds"),
        })
        .refine((zone) => zone.min == null || zone.max == null || zone.min <= zone.max, "min must not exceed max"),
    )
    .optional()
    .describe(
      "Custom 'estás bien aquí' bands, only where the derived ones don't fit. Derived: kcal −10/+5 % losing fat (±5 % maintaining, −5/+10 % gaining), protein and fiber ≥ target, carbs and fat −20/+10 %. Each call replaces all custom zones.",
    ),
};
export const recipeInputShape = {
  name: z.string().trim().min(1).max(120).describe("In Spanish, e.g. 'Pasta boloñesa'"),
  servings: z.number().positive().max(30).describe("Portions it makes"),
  prepMinutes: z.number().int().min(0).max(600).describe("Active cooking minutes"),
  batch: z.boolean().default(false).describe("Keeps well for days (stews, lentils): good for meal prep"),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120).describe("In Spanish, as bought: 'Tomate triturado'"),
        quantity: z.number().positive().max(10000).describe("For the WHOLE recipe"),
        unit: z.enum(MEASURE_UNITS),
        ...macroInputShape,
      }),
    )
    .min(1)
    .max(40)
    .describe("TOTAL macros for each amount"),
  steps: z.string().trim().max(4000).nullish().describe("Short method, in Spanish"),
};
/** The dated plan's ops (the engine's plan-inputs.ts `opShapes`), each the Coach tool named in run_plan_op. */
export const PLAN_OPS = ["skip", "replace", "ate_out", "place", "rebalance", "spread", "ingredient_unavailable", "no_time_to_cook", "move", "swap_days", "fill", "schedule_prep", "prep_cooked", "use_leftover"] as const;

const Meals = z.object({ meals: z.array(MealEntry) });

/** What the phone and web Dieta call beyond the Coach's tools (full objects; Pulso's paths and answers). */
export const nutritionPhoneOperations = {
  get_nutrition_day: op({
    name: "get_nutrition_day",
    description:
      "Everything the Dieta screen draws for a local day (default today), in one call: the summary (totals vs targets and zones, per slot, caffeine and alcohol), every entry logged, the plan for the day (null without an active plan), the water day and the saved dishes, most used first. For a model, daily_summary and list_meals are shorter.",
    access: "read",
    method: "GET",
    path: "/nutrition/day",
    input: z.object({ date: dateString.optional() }),
    output: NutritionDay,
  }),
  get_nutrition_history: op({
    name: "get_nutrition_history",
    description: "Daily summaries (totals vs targets and zones, kcal and g) for the `days` days (default 7, max 90) ending `to` (default today), empty days included, plus water ml per day (days without water are absent).",
    access: "read",
    method: "GET",
    path: "/nutrition/history",
    input: z.object({ days: z.int().min(1).max(90).default(7), to: dateString.optional() }),
    output: z.object({ days: z.array(DailySummary), water: z.record(z.string(), z.number()) }),
  }),
  list_frequent_foods: op({
    name: "list_frequent_foods",
    description: "Quick add: the saved dishes (most used first) and the 12 foods logged most in the last 60 days, each with its latest portion and TOTAL macros for it. kind 'snack' keeps the foods last logged as a snack or in ml (drinks).",
    access: "read",
    method: "GET",
    path: "/nutrition/frequent",
    input: z.object({ kind: z.enum(["snack"]).optional() }),
    output: z.object({ dishes: z.array(SavedDish), foods: z.array(FrequentFood) }),
  }),
  update_meal: op({
    name: "update_meal",
    description:
      "Correct one logged entry (list_meals) with the whole corrected food, as log_meal's item: name, amount, TOTAL macros (kcal, g), slot, time (eatenAt, or `time` on `date`). Where it came from (source, plan item, barcode, note) stays, and so does the plan meal it is tied to while it stays the same meal on the same day; a dish's component keeps its dish, time and meal. Returns { meal } with its NEW id.",
    access: "write",
    method: "PUT",
    path: "/nutrition/meals/{id}",
    input: z.object({
      id: z.string().describe("Entry id (list_meals)"),
      ...mealInputShape,
      time: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("Local 'HH:MM' on `date` (default the entry's day), instead of eatenAt"),
    }),
    output: z.object({ meal: MealEntry }),
    event: "nutrition.update_meal",
  }),
  copy_meals: op({
    name: "copy_meals",
    description: "Copy every entry logged on `from` (default the day before `to`) onto `to`, keeping times of day and dishes ('hoy comí lo mismo que ayer'). Returns { meals }, the new entries (empty when `from` had none).",
    access: "write",
    method: "POST",
    path: "/nutrition/meals/copy",
    input: z.object({ from: dateString.optional().describe("Local day to copy; default the day before `to`"), to: dateString.describe("Local day to copy onto") }),
    output: Meals,
    event: "nutrition.copy_meals",
  }),
  eat_planned_meal: op({
    name: "eat_planned_meal",
    description:
      "«Me lo comí»: give `slotId` (a dated slot, get_diet_horizon) to log what it holds now (the rebalanced portions when there are), tied to it; returns { meals }, 404 when the slot is not pending. Older clients give `itemId` (a plan item, get_active_plan) and `date` (default today) instead and get { meal }.",
    access: "write",
    method: "POST",
    path: "/nutrition/plan/eat",
    input: z
      .object({ slotId: z.string().min(1).optional().describe("Dated slot id"), itemId: z.string().optional().describe("Plan item id, without slotId"), date: dateString.optional().describe("With itemId: local day, default today") })
      .refine((input) => input.slotId !== undefined || input.itemId !== undefined, "Give slotId (or itemId)."),
    output: z.union([Meals, z.object({ meal: MealEntry })]),
    event: "nutrition.eat_planned_meal",
  }),
  delete_water: op({
    name: "delete_water",
    description: "Delete one water entry by id (get_water's entries): undo a glass logged by mistake. Returns { deleted } with its id; 404 when there is none.",
    access: "write",
    method: "DELETE",
    path: "/nutrition/water/{id}",
    input: z.object({ id: z.string().describe("Water entry id (get_water)") }),
    output: z.object({ deleted: z.string() }),
    event: "nutrition.delete_water",
  }),
  set_water_settings: op({
    name: "set_water_settings",
    description: "Change some water settings: daily goal in ml (null = automatic, 35 ml/kg within 2–3.7 L), the unit they count in (ml, vaso, botella), glass and bottle sizes in ml. Fields left out stay. Returns { settings }.",
    access: "write",
    method: "PUT",
    path: "/nutrition/water/settings",
    input: waterSettingsInput,
    output: z.object({ settings: WaterSettings }),
    event: "nutrition.set_water_settings",
  }),
  clear_day_adjustment: op({
    name: "clear_day_adjustment",
    description: "«Volver al plan»: drop the rebalance (rebalance_day) of a local day (default today), so the day's meals are the plan's again. Returns { cleared }, false when there was none.",
    access: "write",
    method: "DELETE",
    path: "/nutrition/plan/adjustment",
    input: z.object({ date: dateString.optional() }),
    output: z.object({ cleared: z.boolean() }),
    event: "nutrition.clear_day_adjustment",
  }),
  log_new_dish: op({
    name: "log_new_dish",
    description:
      "«Crear platillo»: log several foods eaten together as one dish (name default from its foods), each component with its amount and TOTAL macros (kcal, g); when: eatenAt (epoch ms) or time ('HH:MM' on date), slot, slotId as log_meal ties it to the plan. Returns { meals }, its entries.",
    access: "write",
    method: "POST",
    path: "/nutrition/meals/dish",
    input: z.object({ name: dishName.optional(), components: componentsInput, ...dishWhenShape }),
    output: Meals,
    event: "nutrition.log_new_dish",
  }),
  edit_logged_dish: op({
    name: "edit_logged_dish",
    description: "A dish already eaten (an entry's dish.id): rename it and/or add foods to it ('también le puse fresas'). Returns { meals }, all its entries.",
    access: "write",
    method: "PATCH",
    path: "/nutrition/meals/dish/{id}",
    input: z.object({ id: z.string().describe("Logged dish id (entry.dish.id)"), name: dishName.optional(), add: componentsInput.optional() }),
    output: Meals,
    event: "nutrition.edit_logged_dish",
  }),
  run_plan_op: op({
    name: "run_plan_op",
    description:
      "One change to the dated plan, `op` plus that op's fields: skip (skip_slot), replace (replace_slot), ate_out, place (place_meal), rebalance (rebalance_day), spread (spread_deviation), ingredient_unavailable, no_time_to_cook, move (move_slot), swap_days, fill (fill_slot), schedule_prep, prep_cooked (mark_prep_cooked), use_leftover — each takes the Coach tool's input. Returns the PlanChange (rebalance adds the day's adjustment; ingredient_unavailable without a substitute only previews). 409 without an active plan or when it does not fit the plan.",
    access: "write",
    method: "POST",
    path: "/nutrition/plan/ops",
    input: z.object({ op: z.enum(PLAN_OPS) }).loose(),
    output: PlanOpResult,
    event: "nutrition.run_plan_op",
  }),
  get_nutrition_targets: op({
    name: "get_nutrition_targets",
    description: "The daily targets as the phone reads them: { targets } with kcal and g of protein, carbs, fat, fiber, each nutrient's zone and updatedAt; null if never set.",
    access: "read",
    method: "GET",
    path: "/nutrition/targets",
    input: z.object({}),
    output: z.object({ targets: NutritionTargets.nullable() }),
  }),
  replace_nutrition_targets: op({
    name: "replace_nutrition_targets",
    description: "Replace the daily targets and their custom zones, as set_targets does (custom zones not passed again are dropped). Returns { targets }.",
    access: "write",
    method: "PUT",
    path: "/nutrition/targets",
    input: z.object(targetsInputShape),
    output: z.object({ targets: NutritionTargets }),
    event: "nutrition.replace_nutrition_targets",
  }),
  get_barcode_product: op({
    name: "get_barcode_product",
    description: "A packaged food by EAN/UPC barcode (8 to 14 digits) from Open Food Facts, cached: { product } with name, brand, macros per 100 g (100 ml when liquid), serving and package sizes; { product: null } when unknown, 502 lookup_failed when Open Food Facts can't be reached.",
    access: "read",
    method: "GET",
    path: "/nutrition/barcode/{code}",
    input: z.object({ code: z.string().describe("8 to 14 digits") }),
    output: z.object({ product: FoodProduct.nullable() }),
  }),
  estimate_barcode_portion: op({
    name: "estimate_barcode_portion",
    description: "«Cuánto comiste» of a packaged food: the barcode and an amount in words ('una cucharada', 'la mitad', '3 galletas') → { estimate } in g (ml for drinks) with TOTAL macros, the package share and a Spanish line saying what was assumed. 400 unreadable, 404 unknown product, 502 when Open Food Facts can't be reached.",
    access: "read",
    method: "POST",
    path: "/nutrition/portion",
    input: z.object({ barcode: z.string().describe("8 to 14 digits"), amount: z.string().describe("How much, in the person's words") }),
    output: z.object({ estimate: PortionEstimate }),
  }),
  add_meal_entry: op({
    name: "add_meal_entry",
    description: "Log one food or drink from the phone's quick add, snack sheet or barcode scan, as one log_meal item (amount, TOTAL macros in kcal and g, slot, eatenAt) plus its source (manual or barcode). Tied to the plan like log_meal. Returns { meal }.",
    access: "write",
    method: "POST",
    path: "/nutrition/meals",
    input: z.object({ ...mealInputShape, source: z.enum(["manual", "barcode"]).default("manual") }),
    output: z.object({ meal: MealEntry }),
    event: "nutrition.add_meal_entry",
  }),
  delete_meal_entry: op({
    name: "delete_meal_entry",
    description: "Delete one logged entry by id (list_meals), as delete_meal does; a dish left empty goes too. Returns { deleted } with its id; 404 when there is none.",
    access: "write",
    method: "DELETE",
    path: "/nutrition/meals/{id}",
    input: z.object({ id: z.string() }),
    output: z.object({ deleted: z.string() }),
    event: "nutrition.delete_meal_entry",
  }),
  list_saved_dishes: op({
    name: "list_saved_dishes",
    description: "Saved dishes (Mis platillos), most used first, in full: { dishes } with components (amount as said, TOTAL macros), the dish's macros, usual slot, uses and dates.",
    access: "read",
    method: "GET",
    path: "/nutrition/dishes",
    input: z.object({}),
    output: z.object({ dishes: z.array(SavedDish) }),
  }),
  create_saved_dish: op({
    name: "create_saved_dish",
    description: "Save a dish (Mis platillos) from ONE of: loggedDishId (a dish eaten, «Guardar como platillo»), recipeId (a plan recipe, one portion) or name + components (by hand). name and slot (null = it varies) are optional with the first two. Returns { dish }.",
    access: "write",
    method: "POST",
    path: "/nutrition/dishes",
    input: z.object({
      loggedDishId: z.string().min(1).optional().describe("An entry's dish.id"),
      recipeId: z.string().min(1).optional().describe("From list_recipes"),
      name: dishName.optional().describe("Required with components"),
      slot: MealSlot.nullish(),
      components: componentsInput.optional(),
    }),
    output: z.object({ dish: SavedDish }),
    event: "nutrition.create_saved_dish",
  }),
  edit_saved_dish: op({
    name: "edit_saved_dish",
    description: "Change a saved dish for good: name, usual slot (null = it varies), or its components (the whole new list). Dishes already logged keep what they were. Returns { dish }.",
    access: "write",
    method: "PUT",
    path: "/nutrition/dishes/{id}",
    input: z.object({ id: z.string(), name: dishName.optional(), slot: MealSlot.nullish(), components: componentsInput.optional() }),
    output: z.object({ dish: SavedDish }),
    event: "nutrition.edit_saved_dish",
  }),
  delete_saved_dish: op({
    name: "delete_saved_dish",
    description: "Delete a saved dish (Mis platillos); its logged entries stay. Returns { deleted } with its id; 404 when there is none.",
    access: "write",
    method: "DELETE",
    path: "/nutrition/dishes/{id}",
    input: z.object({ id: z.string() }),
    output: z.object({ deleted: z.string() }),
    event: "nutrition.delete_saved_dish",
  }),
  log_saved_dish: op({
    name: "log_saved_dish",
    description:
      "Log a saved dish by id: scaled (0.5 = medio), with one-off overrides (a component by index or name with a new amount in words, or removed) and added foods; when: eatenAt (epoch ms) or time ('HH:MM' on date), slot, slotId. The saved dish stays as is. Returns { meals }; 400 when an amount doesn't fit its component.",
    access: "write",
    method: "POST",
    path: "/nutrition/dishes/{id}/log",
    input: z.object({
      id: z.string(),
      scale: z.number().positive().max(10).optional(),
      overrides: z
        .array(z.object({ component: z.union([z.number().int().min(0), z.string().min(1)]), measure: z.string().trim().min(1).max(80).optional(), remove: z.boolean().optional() }))
        .max(30)
        .optional(),
      add: componentsInput.optional(),
      ...dishWhenShape,
    }),
    output: Meals,
    event: "nutrition.log_saved_dish",
  }),
  get_water_day: op({
    name: "get_water_day",
    description: "Water on a local day (default today) in full: total and goal in ml, where the goal comes from (custom, weight, default), every entry (oldest first) and the settings (unit, glass and bottle ml).",
    access: "read",
    method: "GET",
    path: "/nutrition/water",
    input: z.object({ date: dateString.optional() }),
    output: WaterDay,
  }),
  add_water_entry: op({
    name: "add_water_entry",
    description: "A tap on a glass or bottle: amountMl (ml), loggedAt (epoch ms, default now), date (default loggedAt's). Returns { entry, day } with the updated water day.",
    access: "write",
    method: "POST",
    path: "/nutrition/water",
    input: z.object({ amountMl: z.number().positive().max(5000), loggedAt: z.number().positive().optional(), date: dateString.optional() }),
    output: z.object({ entry: WaterEntry, day: WaterDay }),
    event: "nutrition.add_water_entry",
  }),
  get_plan_day: op({
    name: "get_plan_day",
    description: "The active diet plan in full and the plan day that applies on a local day (default today): which items are already eaten and the day's rebalance. { plan: null } without an active plan.",
    access: "read",
    method: "GET",
    path: "/nutrition/plan",
    input: z.object({ date: dateString.optional() }),
    output: z.object({ plan: PlanForDay.nullable() }),
  }),
  list_plan_revisions: op({
    name: "list_plan_revisions",
    description: "The active plan's changes, newest first (limit default 20, max 100): op, Spanish summary, dates, createdAt and undoneAt. 409 without an active plan.",
    access: "read",
    method: "GET",
    path: "/nutrition/plan/revisions",
    input: z.object({ limit: z.int().min(1).max(100).default(20) }),
    output: z.object({ revisions: z.array(PlanRevision) }),
  }),
  undo_plan_revision: op({
    name: "undo_plan_revision",
    description: "Undo a plan change: the latest, or `id` from list_plan_revisions (refused while a later change touches the same days). Returns the PlanChange; 409 when there is nothing to undo.",
    access: "write",
    method: "POST",
    path: "/nutrition/plan/revisions/undo",
    input: z.object({ id: z.string().optional() }),
    output: PlanChange,
    event: "nutrition.undo_plan_revision",
  }),
  get_plan_horizon: op({
    name: "get_plan_horizon",
    description: "The dated plan in full from `from` (default today) for `days` (1–31, default the plan's horizon): per day its slots with status and what was really eaten, planned/asPlanned/real totals, extras, goal and shift, the rebalance; the prep batches and the last undoable change. { horizon: null } without an active plan. For a model, get_diet_horizon is shorter.",
    access: "read",
    method: "GET",
    path: "/nutrition/horizon",
    input: z.object({ from: dateString.optional(), days: z.int().min(1).max(31).optional() }),
    output: z.object({ horizon: DietHorizon.nullable() }),
  }),
  get_prep_days: op({
    name: "get_prep_days",
    description: "Days from `from` (default today) for `days` (3–14, default 7) ranked by room to cook a batch, from the calendar: free minutes after 16:00, best window, busy blocks, training, cooking already planned; tight-day meals a batch could cover and batch-friendly recipes. 409 without an active plan.",
    access: "read",
    method: "GET",
    path: "/nutrition/prep-days",
    input: z.object({ from: dateString.optional(), days: z.int().min(3).max(14).default(7) }),
    output: PrepDaysView,
  }),
  list_prep_batches: op({
    name: "list_prep_batches",
    description: "Every prep batch of the active plan: { preps } with recipe, cook date, portions, slots holding one, eaten, leftover and status. Changes go through run_plan_op. 409 without an active plan.",
    access: "read",
    method: "GET",
    path: "/nutrition/preps",
    input: z.object({}),
    output: z.object({ preps: z.array(PrepBatch) }),
  }),
  list_diet_recipes: op({
    name: "list_diet_recipes",
    description: "Saved recipes in full, newest first: { recipes } with ingredients for the whole pot (TOTAL macros each), servings, prepMinutes, batch, perServing macros and variantOf.",
    access: "read",
    method: "GET",
    path: "/nutrition/recipes",
    input: z.object({}),
    output: z.object({ recipes: z.array(Recipe) }),
  }),
  add_recipe: op({
    name: "add_recipe",
    description: "Save a recipe, as create_recipe: name, servings it makes, active prepMinutes, batch (keeps for days), ingredients for the WHOLE recipe with TOTAL macros each, steps. Returns { recipe } with perServing macros.",
    access: "write",
    method: "POST",
    path: "/nutrition/recipes",
    input: z.object(recipeInputShape),
    output: z.object({ recipe: Recipe }),
    event: "nutrition.add_recipe",
  }),
  get_recipe: op({
    name: "get_recipe",
    description: "One saved recipe by id: { recipe } with its ingredients, servings, prep time, perServing macros and steps; 404 when there is none.",
    access: "read",
    method: "GET",
    path: "/nutrition/recipes/{id}",
    input: z.object({ id: z.string() }),
    output: z.object({ recipe: Recipe }),
  }),
};

export const nutritionOperations = { ...nutritionToolOperations, ...nutritionPhoneOperations };
