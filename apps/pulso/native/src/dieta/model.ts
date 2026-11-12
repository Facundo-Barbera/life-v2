import { HOUSEHOLD_SIZES, type DietHorizon, type FoodProduct, type Macros, type MealEntry, type NutrientZone, type PlanSlot, type WaterSettings } from "@/contract";
import type { SFSymbol } from "expo-symbols";

// Dieta's pure rules, ported from the SwiftUI app (Features/Nutrition): dates,
// numbers as the person reads them, slots, zones, water, barcode portions and
// how logged entries group. No React here: `bun test` covers it.

export type MealSlot = MealEntry["slot"];
export type MeasureUnit = NonNullable<MealEntry["measure"]>["unit"];
export type Measure = NonNullable<MealEntry["measure"]>;

// ── Dates (local YYYY-MM-DD) ─────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
export const addDays = (key: string, days: number) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «miércoles 21 de octubre». */
export const longDate = (key: string) => {
  const d = parseDay(key);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
};
/** The day switcher: «Hoy, 21 de octubre», «Ayer, 20 de octubre», «Lunes, 19 de octubre». */
export function dayTitle(key: string, today = dayKey()) {
  const d = parseDay(key);
  const date = `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  if (key === today) return `Hoy, ${date}`;
  if (key === addDays(today, -1)) return `Ayer, ${date}`;
  return `${cap(WEEKDAYS[d.getDay()]!)}, ${date}`;
}
/** Tablero's mono header: «MIÉ 21». */
export const shortDay = (key: string) => {
  const d = parseDay(key);
  return `${WEEKDAYS[d.getDay()]!.slice(0, 3)} ${d.getDate()}`.toUpperCase();
};
export const weekdayShort = (key: string) => WEEKDAYS[parseDay(key).getDay()]!.slice(0, 3);
export const hm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** When something logged for `date` happened: now for today, that day at this wall-clock time otherwise. */
export function eatenAtFor(date: string, now = new Date()) {
  if (date === dayKey(now)) return now.getTime();
  const d = parseDay(date);
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return d.getTime();
}
/** «hace 5 min», «hace 2 h», «hace 3 d». */
export function ago(ms: number, now = Date.now()) {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

// ── Numbers ──────────────────────────────────────────────────────────────

/** «1 480»: thousands with a thin space, as the mock. */
export const int = (n: number) => {
  const r = Math.round(n);
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return r < 0 ? `−${s}` : s;
};
/** Up to `digits` decimals with a comma, trailing zeros dropped: 82.30 → «82,3». */
export const decimal = (n: number, digits = 1) => {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return String(r).replace(".", ",");
};

// ── Slots ────────────────────────────────────────────────────────────────

export const SLOTS: MealSlot[] = ["desayuno", "media_manana", "comida", "merienda", "cena", "snack"];
export const SLOT_TITLES: Record<MealSlot, string> = {
  desayuno: "Desayuno",
  media_manana: "Media mañana",
  comida: "Comida",
  merienda: "Merienda",
  cena: "Cena",
  snack: "Snack",
};
export const SLOT_ICONS: Record<MealSlot, SFSymbol> = {
  desayuno: "sunrise",
  media_manana: "cup.and.saucer",
  comida: "sun.max",
  merienda: "carrot",
  cena: "moon.stars",
  snack: "takeoutbag.and.cup.and.straw",
};
export function slotForHour(h: number): MealSlot {
  if (h < 11) return "desayuno";
  if (h < 13) return "media_manana";
  if (h < 16) return "comida";
  if (h < 20) return "merienda";
  return "cena";
}
export function slotForDrink(h: number): MealSlot {
  if (h >= 6 && h <= 9) return "desayuno";
  if (h >= 13 && h <= 15) return "comida";
  if (h >= 20 && h <= 22) return "cena";
  return "snack";
}

// ── Units and amounts ────────────────────────────────────────────────────

export const UNIT_LABEL: Record<MeasureUnit, [string, string]> = {
  g: ["g", "g"],
  ml: ["ml", "ml"],
  serving: ["porción", "porciones"],
  taza: ["taza", "tazas"],
  vaso: ["vaso", "vasos"],
  lata: ["lata", "latas"],
  botella: ["botella", "botellas"],
  cucharada: ["cucharada", "cucharadas"],
  cucharadita: ["cucharadita", "cucharaditas"],
  unidad: ["unidad", "unidades"],
  puño: ["puño", "puños"],
};
export const unitLabel = (unit: MeasureUnit, amount: number) => UNIT_LABEL[unit][amount === 1 ? 0 : 1];
export const isHousehold = (unit: MeasureUnit) => unit in HOUSEHOLD_SIZES;
export const measureText = (m: Measure) => (m.amount === 0.5 && isHousehold(m.unit) ? `½ ${UNIT_LABEL[m.unit][0]}` : `${decimal(m.amount)} ${unitLabel(m.unit, m.amount)}`);
/** «2 latas (710 ml)», «150 g», «1 porción». */
export function amountText(e: { quantity: number; unit: "g" | "ml" | "serving"; measure: Measure | null }) {
  const base = `${decimal(e.quantity)} ${unitLabel(e.unit, e.quantity)}`;
  if (!e.measure || e.measure.unit === e.unit) return base;
  return e.unit === "serving" ? measureText(e.measure) : `${measureText(e.measure)} (${base})`;
}

/** Macros scaled: kcal rounded, the rest to one decimal (the SwiftUI app's `scaled`). */
export const scaleMacros = (m: Macros, f: number): Macros => ({
  kcal: Math.round(m.kcal * f),
  protein: Math.round(m.protein * f * 10) / 10,
  carbs: Math.round(m.carbs * f * 10) / 10,
  fat: Math.round(m.fat * f * 10) / 10,
  fiber: Math.round(m.fiber * f * 10) / 10,
});
export const estimateKcal = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

// ── Zones (MacroHero) ────────────────────────────────────────────────────

export type ZoneGeometry = { fill: number; bandFrom: number; bandTo: number; target: number; over: number };
/** Where the zone sits on a bar of full width 1: the value, the green band, the target tick, and what's over `max`. */
export function zoneGeometry(z: NutrientZone): ZoneGeometry {
  const top = z.kind === "min" || z.max == null ? Math.max(z.target * 1.25, z.max ?? 0) : z.max;
  const full = Math.max(top * 1.15, z.value * 1.04, 1);
  const bandFrom = (z.min ?? 0) / full;
  const bandTo = z.kind === "min" ? 1 : (z.max ?? full) / full;
  const over = z.kind !== "min" && z.max != null && z.value > z.max ? (z.value - z.max) / full : 0;
  return { fill: Math.min(z.value / full, 1), bandFrom, bandTo, target: z.target / full, over };
}
/** The lap of a ring: one lap is the top of the zone (else the target). */
export const ringProgress = (value: number, z: NutrientZone | undefined, target: number | undefined) => {
  const top = z ? (z.kind === "min" || z.max == null ? z.target : z.max) : target;
  return top ? value / top : 0;
};
export function zoneStatus(z: NutrientZone, unit: string) {
  const u = unit ? ` ${unit}` : "";
  if (z.status === "below") return `Faltan ${int((z.min ?? z.target) - z.value)}${u}`;
  if (z.status === "above") return `Te pasaste ${int(z.value - (z.max ?? z.target))}${u}`;
  return z.kind === "min" ? "Mínimo cumplido" : "En tu zona";
}
export const zoneRange = (z: { kind: string; min?: number | null; max?: number | null }, unit: string) => {
  if (z.kind === "min") return `mín. ${int(z.min ?? 0)} ${unit}`;
  if (z.kind === "max" || z.min == null) return `máx. ${int(z.max ?? 0)} ${unit}`;
  return `${int(z.min)}–${int(z.max ?? 0)} ${unit}`;
};

// ── Water ────────────────────────────────────────────────────────────────

/** «250 ml», «1,5 L». */
export const litres = (ml: number) => (ml < 1000 ? `${Math.round(ml)} ml` : `${decimal(ml / 1000, 2)} L`);
const halves = (n: number) => Math.round(n * 2) / 2;
export const waterPer = (s: WaterSettings, unit: WaterSettings["unit"]) => (unit === "vaso" ? s.glassMl : unit === "botella" ? s.bottleMl : 1);
/** An amount in the person's unit: «1 vaso», «1,5 botellas», «750 ml». */
export function waterFormat(s: WaterSettings, ml: number, unit = s.unit) {
  if (unit === "ml") return litres(ml);
  const n = halves(ml / waterPer(s, unit));
  return `${decimal(n)} ${unit === "vaso" ? (n === 1 ? "vaso" : "vasos") : n === 1 ? "botella" : "botellas"}`;
}
/** «750 ml de 2,75 L», «3 de 8 vasos». */
export function waterProgress(s: WaterSettings, total: number, goal: number) {
  if (s.unit === "ml") return `${litres(total)} de ${litres(goal)}`;
  return `${decimal(halves(total / waterPer(s, s.unit)))} de ${waterFormat(s, goal)}`;
}
/** The quick add follows the unit: a bottle when bottles are counted, a glass otherwise. */
export const quickWaterMl = (s: WaterSettings) => (s.unit === "botella" ? s.bottleMl : s.glassMl);
export const quickWaterLabel = (s: WaterSettings) => (s.unit === "botella" ? "1 botella" : s.unit === "vaso" ? "1 vaso" : litres(s.glassMl));

// ── Plan slots ───────────────────────────────────────────────────────────

export type SlotMark = "unanswered" | "planned" | "skipped" | "asPlanned" | "changed";
export function slotMark(slot: PlanSlot): SlotMark {
  if (slot.status === "planned") return slot.missed ? "unanswered" : "planned";
  if (slot.status === "skipped") return "skipped";
  if (slot.status === "eaten") return slot.real?.asPlanned === false ? "changed" : "asPlanned";
  return slot.real?.asPlanned ? "asPlanned" : "changed";
}
export const MARK_TITLES: Record<SlotMark, string> = {
  unanswered: "Sin registrar",
  planned: "Pendiente",
  skipped: "Saltado",
  asPlanned: "Como estaba planeado",
  changed: "Otra cosa",
};

export type SlotAction = "eaten" | "replaced" | "ateOut" | "skipped" | "noCook";
export const SLOT_ACTIONS: Record<SlotAction, { title: string; icon: SFSymbol }> = {
  eaten: { title: "Me lo comí", icon: "checkmark.circle" },
  replaced: { title: "Registrar lo que comí", icon: "square.and.pencil" },
  ateOut: { title: "Comí fuera", icon: "storefront" },
  skipped: { title: "Me lo salté", icon: "minus.circle" },
  noCook: { title: "Hoy no cocino", icon: "frying.pan" },
};
export function needsCooking(slot: PlanSlot) {
  if (slot.kind === "recipe") return (slot.cookMinutes ?? 0) > 15;
  if (slot.kind === "items") return (slot.slot === "comida" || slot.slot === "cena") && slot.cookMinutes !== 0;
  return false;
}
export function slotActions(slot: PlanSlot): SlotAction[] {
  if (slot.status !== "planned") return [];
  const all: SlotAction[] = ["eaten", "replaced", "ateOut", "skipped"];
  return needsCooking(slot) ? [...all, "noCook"] : all;
}
export const slotItems = (slot: PlanSlot) => slot.adjusted ?? slot.items;
export const slotWhat = (slot: PlanSlot) => slot.name ?? slotItems(slot).map((i) => i.name).join(", ");
export const slotKcal = (slot: PlanSlot) => slot.real?.macros.kcal ?? slot.macros.kcal;

export const horizonDay = (h: DietHorizon, date: string) => h.days.find((d) => d.date === date);
export const prepsCooking = (h: DietHorizon, date: string) => h.preps.filter((p) => p.cookDate === date && p.status !== "discarded");
export const recipeOf = (h: DietHorizon | null | undefined, slot: PlanSlot) => slot.recipeId ?? (slot.prepId ? h?.preps.find((p) => p.id === slot.prepId)?.recipeId : undefined) ?? null;
/** «Porción del prep · 2 de 4», «Receta rápida · 10 min», «Receta · 40 min», «Comer fuera». */
export function slotSource(h: DietHorizon | null | undefined, slot: PlanSlot): { text: string; icon: SFSymbol } | null {
  if (slot.kind === "prep" && slot.prepId) {
    const prep = h?.preps.find((p) => p.id === slot.prepId);
    if (!prep) return { text: "Porción del prep", icon: "frying.pan" };
    const i = prep.slotIds.indexOf(slot.id) + 1;
    return { text: `Porción del prep · ${i} de ${prep.portions}`, icon: "frying.pan" };
  }
  if (slot.kind === "recipe") {
    const min = slot.cookMinutes ?? 0;
    return { text: min <= 15 ? `Receta rápida · ${min} min` : `Receta · ${min} min`, icon: "book" };
  }
  if (slot.kind === "eat_out") return { text: "Comer fuera", icon: "storefront" };
  return null;
}

// ── Logged entries ───────────────────────────────────────────────────────

export type Logged = { kind: "food"; meal: MealEntry } | { kind: "dish"; id: string; name: string; savedDishId: string | null; meals: MealEntry[] };
/** Entries of one dish fold into one row at the first component's place. */
export function groupLogged(meals: MealEntry[]): Logged[] {
  const out: Logged[] = [];
  const dishes = new Map<string, Extract<Logged, { kind: "dish" }>>();
  for (const meal of [...meals].sort((a, b) => a.eatenAt - b.eatenAt)) {
    if (!meal.dish) {
      out.push({ kind: "food", meal });
      continue;
    }
    const known = dishes.get(meal.dish.id);
    if (known) known.meals.push(meal);
    else {
      const row = { kind: "dish" as const, id: meal.dish.id, name: meal.dish.name, savedDishId: meal.dish.savedDishId, meals: [meal] };
      dishes.set(meal.dish.id, row);
      out.push(row);
    }
  }
  return out;
}
export const sumMacros = (meals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }[]): Macros =>
  meals.reduce((t, m) => ({ kcal: t.kcal + m.kcal, protein: t.protein + m.protein, carbs: t.carbs + m.carbs, fat: t.fat + m.fat, fiber: t.fiber + m.fiber }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

export type Moment = { id: string; slot: MealSlot; title: string; at: number; meals: MealEntry[]; note: string | null };
/** The day without a plan: one moment per slot; snacks more than 45 min apart are separate moments. */
export function moments(meals: MealEntry[]): Moment[] {
  const sorted = [...meals].sort((a, b) => a.eatenAt - b.eatenAt);
  const out: Moment[] = [];
  for (const meal of sorted) {
    const last = out.findLast((m) => m.slot === meal.slot);
    const apart = meal.slot === "snack" && last && meal.eatenAt - last.meals.at(-1)!.eatenAt > 45 * 60_000;
    if (last && !apart) last.meals.push(meal);
    else out.push({ id: `${meal.slot}-${meal.id}`, slot: meal.slot, title: SLOT_TITLES[meal.slot], at: meal.eatenAt, meals: [meal], note: null });
  }
  for (const m of out) {
    m.note = m.meals.find((x) => x.note)?.note ?? null;
    if (m.slot === "snack" && m.meals.every((x) => x.unit === "ml")) m.title = "Bebida";
  }
  return out.sort((a, b) => a.at - b.at);
}

// ── Barcode portions ─────────────────────────────────────────────────────

export type Portion = { label: string; amount: number; measure: Measure | null };
/** The preset chips for a scanned product, deduped by amount. */
export function productPortions(p: FoodProduct): Portion[] {
  const list: Portion[] = [];
  if (p.liquid) {
    if (p.packageSize) {
      const kind = p.packageKind;
      const label = kind === "lata" ? "Lata" : kind === "botella" ? "Botella" : "Envase";
      const size = kind && HOUSEHOLD_SIZES[kind].size === p.packageSize ? null : p.packageSize;
      list.push({ label: `${label} (${int(p.packageSize)} ml)`, amount: p.packageSize, measure: kind ? { amount: 1, unit: kind, size } : null });
    }
    if (p.servingGrams) list.push({ label: `Porción (${int(p.servingGrams)} ml)`, amount: p.servingGrams, measure: null });
    list.push({ label: "Vaso (250 ml)", amount: 250, measure: { amount: 1, unit: "vaso", size: null } });
    if (p.packageSize && p.packageSize >= 330) {
      const kind = p.packageKind;
      list.push({ label: `Media (${int(p.packageSize / 2)} ml)`, amount: p.packageSize / 2, measure: kind ? { amount: 0.5, unit: kind, size: HOUSEHOLD_SIZES[kind].size === p.packageSize ? null : p.packageSize } : null });
    }
  } else {
    if (p.servingGrams) {
      list.push({ label: `Porción (${decimal(p.servingGrams)} g)`, amount: p.servingGrams, measure: null });
      list.push({ label: "½ porción", amount: Math.round((p.servingGrams / 2) * 10) / 10, measure: null });
    }
    if (p.packageSize) list.push({ label: `Paquete (${int(p.packageSize)} g)`, amount: p.packageSize, measure: null });
    if (!list.length) list.push({ label: "100 g", amount: 100, measure: null }, { label: "30 g", amount: 30, measure: null });
  }
  const seen = new Set<number>();
  return list.filter((x) => (seen.has(x.amount) ? false : (seen.add(x.amount), true)));
}
export function defaultPortion(p: FoodProduct): Portion {
  const all = productPortions(p);
  if (p.liquid && p.packageSize && p.packageSize <= 1000) return all.find((x) => x.amount === p.packageSize) ?? all[0]!;
  if (p.servingGrams) return all.find((x) => x.amount === p.servingGrams) ?? all[0]!;
  return all.find((x) => x.amount === (p.liquid ? 250 : 100)) ?? all[0]!;
}
/** 8–14 digits once everything else is stripped, else null. */
export const cleanBarcode = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
};

// ── Snack or drink (SnackAddView) ────────────────────────────────────────

export const SNACK_UNITS: MeasureUnit[] = ["taza", "vaso", "lata", "botella", "cucharada", "cucharadita", "unidad", "puño", "ml", "g", "serving"];
export const unitStep = (u: MeasureUnit) => (u === "g" ? 10 : u === "ml" ? 50 : 0.5);
export const unitDefaultAmount = (u: MeasureUnit) => (u === "g" ? 30 : u === "ml" ? 250 : 1);
export const SIZE_PRESETS: Partial<Record<MeasureUnit, number[]>> = { taza: [200, 240, 300], vaso: [200, 250, 330], lata: [250, 330, 355, 500], botella: [330, 500, 750, 1000] };
export const SNACK_PLACEHOLDER: Record<MeasureUnit, string> = {
  taza: "Café con leche",
  vaso: "Zumo de naranja",
  lata: "Coca-Cola",
  botella: "Cerveza",
  cucharada: "Crema de cacahuete",
  cucharadita: "Azúcar",
  unidad: "Galleta Oreo",
  puño: "Almendras",
  g: "Almendras",
  ml: "Leche",
  serving: "Barrita de proteína",
};
export const householdBase = (u: MeasureUnit): "g" | "ml" | "serving" => (u === "g" || u === "unidad" || u === "puño" ? "g" : u === "serving" ? "serving" : "ml");

export type SnackPer = { kcal: number | null; protein: number; carbs: number; fat: number; fiber: number; caffeine: number; abv: number };
/** What a snack sends: per-unit macros scaled by the amount, caffeine, alcohol grams (ml drinks with an ABV). */
export function snackTotals(unit: MeasureUnit, amount: number, size: number | null, per: SnackPer) {
  const factor = unit === "g" || unit === "ml" ? amount / 100 : amount;
  const household = isHousehold(unit);
  const s = household ? (size ?? HOUSEHOLD_SIZES[unit as keyof typeof HOUSEHOLD_SIZES].size) : null;
  const quantity = !household ? { quantity: amount, unit: unit as "g" | "ml" | "serving" } : s ? { quantity: Math.round(amount * s * 10) / 10, unit: householdBase(unit) } : { quantity: amount, unit: "serving" as const };
  const ml = quantity.unit === "ml" ? quantity.quantity : 0;
  const alcoholG = per.abv > 0 && ml > 0 ? Math.round(ml * (per.abv / 100) * 0.789 * 10) / 10 : 0;
  const kcalPer = per.kcal ?? estimateKcal(per.protein, per.carbs, per.fat);
  const macros = scaleMacros({ kcal: kcalPer, protein: per.protein, carbs: per.carbs, fat: per.fat, fiber: per.fiber }, factor);
  if (per.kcal == null) macros.kcal += Math.round(alcoholG * 7);
  const measure: Measure | null = household ? { amount, unit, size: size != null && size !== HOUSEHOLD_SIZES[unit as keyof typeof HOUSEHOLD_SIZES].size ? size : null } : null;
  return { ...quantity, macros, measure, caffeineMg: Math.round(per.caffeine * factor), alcoholG };
}
