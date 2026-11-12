// The goal decides the day's budget. From the goal weight, its pace
// (suave / constante / rápido) or a date to reach it, and the body (BMR from
// the last InBody scan, else Mifflin–St Jeor), we get calories and macros.
// A target set by hand (settings.kcal_target) wins over the computed one.
// `pacing` spreads the budget over the day so "how am I doing at this hour" has
// an answer.
import type { ActivityLevel, GoalMode, MealSlot, PulsoSettings } from "../types";

export const KCAL_PER_KG = 7700;

const ACTIVITY: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  activo: 1.725,
  muy_activo: 1.9,
};

/** Weekly change as a share of body weight, per pace. */
const PACE: Record<GoalMode, { lose: number; gain: number }> = {
  suave: { lose: 0.0025, gain: 0.0012 },
  constante: { lose: 0.005, gain: 0.0025 },
  rapido: { lose: 0.0075, gain: 0.004 },
};

export const GOAL_MODE_LABEL: Record<GoalMode, string> = { suave: "Suave", constante: "Constante", rapido: "Rápido" };

export type BudgetInput = {
  settings: Pick<
    PulsoSettings,
    "goal_weight_kg" | "goal_mode" | "goal_reach_by" | "kcal_target" | "protein_g_target" | "carbs_g_target" | "fat_g_target" | "fiber_g_target" | "height_cm" | "sex" | "birth_date" | "activity_level"
  >;
  /** Current weight (trend or latest morning weigh-in). */
  weightKg: number | null;
  /** BMR measured by the last scan, if any. */
  scanBmr?: number | null;
  /** Today, "YYYY-MM-DD" (for age and a target date). */
  today: string;
};

export type Budget = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** manual = settings.kcal_target; meta = computed from the goal; mantener = no goal, maintenance. */
  source: "manual" | "meta" | "mantener";
  direction: "bajar" | "subir" | "mantener";
  /** Maintenance estimate, kcal/day. */
  tdee: number | null;
  bmr: number | null;
  /** Expected kg/week at this budget (negative = losing). */
  kgPerWeek: number | null;
  /** Weeks to the goal at that pace. */
  weeksToGoal: number | null;
  /** One line for the UI. */
  explanation: string;
};

function age(birth: string | null, today: string): number | null {
  if (!birth) return null;
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Mifflin–St Jeor, or null without sex, age, height and weight. */
export function mifflin(sex: "male" | "female" | null, ageYears: number | null, heightCm: number | null, weightKg: number | null): number | null {
  if (!sex || ageYears == null || !heightCm || !weightKg) return null;
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161));
}

const round5 = (n: number) => Math.round(n / 5) * 5;

function macros(kcal: number, weightKg: number | null, direction: Budget["direction"], s: BudgetInput["settings"]) {
  const w = weightKg ?? 70;
  const protein = s.protein_g_target ?? Math.round(w * (direction === "bajar" ? 2.0 : 1.8));
  const fat = s.fat_g_target ?? Math.round(w * 0.8);
  const carbs = s.carbs_g_target ?? Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fiber = s.fiber_g_target ?? Math.round((kcal / 1000) * 14);
  return { protein, carbs, fat, fiber };
}

