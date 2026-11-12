// Compras: one shopping list per person. Building it from the active plan
// adds up what the planned meals use over a date range (by ingredient + unit,
// rounded up to buyable amounts); items added by hand stay across rebuilds.
import type { LifeClient } from "../index";
import type { FoodItem, Recipe, ShoppingItem, ShoppingList } from "../types";
import { must, pulso, PulsoError, userId } from "./core";
import { addDays } from "./dates";
import { slotItems } from "./nutrition-plan";

export const SHOPPING_CATEGORIES = ["frutas_verduras", "carnes_pescados", "lacteos_huevos", "panaderia_cereales", "despensa", "bebidas", "congelados", "otros"] as const;
export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];
export const SHOPPING_CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  frutas_verduras: "Frutas y verduras",
  carnes_pescados: "Carnes y pescados",
  lacteos_huevos: "Lácteos y huevos",
  panaderia_cereales: "Panadería y cereales",
  despensa: "Despensa",
  bebidas: "Bebidas",
  congelados: "Congelados",
  otros: "Otros",
};
export const SHOPPING_MAX_DAYS = 14;

/** Lowercase, no accents. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ces")) return word.slice(0, -3) + "z";
  if (word.length > 4 && /[lrnd]es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const PREPARATION = /\b(a la plancha|a la parrilla|al horno|al vapor|en crudo|cocid[oa]s?|crud[oa]s?|hervid[oa]s?|asad[oa]s?|saltead[oa]s?|picad[oa]s?|rallad[oa]s?)\b/g;

/** The ingredient's identity: "Pechugas de pollo a la plancha" and "pechuga de pollo" are one thing to buy. */
export function nameKey(name: string): string {
  return fold(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(PREPARATION, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

const word = (...stems: string[]) => new RegExp(`\\b(?:${stems.join("|")})(?:s|es)?\\b`);
// First match wins: "queso batido" is dairy, "jugo de naranja" a drink, "tomate frito" pantry.
const AISLES: [ShoppingCategory, RegExp][] = [
  ["congelados", word("congelad[oa]", "helado")],
  ["despensa", word("crema de cacahuate", "mantequilla de cacahuate", "crema de cacahuete", "tomate frito", "leche de coco")],
  ["lacteos_huevos", word("leche", "yogur", "yogurt", "queso", "kefir", "nata", "crema", "mantequilla", "requeson", "jocoque", "skyr", "huevo", "clara", "lacteo")],
  ["bebidas", word("bebida", "zumo", "jugo", "refresco", "agua", "cafe", "te", "infusion", "cerveza", "vino", "batido", "isotonica", "electrolito")],
  [
    "carnes_pescados",
    word("pollo", "pavo", "res", "ternera", "cerdo", "lomo", "jamon", "carne", "pechuga", "muslo", "bistec", "arrachera", "molida", "hamburguesa", "salchicha", "chorizo",
      "tocino", "pescado", "salmon", "atun", "tilapia", "bacalao", "sardina", "camaron", "gamba", "langostino", "marisco", "pulpo", "calamar", "trucha", "fiambre"),
  ],
  [
    "panaderia_cereales",
    word("pan", "tostada", "bolillo", "telera", "baguette", "arroz", "avena", "cereal", "granola", "pasta", "espagueti", "fideo", "quinoa", "cuscus", "harina",
      "tortilla", "wrap", "galleta", "croissant", "maiz", "elote", "totopo"),
  ],
  [
    "frutas_verduras",
    word("fruta", "verdura", "manzana", "platano", "banana", "naranja", "mandarina", "pera", "uva", "fresa", "frutos rojos", "arandano", "frambuesa", "zarzamora", "kiwi",
      "mango", "pina", "melon", "sandia", "papaya", "guayaba", "durazno", "cereza", "limon", "lima", "aguacate", "tomate", "jitomate", "tomatillo", "lechuga", "espinaca", "arugula",
      "brocoli", "coliflor", "calabacita", "calabacin", "berenjena", "pimiento", "chile", "cebolla", "ajo", "zanahoria", "papa", "patata", "camote", "pepino", "champinon",
      "seta", "ejote", "esparrago", "apio", "nopal", "calabaza", "col", "repollo", "kale", "ensalada", "perejil", "cilantro", "albahaca", "jengibre", "betabel", "rabano", "chicharo"),
  ],
  [
    "despensa",
    word("aceite", "vinagre", "sal", "pimienta", "especia", "azucar", "miel", "lenteja", "garbanzo", "frijol", "alubia", "legumbre", "frutos secos", "nuez", "almendra",
      "cacahuate", "cacahuete", "pistacho", "avellana", "semilla", "chia", "linaza", "proteina", "whey", "creatina", "chocolate", "cacao", "conserva", "lata", "salsa",
      "mostaza", "mayonesa", "catsup", "ketchup", "caldo", "consome", "levadura", "hummus", "aceituna", "datil", "pasa", "mermelada", "edulcorante", "soya", "soja", "tofu"),
  ],
];

/** The aisle for an ingredient, from Spanish keywords in its name. */
export function classify(name: string): ShoppingCategory {
  const folded = fold(name);
  return AISLES.find(([, re]) => re.test(folded))?.[0] ?? "otros";
}

const UNITS: Record<string, [string, number]> = {
  g: ["g", 1], gr: ["g", 1], gramo: ["g", 1], kg: ["g", 1000], kilo: ["g", 1000],
  ml: ["ml", 1], cl: ["ml", 10], l: ["ml", 1000], litro: ["ml", 1000],
  serving: ["ud", 1], ud: ["ud", 1], u: ["ud", 1], unidad: ["ud", 1], pieza: ["ud", 1], pza: ["ud", 1], racion: ["ud", 1], porcion: ["ud", 1],
};
const LIQUID = word("leche", "bebida", "jugo", "zumo", "caldo", "kefir", "agua", "aceite");
const EGG = /^huevo\b/;

/** Unit and amount the list counts it in: g, ml, ud or the plan's own. */
export function baseUnit(key: string, quantity: number, unit: string): { unit: string; quantity: number } {
  const folded = singular(fold(unit));
  const [base, factor] = UNITS[folded] ?? [folded || "ud", 1];
  const amount = quantity * factor;
  if (base === "g" && EGG.test(key)) return { unit: "ud", quantity: amount / 60 };
  if (base === "g" && LIQUID.test(key)) return { unit: "ml", quantity: amount };
  return { unit: base, quantity: amount };
}

const ceilTo = (value: number, step: number) => Math.ceil(value / step - 1e-6) * step;
const number = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-MX", { maximumFractionDigits: 1 });
const plural = (unit: string) => (/[aeiou]$/.test(unit) ? unit + "s" : unit + "es");

/** Rounds up to what you'd buy: "1.4 kg", "650 g", "2 L", "12" (eggs by the half dozen), "3 latas". */
export function buyable(quantity: number, unit: string, key = ""): string {
  switch (unit) {
    case "g":
      return quantity >= 1000 ? `${number(ceilTo(quantity / 1000, 0.1))} kg` : `${ceilTo(quantity, quantity > 100 ? 50 : 10)} g`;
    case "ml":
      return quantity >= 500 ? `${number(ceilTo(quantity / 1000, 0.5))} L` : `${ceilTo(quantity, quantity > 100 ? 50 : 10)} ml`;
    case "ud":
      return number(EGG.test(key) && quantity > 6 ? ceilTo(quantity, 6) : ceilTo(quantity, 1));
    default: {
      const n = ceilTo(quantity, 1);
      return `${number(n)} ${n === 1 ? unit : plural(unit)}`;
    }
  }
}

export type Needed = { key: string; name: string; quantity: number; unit: string; amount: string; category: ShoppingCategory };
export type Line = Pick<FoodItem, "name" | "quantity" | "unit"> & { category?: string };

/** Adds up lines by ingredient + unit, rounded up to buyable amounts. */
export function aggregateLines(lines: Line[]): Needed[] {
  const byKey = new Map<string, Omit<Needed, "amount" | "category"> & { category?: string }>();
  for (const line of lines) {
    const ingredient = nameKey(line.name ?? "");
    if (!ingredient || !(line.quantity > 0)) continue;
    const base = baseUnit(ingredient, line.quantity, String(line.unit ?? ""));
    const key = `${ingredient}|${base.unit}`;
    const name = line.name.trim();
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { key, name, quantity: base.quantity, unit: base.unit, category: line.category });
    else {
      seen.quantity += base.quantity;
      if (name.length < seen.name.length) seen.name = name;
    }
  }
  return [...byKey.values()].map((n) => ({
    key: n.key,
    name: n.name,
    unit: n.unit,
    quantity: Math.round(n.quantity * 10) / 10,
    amount: buyable(n.quantity, n.unit, n.key),
    category: (SHOPPING_CATEGORIES as readonly string[]).includes(n.category ?? "") ? (n.category as ShoppingCategory) : classify(n.name),
  }));
}

export type ShoppingView = {
  list: ShoppingList | null;
  items: ShoppingItem[];
  byCategory: { category: ShoppingCategory; label: string; items: ShoppingItem[] }[];
  toBuy: number;
  bought: number;
};

export function groupItems(items: ShoppingItem[]): ShoppingView["byCategory"] {
  return SHOPPING_CATEGORIES.map((category) => ({
    category,
    label: SHOPPING_CATEGORY_LABELS[category],
    items: items.filter((i) => (SHOPPING_CATEGORIES.includes(i.category as ShoppingCategory) ? i.category : "otros") === category).sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name, "es")),
  })).filter((g) => g.items.length);
}

