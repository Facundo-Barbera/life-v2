import { describe, expect, test } from "bun:test";
import type { Substance, SubstanceEntry, SubstanceSummary } from "@/contract";
import {
  addForm,
  choices,
  clampToNow,
  createGate,
  definitionPatch,
  entryDetail,
  entrySubtitle,
  entryTitle,
  GRANT_MS,
  glyph,
  lastUseCaption,
  lastUseText,
  levelOpacity,
  moveId,
  newUse,
  quantityText,
  showsThc,
  sortSubstances,
  substanceDetail,
  switchSubstance,
  unitLabel,
  useInput,
  weeksReadout,
} from "./model";

const substance = (over: Partial<Substance>): Substance => ({
  id: "cannabis",
  name: "Cannabis",
  symbol: null,
  unit: "sesiones",
  forms: ["fumado", "vapeado", "comestible"],
  maxDaysPerWeek: null,
  archived: false,
  position: 0,
  builtin: true,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const summary = (over: Partial<SubstanceSummary>): SubstanceSummary => ({
  substanceId: "cannabis",
  today: "2026-10-22",
  days: [],
  weeks: [],
  avgDaysPerWeek: null,
  daysThisWeek: 0,
  daysWithout: null,
  longestWithout: 0,
  lastUse: null,
  timeOfDay: [],
  byForm: [],
  byContext: [],
  bySubstance: [],
  goal: null,
  correlations: [],
  ...over,
});

describe("words", () => {
  test("quantities in their unit, singular at one", () => {
    expect(quantityText(1, "tragos")).toBe("1 trago");
    expect(quantityText(2, "tragos")).toBe("2 tragos");
    expect(quantityText(2.5, "mg")).toBe("2,5 mg");
    expect(quantityText(1, "Sesiones")).toBe("1 sesión");
    expect(unitLabel("mg")).toBe("mg");
    expect(unitLabel("tragos")).toBe("Tragos");
  });
  test("last use", () => {
    expect(lastUseText("2026-10-22", "21:30", "2026-10-22")).toBe("Hoy, 21:30");
    expect(lastUseText("2026-10-21", "21:30", "2026-10-22")).toBe("Ayer, 21:30");
    expect(lastUseText("2026-10-19", "21:30", "2026-10-22")).toBe("Hace 3 días");
    expect(lastUseCaption(summary({ lastUse: { date: "2026-10-21", time: "23:10" } }))).toBe("Último registro: ayer, 23:10");
    expect(lastUseCaption(summary({}))).toBeNull();
  });
  test("entries", () => {
    expect(entryTitle({ form: "fumado", amount: "normal" }, "Cannabis", false)).toBe("Fumado · Normal");
    expect(entryTitle({ form: "fumado", amount: "poco" }, "Cannabis", true)).toBe("Cannabis · Fumado · Poco");
    expect(entryTitle({ form: null, amount: "mucho" }, "Alcohol", false)).toBe("Alcohol · Mucho");
    expect(entrySubtitle({ date: "2026-10-22", time: "21:30", context: "social" }, "2026-10-22")).toBe("Hoy · 21:30 · Social");
    expect(entryDetail({ thcMg: 10, quantity: 2 }, "sesiones")).toBe("10 mg THC");
    expect(entryDetail({ thcMg: null, quantity: 2 }, "tragos")).toBe("2 tragos");
    expect(entryDetail({ thcMg: null, quantity: null }, "tragos")).toBeNull();
  });
  test("glyphs: emoji, a symbol name, or the neutral one", () => {
    expect(glyph("🌿")).toEqual({ kind: "emoji", text: "🌿" });
    expect(glyph("☕️")).toEqual({ kind: "emoji", text: "☕️" });
    expect(glyph("cup.and.saucer")).toEqual({ kind: "symbol", name: "cup.and.saucer" });
    expect(glyph("")).toEqual({ kind: "symbol", name: "circle.dashed" });
    expect(glyph("Hola")).toEqual({ kind: "symbol", name: "circle.dashed" });
    expect(glyph(null)).toEqual({ kind: "symbol", name: "circle.dashed" });
  });
  test("levels and weeks", () => {
    expect([0, 1, 2, 3].map(levelOpacity)).toEqual([0.1, 0.38, 0.65, 0.95]);
    expect(weeksReadout(summary({ avgDaysPerWeek: 1.5 }), null)).toBe("Promedio 1,5 por semana");
    expect(weeksReadout(summary({ daysThisWeek: 2 }), null)).toBe("Esta semana: 2");
    expect(weeksReadout(summary({}), { weekStart: "2026-10-05", days: 1 })).toBe("Semana del 5 oct: 1 día");
  });
  test("a substance's detail", () => {
    expect(substanceDetail(substance({ unit: "tragos", forms: ["fumado", "vapeado"], maxDaysPerWeek: 2 }))).toBe("Tragos · Fumado, Vapeado · Máx. 2 días/sem");
  });
});

describe("log draft", () => {
  const now = new Date(2026, 9, 22, 21, 30);
  test("defaults to now, this substance, its first form, Normal", () => {
    const d = newUse(substance({}), now);
    expect(d).toMatchObject({ substanceId: "cannabis", date: "2026-10-22", time: "21:30", form: "fumado", amount: "normal" });
  });
  test("THC only for cannabis edibles; switching keeps a shared form", () => {
    const d = { ...newUse(substance({}), now), form: "comestible", thcMg: 10 };
    expect(showsThc(d)).toBe(true);
    const alcohol = substance({ id: "alcohol", forms: ["bebido"] });
    const moved = switchSubstance(d, alcohol);
    expect(moved.form).toBe("bebido");
    expect(useInput(moved).thcMg).toBeNull();
    expect(switchSubstance({ ...d, form: "vapeado" }, substance({ id: "otra", forms: ["vapeado"] })).form).toBe("vapeado");
  });
  test("input clears blanks and zeros", () => {
    const input = useInput({ ...newUse(substance({}), now), quantity: 0, note: "  " });
    expect(input.quantity).toBeNull();
    expect(input.note).toBeNull();
  });
  test("never in the future", () => {
    const d = newUse(substance({}), now);
    expect(clampToNow({ ...d, time: "23:00" }, now).time).toBe("21:30");
    expect(clampToNow({ ...d, date: "2026-10-23" }, now).date).toBe("2026-10-22");
    expect(clampToNow({ ...d, date: "2026-10-21", time: "23:00" }, now).time).toBe("23:00");
  });
  test("choices add the archived substance an entry belongs to", () => {
    const list = [substance({}), substance({ id: "old", archived: true })];
    expect(choices(list, "cannabis").map((s) => s.id)).toEqual(["cannabis"]);
    expect(choices(list, "old").map((s) => s.id)).toEqual(["cannabis", "old"]);
  });
  test("entry type stays assignable", () => {
    const e: Pick<SubstanceEntry, "form" | "amount"> = { form: null, amount: "normal" };
    expect(entryTitle(e, "X", false)).toBe("X · Normal");
  });
});

describe("substances", () => {
  test("definition patch trims, dedupes and clears", () => {
    expect(definitionPatch({ name: " Café ", symbol: " ", unit: "", forms: ["Bebido", "bebido", " "], maxDaysPerWeek: null })).toEqual({ name: "Café", symbol: null, forms: ["Bebido"], maxDaysPerWeek: null });
    expect(definitionPatch({ name: "X", symbol: "☕️", unit: "tazas", forms: [], maxDaysPerWeek: 3 })).toEqual({ name: "X", symbol: "☕️", unit: "tazas", forms: [], maxDaysPerWeek: 3 });
    expect(addForm(["fumado"], " Fumado ")).toEqual(["fumado"]);
    expect(addForm(["fumado"], "vapeado")).toEqual(["fumado", "vapeado"]);
  });
  test("order and moves", () => {
    const sorted = sortSubstances([substance({ id: "b", position: 1 }), substance({ id: "z", archived: true, position: 0 }), substance({ id: "a", position: 0 })]);
    expect(sorted.map((s) => s.id)).toEqual(["a", "b", "z"]);
    expect(moveId(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
  });
});

describe("gate", () => {
  test("a grant opens the screen once, briefly", () => {
    const gate = createGate();
    expect(gate.consume(0)).toBe(false);
    gate.grant(1000);
    expect(gate.consume(2000)).toBe(true);
    expect(gate.consume(2001)).toBe(false);
    gate.grant(0);
    expect(gate.consume(GRANT_MS + 1)).toBe(false);
  });
});