export function computeBudget({ settings: s, weightKg, scanBmr, today }: BudgetInput): Budget {
  const bmr = scanBmr && scanBmr > 0 ? Math.round(scanBmr) : mifflin(s.sex, age(s.birth_date, today), s.height_cm, weightKg);
  const tdee = bmr ? Math.round(bmr * ACTIVITY[s.activity_level ?? "ligero"]) : null;
  const goal = s.goal_weight_kg;
  const diff = goal != null && weightKg != null ? goal - weightKg : null;
  const direction: Budget["direction"] = diff == null || Math.abs(diff) < 0.3 ? "mantener" : diff < 0 ? "bajar" : "subir";

  // Weekly rate: from the date when there is one (capped at the fast pace), else the pace.
  let kgPerWeek: number | null = null;
  if (direction !== "mantener" && weightKg != null && diff != null) {
    const pace = PACE[s.goal_mode ?? "constante"];
    const max = weightKg * (direction === "bajar" ? PACE.rapido.lose : PACE.rapido.gain);
    let rate = weightKg * (direction === "bajar" ? pace.lose : pace.gain);
    if (s.goal_reach_by) {
      const weeks = (Date.parse(`${s.goal_reach_by}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (7 * 86_400_000);
      if (weeks > 0) rate = Math.min(max, Math.abs(diff) / weeks);
    }
    kgPerWeek = (direction === "bajar" ? -1 : 1) * rate;
  }

  const weeksToGoal = kgPerWeek && diff != null ? Math.ceil(Math.abs(diff / kgPerWeek)) : null;

  if (s.kcal_target) {
    const kcal = s.kcal_target;
    const real = tdee ? ((kcal - tdee) * 7) / KCAL_PER_KG : null;
    return {
      kcal,
      ...macros(kcal, weightKg, direction, s),
      source: "manual",
      direction,
      tdee,
      bmr,
      kgPerWeek: real,
      weeksToGoal: real && diff != null && Math.sign(real) === Math.sign(diff) ? Math.ceil(Math.abs(diff / real)) : null,
      explanation: "Presupuesto fijado a mano.",
    };
  }

  if (!tdee) {
    const kcal = 2000;
    return {
      kcal,
      ...macros(kcal, weightKg, direction, s),
      source: "mantener",
      direction,
      tdee: null,
      bmr: null,
      kgPerWeek: null,
      weeksToGoal: null,
      explanation: "Completa tu perfil (sexo, nacimiento, estatura) y un pesaje para calcular tu presupuesto.",
    };
  }

  const floor = Math.max(bmr ?? 0, s.sex === "female" ? 1200 : 1500);
  const daily = kgPerWeek ? (kgPerWeek * KCAL_PER_KG) / 7 : 0;
  const kcal = round5(Math.max(floor, tdee + daily));
  const pace = s.goal_mode ? GOAL_MODE_LABEL[s.goal_mode].toLowerCase() : "constante";
  const explanation =
    direction === "mantener"
      ? `Mantenimiento: ~${tdee.toLocaleString("es-MX")} kcal al día.`
      : `${direction === "bajar" ? "Bajar" : "Subir"} ${Math.abs(kgPerWeek ?? 0).toFixed(2)} kg por semana (${s.goal_reach_by ? "para tu fecha" : pace}) desde ~${tdee.toLocaleString("es-MX")} kcal de mantenimiento.`;
  return {
    kcal,
    ...macros(kcal, weightKg, direction, s),
    source: direction === "mantener" ? "mantener" : "meta",
    direction,
    tdee,
    bmr,
    kgPerWeek,
    weeksToGoal,
    explanation,
  };
}

/** Default meal times when the person hasn't set theirs. */
export const DEFAULT_MEAL_TIMES: Record<Exclude<MealSlot, "snack">, string> = { desayuno: "08:30", comida: "14:30", cena: "20:30" };
const SHARE: Record<Exclude<MealSlot, "snack">, number> = { desayuno: 0.3, comida: 0.4, cena: 0.3 };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/**
 * How much of the day's budget should be eaten by `nowMin` (minutes since
 * local midnight): each meal's share lands over the hour around its time.
 */
export function pacing(budgetKcal: number, nowMin: number, mealTimes?: Partial<Record<MealSlot, string>>): number {
  let expected = 0;
  for (const slot of ["desayuno", "comida", "cena"] as const) {
    const at = toMin(mealTimes?.[slot] ?? DEFAULT_MEAL_TIMES[slot]);
    const t = Math.max(0, Math.min(1, (nowMin - (at - 30)) / 60));
    expected += budgetKcal * SHARE[slot] * t;
  }
  return Math.round(expected);
}

export type PaceState = "bien" | "adelantado" | "atrasado" | "pasado";

/** Where the eaten kcal stand against the budget and its pacing. */
export function paceState(eaten: number, budgetKcal: number, expectedNow: number): PaceState {
  if (eaten > budgetKcal * 1.03) return "pasado";
  if (eaten > expectedNow + budgetKcal * 0.15) return "adelantado";
  if (eaten < expectedNow - budgetKcal * 0.25) return "atrasado";
  return "bien";
}
