// What the home-screen widgets draw: the unchanged PulsoWidgets read
// `widget-snapshot.json` from the App Group, decoded as Shared/WidgetSnapshot.swift
// (`Date`s in epoch ms). Pure: built from the engine's answers here and merged
// over the last snapshot exactly as `WidgetSnapshot.applying` does.
import type { OutputOf } from "@/contract";
import { dayKey } from "@/health/sync/days";

export type Recovery = { score?: number; level: string; explanation: string };
export type Macros = { kcal: number; kcalTarget?: number; protein: number; proteinTarget?: number };
export type Dose = { medicationId: string; name: string; doseText: string; date: string; time: string; due: number; slot?: string };
export type Workout = { programName: string; dayName: string; focus?: string; exercises: number };

export type WidgetSnapshot = {
  updatedAt: number;
  /** The local day it describes, so yesterday's macros never read as today's. */
  date: string;
  recovery?: Recovery;
  macros?: Macros;
  nextDose?: Dose;
  /** Scheduled doses still pending today, `nextDose` included. */
  dosesLeft: number;
  workout?: Workout;
};

/** What one refresh fetched; undefined = that request failed. `workout: null` = no active program. */
export type Update = {
  recovery?: Recovery;
  macros?: Macros;
  doses?: { next?: Dose; left: number };
  workout?: Workout | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const clockTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

export const recoveryOf = (r: OutputOf<"get_readiness">): Recovery => defined({ score: r.score ?? undefined, level: r.level, explanation: r.explanation });

export const macrosOf = (day: OutputOf<"get_nutrition_day">): Macros =>
  defined({ kcal: day.summary.totals.kcal, kcalTarget: day.summary.targets?.kcal, protein: day.summary.totals.protein, proteinTarget: day.summary.targets?.protein });

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

type Slot = OutputOf<"get_medication_day">["slots"][number];
/** A dose the widget can show: one with a time (a slot waiting for a workout has none). */
export function doseOf(slot: Slot): Dose | undefined {
  if (!slot.time) return undefined;
  const [y, m, d] = slot.date.split("-").map(Number);
  const [hh, mm] = slot.time.split(":").map(Number);
  const due = new Date(y!, m! - 1, d!, hh!, mm!).getTime();
  if (Number.isNaN(due)) return undefined;
  return { medicationId: slot.medicationId, name: slot.name, doseText: `${number.format(slot.dose)} ${slot.unit}`, date: slot.date, time: slot.time, due, slot: slot.slot };
}

export const dosesOf = (day: OutputOf<"get_medication_day">) => ({
  next: day.next ? doseOf(day.next) : undefined,
  left: day.slots.filter((s) => s.status === "pendiente").length,
});

export function workoutOf(r: OutputOf<"get_training_program">): Workout | null {
  const program = r.program;
  const day = program && (program.days.find((d) => d.id === r.nextDayId) ?? program.days[0]);
  if (!program || !day) return null;
  return defined({ programName: program.name, dayName: day.name, focus: day.focus ?? undefined, exercises: day.exercises.length });
}

export const isEmpty = (u: Update) => u.recovery === undefined && u.macros === undefined && u.doses === undefined && u.workout === undefined;

/** A section whose request failed keeps its old value, except the day-bound ones (macros, doses) once the day changed. */
export function applying(update: Update, old: WidgetSnapshot | null, now: Date): WidgetSnapshot {
  const today = dayKey(now);
  const sameDay = old?.date === today;
  return defined({
    updatedAt: now.getTime(),
    date: today,
    recovery: update.recovery ?? old?.recovery,
    macros: update.macros ?? (sameDay ? old?.macros : undefined),
    nextDose: update.doses ? update.doses.next : sameDay ? old?.nextDose : undefined,
    dosesLeft: update.doses?.left ?? (sameDay ? (old?.dosesLeft ?? 0) : 0),
    workout: update.workout === undefined ? old?.workout : (update.workout ?? undefined),
  });
}
