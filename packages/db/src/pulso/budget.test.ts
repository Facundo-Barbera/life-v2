import { describe, expect, test } from "bun:test";
import { computeBudget, mifflin, paceState, pacing } from "./budget";

const base = {
  goal_weight_kg: 78, goal_mode: "constante" as const, goal_reach_by: null, kcal_target: null,
  protein_g_target: null, carbs_g_target: null, fat_g_target: null, fiber_g_target: null,
  height_cm: 178, sex: "male" as const, birth_date: "1996-05-01", activity_level: "moderado" as const,
};

describe("budget", () => {
  test("Mifflin", () => {
    expect(mifflin("male", 30, 178, 85)).toBe(1818);
    expect(mifflin(null, 30, 178, 85)).toBeNull();
  });
  test("losing at a steady pace is a deficit under maintenance", () => {
    const b = computeBudget({ settings: base, weightKg: 85, today: "2026-11-12" });
    expect(b.direction).toBe("bajar");
    expect(b.source).toBe("meta");
    expect(b.tdee).toBe(Math.round(1818 * 1.55));
    expect(b.kcal).toBeLessThan(b.tdee!);
    expect(b.kgPerWeek).toBeCloseTo(-0.425, 3);
    expect(b.protein).toBe(170);
  });
  test("a scan's BMR wins over the formula", () => {
    const b = computeBudget({ settings: base, weightKg: 85, scanBmr: 1900, today: "2026-11-12" });
    expect(b.bmr).toBe(1900);
  });
  test("a manual target wins", () => {
    const b = computeBudget({ settings: { ...base, kcal_target: 2100 }, weightKg: 85, today: "2026-11-12" });
    expect(b.kcal).toBe(2100);
    expect(b.source).toBe("manual");
  });
  test("a target date sets the rate, capped at the fast pace", () => {
    const b = computeBudget({ settings: { ...base, goal_reach_by: "2026-11-26" }, weightKg: 85, today: "2026-11-12" });
    expect(b.kgPerWeek).toBeCloseTo(-85 * 0.0075, 5);
  });
  test("never under the floor", () => {
    const b = computeBudget({ settings: { ...base, activity_level: "sedentario", goal_mode: "rapido" }, weightKg: 85, scanBmr: 1600, today: "2026-11-12" });
    expect(b.kcal).toBeGreaterThanOrEqual(1600);
  });
  test("without a profile it says what's missing", () => {
    const b = computeBudget({ settings: { ...base, sex: null }, weightKg: 85, today: "2026-11-12" });
    expect(b.tdee).toBeNull();
    expect(b.explanation).toMatch(/perfil/);
  });
  test("pacing over the day", () => {
    expect(pacing(2000, 6 * 60)).toBe(0);
    expect(pacing(2000, 9 * 60 + 30)).toBe(600);
    expect(pacing(2000, 23 * 60)).toBe(2000);
    expect(paceState(950, 2000, 600)).toBe("adelantado");
    expect(paceState(2100, 2000, 2000)).toBe("pasado");
    expect(paceState(600, 2000, 600)).toBe("bien");
  });
});
