import type { CardioIntervals, CardioTarget } from "@/contract";
import { formatWeight, number, type WeightUnit } from "./units";

// How training reads on screen (SwiftUI's TrainingText.swift): whole Spanish
// words, no "RIR", "RPE", "reps" or "3 × 8" shorthand.

/** "8 repeticiones", "1 repetición". */
export const repetitions = (count: number) => (count === 1 ? "1 repetición" : `${count} repeticiones`);

/** "6 a 8 repeticiones", "1 repetición". */
export const repsText = (min: number, max: number) => (min === max ? repetitions(min) : `${min} a ${max} repeticiones`);

const series = (sets: number) => (sets === 1 ? "serie" : "series");

/** "3 series de 6 a 8 repeticiones". */
export const targetText = (sets: number, repMin: number, repMax: number) => `${sets} ${series(sets)} de ${repsText(repMin, repMax)}`;

/** "4 series de 6 a 8", for lists. */
export const shortTarget = (sets: number, repMin: number, repMax: number) =>
  `${sets} ${series(sets)} de ${repMin === repMax ? `${repMin}` : `${repMin} a ${repMax}`}`;

/** "Remo", "Remo y Curl", "Remo, Curl y Press". */
export function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

/** "80 kg, 8 repeticiones", or the repetitions alone without a load. */
export const loadText = (kg: number, reps: number, unit: WeightUnit = "kg") => (kg > 0 ? `${formatWeight(kg, unit)}, ${repetitions(reps)}` : repetitions(reps));

/** A set from last time, short: "70 lb · 8". */
export const previousText = (kg: number, reps: number, unit: WeightUnit) => (kg > 0 ? `${formatWeight(kg, unit)} · ${reps}` : repetitions(reps));

/** Repetitions to leave in the tank: the target RIR, else 10 − RPE. */
export const reserve = (rir: number | null | undefined, rpe: number | null | undefined): number | null =>
  rir ?? (rpe != null ? Math.max(0, Math.round(10 - rpe)) : null);

/** "Acaba cada serie pudiendo hacer 2 más"; null without an effort target. */
export function effortText(rir: number | null | undefined, rpe: number | null | undefined): string | null {
  const left = reserve(rir, rpe);
  if (left == null) return null;
  return left === 0 ? "Lleva cada serie hasta no poder más" : `Acaba cada serie pudiendo hacer ${left} más`;
}

/** 180 → "3 min", 90 → "1 min 30 s", 45 → "45 s". */
export function restWords(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** 90 → "1:30", 45 → "45 s". */
export const restClock = (seconds: number) => (seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);

/** 5.5 → "5:30". */
export function pace(minutesPerKm: number): string {
  let minutes = Math.floor(minutesPerKm);
  let seconds = Math.round((minutesPerKm - minutes) * 60);
  if (seconds === 60) [minutes, seconds] = [minutes + 1, 0];
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The 1–10 effort after an exercise, as Apple Fitness bands it (stored in the sets' rpe). */
export const EFFORT_RANGE = [1, 10] as const;
export const effortWord = (value: number) => (value <= 3 ? "Fácil" : value <= 6 ? "Moderado" : value <= 8 ? "Difícil" : "Máximo");
export const EFFORT_BANDS: { word: string; span: number }[] = [
  { word: "Fácil", span: 3 },
  { word: "Moderado", span: 3 },
  { word: "Difícil", span: 2 },
  { word: "Máximo", span: 2 },
];

/** "8 rondas de 30 s y 90 s de pausa". */
export const intervalsSummary = (i: CardioIntervals) => `${i.rounds} ${i.rounds === 1 ? "ronda" : "rondas"} de ${i.workSeconds} s y ${i.restSeconds} s de pausa`;

/** "20 min · zona 2", "8 rondas de 30 s y 90 s de pausa · zona 4", "5 km". */
export function cardioSummary(target: CardioTarget | null | undefined): string {
  if (!target) return "Cardio";
  const parts: string[] = [];
  if (target.intervals) parts.push(intervalsSummary(target.intervals));
  else if (target.durationMinutes != null) parts.push(`${number(target.durationMinutes)} min`);
  if (target.distanceKm != null) parts.push(`${number(target.distanceKm)} km`);
  if (target.zone != null) parts.push(`zona ${target.zone}`);
  return parts.length ? parts.join(" · ") : "Cardio";
}

export const EQUIPMENT = ["machine", "cable", "dumbbell", "barbell", "bodyweight", "band", "kettlebell"] as const;

export function equipmentLabel(id: string): string {
  const labels: Record<string, string> = {
    machine: "Máquina",
    cable: "Polea",
    dumbbell: "Mancuernas",
    barbell: "Barra",
    bodyweight: "Peso corporal",
    band: "Bandas",
    kettlebell: "Kettlebell",
  };
  return labels[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Bodyweight and bands go by repetitions. */
export const needsLoad = (equipment: string) => !["bodyweight", "band"].includes(equipment);