export async function getShopping(client: LifeClient): Promise<ShoppingView> {
  const db = pulso(client);
  const uid = await userId(client);
  const [list, items] = await Promise.all([db.from("shopping_lists").select("*").eq("user_id", uid).maybeSingle(), db.from("shopping_items").select("*").order("created_at")]);
  const all = must(items);
  return { list: list.data ?? null, items: all, byCategory: groupItems(all), toBuy: all.filter((i) => !i.checked).length, bought: all.filter((i) => i.checked).length };
}

/**
 * Rebuilds the plan part of the list from the active plan's slots between
 * `from` and `from + days - 1` (skipped ones left out). Manual items stay; a
 * plan item already checked stays checked when it's still needed.
 */
export async function buildShoppingList(client: LifeClient, from: string, days: number): Promise<ShoppingView> {
  if (!(days >= 1 && days <= SHOPPING_MAX_DAYS)) throw new PulsoError(`Elige de 1 a ${SHOPPING_MAX_DAYS} días.`, "invalid");
  const db = pulso(client);
  const uid = await userId(client);
  const plan = (await db.from("diet_plans").select("*").eq("active", true).maybeSingle()).data;
  if (!plan) throw new PulsoError("No tienes un plan activo. Crea o activa uno en Dieta › Plan.", "conflict");
  const to = addDays(from, days - 1);
  const [slots, recipes, current] = await Promise.all([
    db.from("plan_slots").select("*").eq("plan_id", plan.id).gte("date", from).lte("date", to).neq("status", "skipped"),
    db.from("recipes").select("*"),
    db.from("shopping_items").select("*").eq("source", "plan"),
  ]);
  const byRecipe = new Map<string, Recipe>(must(recipes).map((r) => [r.id, r]));
  const needed = aggregateLines(must(slots).flatMap((s) => slotItems(s, byRecipe)));
  const old = new Map(must(current).map((i) => [i.key, i]));
  const keep = new Set(needed.map((n) => n.key));
  const stale = must(current).filter((i) => !i.key || !keep.has(i.key));
  if (stale.length) must(await db.from("shopping_items").delete().in("id", stale.map((i) => i.id)).select("id"));
  // The key index is partial (manual items have none), so no upsert: update what exists, insert the rest.
  const fresh = [];
  for (const n of needed) {
    const prev = old.get(n.key);
    if (prev) must(await db.from("shopping_items").update({ name: n.name, amount: n.amount, quantity: n.quantity, unit: n.unit }).eq("id", prev.id).select("id"));
    else fresh.push({ user_id: uid, key: n.key, name: n.name, amount: n.amount, quantity: n.quantity, unit: n.unit, category: n.category, source: "plan" as const, checked: false });
  }
  if (fresh.length) must(await db.from("shopping_items").insert(fresh).select("id"));
  must(await db.from("shopping_lists").upsert({ user_id: uid, plan_id: plan.id, plan_name: plan.name, from_date: from, days, generated_at: new Date().toISOString() }).select("user_id"));
  return getShopping(client);
}

