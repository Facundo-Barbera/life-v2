import { repetitions } from "./text";
import { formatWeight, fromUnit, number, shown, snap, stepDown, toUnit, type WeightUnit } from "./units";

// Sets where the load dropped mid-set ("80 × 5 → 60 × 3"): SwiftUI's
// SetDrop.swift and the engine's training/segments.ts. Keep them in step.

export type Segment = { weightKg: number; reps: number };

/** About 15 % lighter, so a suggested drop lands between 10 and 20 % on most loads. */
const FACTOR = 0.85;

/** The segment after a set's last one: ~15 % lighter on the unit's steps (at least one step down), for the reps still missing to `repMin` (≥ 1). */
export function nextDrop(top: Segment, drops: Segment[], repMin: number, unit: WeightUnit): Segment {
  const last = drops.at(-1) ?? top;
  const done = drops.reduce((n, d) => n + d.reps, top.reps);
  const reps = Math.max(1, repMin - done);
  if (last.weightKg <= 0) return { weightKg: 0, reps };
  const value = snap(last.weightKg, unit);
  const target = toUnit(last.weightKg, unit) * FACTOR;
  let above = stepDown(value, unit);
  let below = above;
  while (below > target && below > 0) [above, below] = [below, stepDown(below, unit)];
  const weight = above - target <= target - below ? above : below;
  return { weightKg: fromUnit(weight, unit), reps };
}

/** "¿Bajaste el peso para terminarla?": a set just checked off short of the range's bottom, with a load and no drop yet. */
export function dropOffer(set: { weightKg: number; reps: number; doneAt: number | null; drops: Segment[] }, repMin: number, unit: WeightUnit): Segment | null {
  if (set.doneAt == null || set.drops.length || set.weightKg <= 0 || set.reps <= 0 || set.reps >= repMin) return null;
  const drop = nextDrop({ weightKg: set.weightKg, reps: set.reps }, [], repMin, unit);
  return drop.weightKg > 0 && drop.weightKg < set.weightKg ? drop : null;
}

/** "80 × 5 → 60 × 3": numbers in `unit`, for a row whose header names the unit. */
export const dropsShort = (segments: Segment[], unit: WeightUnit) =>
  segments.map((s) => (s.weightKg > 0 ? `${number(shown(s.weightKg, unit))} × ${s.reps}` : repetitions(s.reps))).join(" → ");

/** "80 kg × 5 → 60 kg × 3", the unit on every load. */
export const dropsText = (segments: Segment[], unit: WeightUnit) =>
  segments.map((s) => (s.weightKg > 0 ? `${formatWeight(s.weightKg, unit)} × ${s.reps}` : repetitions(s.reps))).join(" → ");
