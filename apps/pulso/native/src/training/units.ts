import type { WeightUnit } from "@/contract";

// Kilos and pounds (SwiftUI's WeightUnit.swift, the engine's training/units.ts):
// weights are stored and sent in kg; a unit only changes how a weight is shown,
// typed and stepped. Keep the three in step.

export type { WeightUnit };

export const KG_PER_LB = 0.45359237;

export const toUnit = (kg: number, unit: WeightUnit) => (unit === "lb" ? kg / KG_PER_LB : kg);
/** The exact kg of a weight typed in `unit`: 45 lb → 20.41165665 kg, which reads 45 lb again. */
export const fromUnit = (value: number, unit: WeightUnit) => (unit === "lb" ? value * KG_PER_LB : value);
export const otherUnit = (unit: WeightUnit): WeightUnit => (unit === "kg" ? "lb" : "kg");

/** Plates and pin stacks go by 5 lb or 2.5 kg; small dumbbells (≤ 25 lb, ≤ 10 kg) by 2.5 lb or 1 kg. */
const stepAt = (value: number, unit: WeightUnit) => (unit === "lb" ? (value <= 25 ? 2.5 : 5) : value <= 10 ? 1 : 2.5);
const smallUpTo = (unit: WeightUnit) => (unit === "lb" ? 25 : 10);

const EPSILON = 1e-6;
const quarter = (v: number) => Math.round(v * 4) / 4;
const isQuarter = (v: number) => Math.abs(v - quarter(v)) < EPSILON;

/** A weight as it reads on the equipment, in `unit`: a real one stays (14 kg, 47.5 lb), a converted one goes to the nearest step. */
export function snap(kg: number, unit: WeightUnit): number {
  const v = toUnit(kg, unit);
  if (isQuarter(v)) return Math.max(0, quarter(v));
  const step = stepAt(v, unit);
  return Math.max(0, Math.round(v / step) * step);
}

/** `snap` back in kg, exact: what to store for a weight on the unit's steps. */
export const snapKg = (kg: number, unit: WeightUnit) => fromUnit(snap(kg, unit), unit);

/** One step up from `value` (in `unit`), on the step grid. */
export function stepUp(value: number, unit: WeightUnit): number {
  const step = value < smallUpTo(unit) ? stepAt(value, unit) : stepAt(smallUpTo(unit) + 1, unit);
  return Math.floor(value / step + EPSILON) * step + step;
}

/** One step down from `value` (in `unit`), on the step grid, never below 0. */
export function stepDown(value: number, unit: WeightUnit): number {
  const step = stepAt(value, unit);
  return Math.max(0, Math.ceil(value / step - EPSILON) * step - step);
}

/** A weight for reading: a real one as it is (61.25 kg), a converted one to 0.1 (44.1 lb for 20 kg). */
export function shown(kg: number, unit: WeightUnit): number {
  const v = toUnit(kg, unit);
  return isQuarter(v) ? quarter(v) : Math.round(v * 10) / 10;
}

/** Spanish decimals, up to two, no grouping: "20,4", "61,25", "1074". */
export function number(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded).replace(".", ",");
}

/** "45 lb", "20,4 kg", "61,25 kg". */
export const formatWeight = (kg: number, unit: WeightUnit) => `${number(shown(kg, unit))} ${unit}`;
/** "100 lb · 45,4 kg": the weight in `unit`, then the other one. */
export const formatBoth = (kg: number, unit: WeightUnit) => `${formatWeight(kg, unit)} · ${formatWeight(kg, otherUnit(unit))}`;
/** A whole total: "2368 lb" for a session's volume. */
export const formatTotal = (kg: number, unit: WeightUnit) => `${number(Math.round(toUnit(kg, unit)))} ${unit}`;

/** Library exercise id → the unit its machine uses; the default otherwise. */
export type UnitOf = (exerciseId: string) => WeightUnit;
export const KG: UnitOf = () => "kg";