export async function addShoppingItem(client: LifeClient, input: { name: string; amount?: string | null; category?: string | null; note?: string | null }): Promise<ShoppingItem> {
  const name = input.name.trim();
  if (!name) throw new PulsoError("Escribe qué hay que comprar.", "invalid");
  const category = input.category && (SHOPPING_CATEGORIES as readonly string[]).includes(input.category) ? input.category : classify(name);
  return must(await pulso(client).from("shopping_items").insert({ user_id: await userId(client), name, amount: input.amount ?? null, category, source: "manual", note: input.note ?? null }).select("*").single());
}

export async function updateShoppingItem(client: LifeClient, id: string, patch: Partial<Pick<ShoppingItem, "name" | "amount" | "category" | "checked" | "note">>): Promise<void> {
  must(await pulso(client).from("shopping_items").update(patch).eq("id", id).select("id"));
}

export async function deleteShoppingItem(client: LifeClient, id: string): Promise<void> {
  must(await pulso(client).from("shopping_items").delete().eq("id", id).select("id"));
}

/** Removes everything already bought. */
export async function clearChecked(client: LifeClient): Promise<number> {
  return must(await pulso(client).from("shopping_items").delete().eq("checked", true).select("id")).length;
}

/** Empties the list (plan and manual items). */
export async function clearShopping(client: LifeClient): Promise<void> {
  const uid = await userId(client);
  must(await pulso(client).from("shopping_items").delete().eq("user_id", uid).select("id"));
  must(await pulso(client).from("shopping_lists").delete().eq("user_id", uid).select("user_id"));
}
