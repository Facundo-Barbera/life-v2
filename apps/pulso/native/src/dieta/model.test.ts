import { describe, expect, test } from "bun:test";
import type { FoodProduct, MealEntry, NutrientZone, PlanSlot } from "@/contract";
import {
  addDays,
  amountText,
  cleanBarcode,
  dayTitle,
  defaultPortion,
  eatenAtFor,
  groupLogged,
  int,
  moments,
  productPortions,
  slotActions,
  slotForDrink,
  slotForHour,
  slotMark,
  snackTotals,
  waterFormat,
  waterProgress,
  zoneGeometry,
  zoneStatus,
} from "./model";

const meal = (over: Partial<MealEntry>): MealEntry => ({
  id: "m",
  date: "2026-10-21",
  eatenAt: 0,
  slot: "comida",
  name: "x",
  quantity: 100,
  unit: "g",
  kcal: 100,
  protein: 10,
  carbs: 10,
  fat: 1,
  fiber: 0,
  caffeineMg: null,
  alcoholG: null,
  source: "manual",
  barcode: null,
  planItemId: null,
  slotId: null,
  offPlan: false,
  note: null,
  measure: null,
  dish: null,
  ...over,
});

const slot = (over: Partial<PlanSlot>): PlanSlot => ({
  id: "s",
  planId: "p",
  date: "2026-10-21",
  slot: "cena",
  kind: "items",
  name: null,
  recipeId: null,
  prepId: null,
  portions: null,
  items: [],
  adjusted: null,
  macros: { kcal: 500, protein: 30, carbs: 50, fat: 10, fiber: 5 },
  status: "planned",
  entryIds: [],
  replacedBy: null,
  real: null,
  missed: false,
  cookMinutes: null,
  note: null,
  ...over,
});

describe("dates", () => {
  test("titles", () => {
    expect(dayTitle("2026-10-21", "2026-10-21")).toBe("Hoy, 21 de octubre");
    expect(dayTitle("2026-10-20", "2026-10-21")).toBe("Ayer, 20 de octubre");
    expect(dayTitle("2026-10-19", "2026-10-21")).toBe("Lunes, 19 de octubre");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
  test("another day keeps the wall-clock time", () => {
    const now = new Date(2026, 9, 21, 14, 30);
    const at = new Date(eatenAtFor("2026-10-19", now));
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([19, 14, 30]);
    expect(eatenAtFor("2026-10-21", now)).toBe(now.getTime());
  });
});

test("numbers and amounts", () => {
  expect(int(1480)).toBe("1 480");
  expect(amountText({ quantity: 710, unit: "ml", measure: { amount: 2, unit: "lata", size: null } })).toBe("2 latas (710 ml)");
  expect(amountText({ quantity: 1, unit: "serving", measure: null })).toBe("1 porción");
});

test("slots by hour", () => {
  expect([8, 11, 14, 17, 21].map(slotForHour)).toEqual(["desayuno", "media_manana", "comida", "merienda", "cena"]);
  expect([7, 11, 14, 21].map(slotForDrink)).toEqual(["desayuno", "snack", "comida", "cena"]);
});

test("zones", () => {
  const z: NutrientZone = { kind: "range", min: 2190, max: 2420, custom: false, value: 2600, target: 2300, status: "above" };
  const g = zoneGeometry(z);
  expect(g.over).toBeGreaterThan(0);
  expect(g.bandTo).toBeLessThan(1);
  expect(zoneStatus(z, "kcal")).toBe("Te pasaste 180 kcal");
  expect(zoneStatus({ ...z, kind: "min", value: 170, min: 160, status: "inZone" }, "g")).toBe("Mínimo cumplido");
});

test("water", () => {
  const s = { goalMl: null, unit: "vaso" as const, glassMl: 250, bottleMl: 500 };
  expect(waterProgress(s, 750, 2000)).toBe("3 de 8 vasos");
  expect(waterFormat({ ...s, unit: "botella" }, 750)).toBe("1,5 botellas");
  expect(waterProgress({ ...s, unit: "ml" }, 750, 2750)).toBe("750 ml de 2,75 L");
});

test("plan slot marks and actions", () => {
  expect(slotMark(slot({ missed: true }))).toBe("unanswered");
  expect(slotMark(slot({ status: "eaten", real: { label: "", entryIds: [], macros: slot({}).macros, eatenAt: 0, asPlanned: false } }))).toBe("changed");
  expect(slotActions(slot({}))).toContain("noCook");
  expect(slotActions(slot({ kind: "prep" }))).not.toContain("noCook");
  expect(slotActions(slot({ status: "skipped" }))).toEqual([]);
});

test("dishes fold into one row; snacks apart are separate moments", () => {
  const d = { id: "d1", name: "Batido", savedDishId: null };
  const rows = groupLogged([meal({ id: "a", eatenAt: 1, dish: d }), meal({ id: "b", eatenAt: 2 }), meal({ id: "c", eatenAt: 3, dish: d })]);
  expect(rows.map((r) => r.kind)).toEqual(["dish", "food"]);
  const ms = moments([meal({ id: "a", slot: "snack", unit: "ml", eatenAt: 0 }), meal({ id: "b", slot: "snack", eatenAt: 60 * 60_000 })]);
  expect(ms.map((m) => m.title)).toEqual(["Bebida", "Snack"]);
});

test("barcode portions", () => {
  const p: FoodProduct = { barcode: "7501045401234", name: "Coca", brand: null, per100g: { kcal: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0 }, servingGrams: null, imageUrl: null, liquid: true, packageSize: 355, packageKind: "lata" };
  expect(productPortions(p).map((x) => x.label)).toEqual(["Lata (355 ml)", "Vaso (250 ml)", "Media (178 ml)"]);
  expect(defaultPortion(p).amount).toBe(355);
  expect(cleanBarcode("750-1045 401234")).toBe("7501045401234");
  expect(cleanBarcode("1234")).toBeNull();
});

test("snack totals", () => {
  const t = snackTotals("botella", 1, null, { kcal: null, protein: 1, carbs: 10, fat: 0, fiber: 0, caffeine: 0, abv: 5 });
  expect(t.quantity).toBe(500);
  expect(t.unit).toBe("ml");
  expect(t.alcoholG).toBe(19.7);
  expect(t.macros.kcal).toBe(44 + 138);
});
