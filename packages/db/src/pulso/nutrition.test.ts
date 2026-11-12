import { describe, expect, test } from "bun:test";
import type { Meal } from "../types";
import { frequentFoods, normalizeBarcode, parseOffProduct, portionOf, scaleItems, slotForTime, totals } from "./nutrition";
import { materialize, rotationIndex, slotItems } from "./nutrition-plan";
import { aggregateLines, buyable, classify, groupItems, nameKey } from "./shopping";

const meal = (over: Partial<Meal>): Meal => ({
  id: crypto.randomUUID(), user_id: "u", eaten_at: "2026-11-12T14:00:00Z", local_date: "2026-11-12", slot: "comida", name: "Arroz",
  quantity: 100, unit: "g", kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4, source: "manual", barcode: null,
  caffeine_mg: null, alcohol_g: null, measure: null, dish_id: null, dish_name: null, plan_slot_id: null, saved_dish_id: null, off_plan: false, notes: null,
  created_at: "", updated_at: "", ...over,
});

describe("nutrition", () => {
  test("totals round", () => {
    expect(totals([meal({}), meal({ kcal: 200, protein_g: 30.04 })])).toEqual({ kcal: 330, protein: 32.7, carbs: 56, fat: 0.6, fiber: 0.8 });
  });
  test("slot by time", () => {
    expect(slotForTime(8 * 60)).toBe("desayuno");
    expect(slotForTime(14 * 60)).toBe("comida");
    expect(slotForTime(21 * 60)).toBe("cena");
    expect(slotForTime(17 * 60 + 30)).toBe("snack");
  });
  test("frequent foods need two logs and keep the latest portion", () => {
    const f = frequentFoods([meal({ eaten_at: "2026-11-10T10:00:00Z", quantity: 80 }), meal({ name: "arroz ", eaten_at: "2026-11-12T10:00:00Z", quantity: 150 }), meal({ name: "Pan" })]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ times: 2, quantity: 150 });
  });
  test("scaling items", () => {
    const [i] = scaleItems([{ name: "Avena", quantity: 40, unit: "g", kcal: 150, protein: 5, carbs: 27, fat: 3 }], 1.5);
    expect(i).toMatchObject({ quantity: 60, kcal: 225, protein: 7.5 });
  });
  test("Open Food Facts product and portion", () => {
    expect(normalizeBarcode("750 1055-3000 12")).toBe("7501055300012");
    expect(normalizeBarcode("abc")).toBeNull();
    const p = parseOffProduct("7501055300001", { status: 1, product: { product_name: "Leche", brands: "Lala, Otra", quantity: "1 L", nutriments: { "energy-kcal_100g": 62, proteins_100g: 3.1, carbohydrates_100g: 4.8, fat_100g: 3.3 }, serving_quantity: 250 } });
    expect(p).toMatchObject({ name: "Leche", brand: "Lala", liquid: true, servingSize: 250 });
    expect(portionOf(p!, 250)).toEqual({ kcal: 155, protein: 7.8, carbs: 12, fat: 8.3, fiber: 0 });
    expect(parseOffProduct("1", { status: 0 })).toBeNull();
  });
});

describe("plan", () => {
  test("rotation wraps both ways", () => {
    expect(rotationIndex("2026-11-09", "2026-11-12", 3)).toBe(0);
    expect(rotationIndex("2026-11-09", "2026-11-08", 3)).toBe(2);
  });
  test("materialize skips filled dates and dates before the start", () => {
    const plan = { id: "p", starts_on: "2026-11-10", days: [{ label: "A", meals: [{ slot: "cena" as const, name: "Pollo", items: [] }, { slot: "desayuno" as const, name: "Avena", items: [] }] }] };
    const rows = materialize(plan, "2026-11-09", 4, new Set(["2026-11-11"]), "u");
    expect(rows.map((r) => r.date)).toEqual(["2026-11-10", "2026-11-10", "2026-11-12", "2026-11-12"]);
    expect(rows[0]).toMatchObject({ slot: "desayuno", position: 0 });
  });
  test("slot items fall back to the recipe, scaled", () => {
    const recipe = { id: "r", servings: 4, ingredients: [{ name: "Pollo", quantity: 800, unit: "g", kcal: 1320, protein: 248, carbs: 0, fat: 29 }] } as never;
    const items = slotItems({ items: [], recipe_id: "r", portions: 1 }, new Map([["r", recipe]]));
    expect(items[0]).toMatchObject({ quantity: 200, kcal: 330 });
  });
});

describe("shopping", () => {
  test("keys fold plurals and cooking", () => {
    expect(nameKey("Pechugas de pollo a la plancha")).toBe(nameKey("pechuga de pollo"));
    expect(classify("Jitomates")).toBe("frutas_verduras");
    expect(classify("Huevos")).toBe("lacteos_huevos");
    expect(classify("Tortillas de maíz")).toBe("panaderia_cereales");
    expect(classify("Papel de cocina")).toBe("otros");
  });
  test("aggregates and rounds to buyable", () => {
    const n = aggregateLines([
      { name: "Huevo", quantity: 2, unit: "ud" },
      { name: "Huevos", quantity: 14, unit: "pieza" },
      { name: "Jitomate", quantity: 600, unit: "g" },
      { name: "jitomate", quantity: 450, unit: "gr" },
      { name: "Leche", quantity: 750, unit: "g" },
    ]);
    const by = new Map(n.map((x) => [x.key, x]));
    expect(by.get("huevo|ud")).toMatchObject({ quantity: 16, amount: "18" });
    expect(by.get("jitomate|g")).toMatchObject({ quantity: 1050, amount: "1.1 kg" });
    expect(by.get("leche|ml")?.amount).toBe("1 L");
    expect(buyable(3, "lata")).toBe("3 latas");
  });
  test("groups checked last", () => {
    const item = (name: string, checked: boolean, category = "despensa") => ({ id: name, user_id: "u", key: null, name, amount: null, quantity: null, unit: null, category, source: "manual" as const, checked, pantry: false, note: null, created_at: "", updated_at: "" });
    const g = groupItems([item("Sal", true), item("Aceite", false), item("Rollo", false, "raro")]);
    expect(g.map((x) => x.category)).toEqual(["despensa", "otros"]);
    expect(g[0]!.items.map((i) => i.name)).toEqual(["Aceite", "Sal"]);
  });
});
