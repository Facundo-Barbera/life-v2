// Pure training logic, shared by web and phone: units (weights are stored in
// kg), e1RM and bests, double progression, an exercise's performance, similar
// exercises, and the block's week math. Ported from the old engine's
// training/{units,math,segments,similar,weeks}.ts without the Coach.
import type { LibraryExercise, ProgramDay, ProgramExercise, SetDrop, WeightUnit, Workout } from "../types";
import { addDays, daysBetween, weekStart } from "./dates";

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export const KG_PER_LB = 0.45359237;
export const toUnit = (kg: number, unit: WeightUnit) => (unit === "lb" ? kg / KG_PER_LB : kg);
export const fromUnit = (value: number, unit: WeightUnit) => (unit === "lb" ? value * KG_PER_LB : value);

function stepAt(value: number, unit: WeightUnit): number {
  if (unit === "lb") return value <= 25 ? 2.5 : 5;
  return value <= 10 ? 1 : 2.5;
}
const EPSILON = 1e-6;
const quarter = (v: number) => Math.round(v * 4) / 4;

/** A weight as it reads on the equipment, in `unit` (a value from the other unit lands on the nearest step). */
export function snap(kg: number, unit: WeightUnit): number {
  const v = toUnit(kg, unit);
  if (Math.abs(v - quarter(v)) < EPSILON) return Math.max(0, quarter(v));
  const step = stepAt(v, unit);
  return Math.max(0, Math.round(v / step) * step);
}

export function stepUp(value: number, unit: WeightUnit): number {
  const small = unit === "lb" ? 25 : 10;
  const step = value < small ? stepAt(value, unit) : stepAt(small + 1, unit);
  return Math.floor(value / step + EPSILON) * step + step;
}

export function stepDown(value: number, unit: WeightUnit): number {
  const step = stepAt(value, unit);
  return Math.max(0, Math.ceil(value / step - EPSILON) * step - step);
}

/** A weight in `unit` for reading: a real one as is, a converted one to 0.1. */
export function shown(kg: number, unit: WeightUnit): number {
  const v = toUnit(kg, unit);
  return Math.abs(v - quarter(v)) < EPSILON ? quarter(v) : Math.round(v * 10) / 10;
}

const number = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });
export const formatWeight = (kg: number, unit: WeightUnit) => `${number.format(shown(kg, unit))} ${unit}`;

// ---------------------------------------------------------------------------
// Sets, e1RM, records, progression
// ---------------------------------------------------------------------------

export type LoggedSet = { weightKg: number; reps: number; drops?: SetDrop[] | null };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Epley estimated 1RM, kg. A single is its own 1RM. */
export function e1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return reps === 1 ? weightKg : round1(weightKg * (1 + reps / 30));
}

/** kg × reps over the top segment and its drops. */
export const volumeOf = (s: LoggedSet) => s.weightKg * s.reps + (s.drops ?? []).reduce((n, d) => n + d.weightKg * d.reps, 0);

/** "80 kg × 5 → 60 kg × 3"; a bodyweight set reads "8 reps". */
export function formatSet(s: LoggedSet, unit: WeightUnit): string {
  return [{ weightKg: s.weightKg, reps: s.reps }, ...(s.drops ?? [])]
    .filter((x) => x.reps > 0)
    .map((x) => (x.weightKg > 0 ? `${formatWeight(x.weightKg, unit)} × ${x.reps}` : `${x.reps} reps`))
    .join(" → ");
}

export type Bests = { e1rm: number; weight: number; reps: number };

/** Best e1RM, heaviest load and most bodyweight reps, from top segments only. */
export function bests(sets: LoggedSet[]): Bests {
  const out: Bests = { e1rm: 0, weight: 0, reps: 0 };
  for (const s of sets) {
    if (s.reps <= 0) continue;
    out.e1rm = Math.max(out.e1rm, e1rm(s.weightKg, s.reps));
    out.weight = Math.max(out.weight, s.weightKg);
    if (s.weightKg === 0) out.reps = Math.max(out.reps, s.reps);
  }
  return out;
}

export type PersonalRecord = { kind: keyof Bests; value: number; previous: number | null };

/** Records this session set against everything before it (none on a first session). */
export function recordsFor(session: LoggedSet[], before: LoggedSet[]): PersonalRecord[] {
  if (before.length === 0) return [];
  const now = bests(session);
  const prev = bests(before);
  return (["e1rm", "weight", "reps"] as const).filter((k) => now[k] > prev[k]).map((kind) => ({ kind, value: now[kind], previous: prev[kind] || null }));
}

/** Smallest sensible jump per equipment, kg. Bodyweight and bands progress by reps. */
export const INCREMENT_KG: Record<string, number> = { barbell: 2.5, dumbbell: 2, machine: 5, cable: 2.5, kettlebell: 4, bodyweight: 0, band: 0 };

export type LoadSuggestion = { weightKg: number | null; reps: number; reason: string; deload?: boolean };

/**
 * Double progression from the last session on an exercise: every set at the
 * top weight reached repMax → add a step and drop to repMin; short of repMin →
 * back off a step; else keep the weight and chase one more rep.
 */
export function nextLoad(
  rx: { sets: number; repMin: number; repMax: number },
  last: LoggedSet[] | null,
  incrementKg: number,
  unit: WeightUnit = "kg",
  deload = false,
): LoadSuggestion {
  const work = (last ?? []).filter((s) => s.reps > 0);
  if (work.length === 0) return { weightKg: null, reps: rx.repMin, reason: "Primera vez: elige un peso que puedas mover bien." };
  const top = Math.max(...work.map((s) => s.weightKg));
  const atTop = work.filter((s) => s.weightKg === top);
  const minReps = Math.min(...atTop.map((s) => s.reps));
  const now = snap(top, unit);
  const w = (kg: number) => formatWeight(kg, unit);
  if (deload) return { weightKg: fromUnit(now, unit), reps: rx.repMin, deload: true, reason: `Semana de descarga: ${w(top)} × ${rx.repMin}, lejos del fallo.` };
  if (atTop.length >= rx.sets && minReps >= rx.repMax) {
    if (incrementKg === 0) return { weightKg: top, reps: rx.repMax + 1, reason: `Hiciste ${rx.sets} series de ${rx.repMax}: haz una repetición más o añade peso.` };
    const up = snap(top + incrementKg, unit);
    const weightKg = fromUnit(up > now ? up : stepUp(now, unit), unit);
    return { weightKg, reps: rx.repMin, reason: `Hiciste ${rx.sets} series de ${rx.repMax} con ${w(top)}: sube a ${w(weightKg)}.` };
  }
  if (minReps < rx.repMin && incrementKg > 0 && top > incrementKg) {
    const down = snap(top - incrementKg, unit);
    const weightKg = fromUnit(down < now ? down : stepDown(now, unit), unit);
    return { weightKg, reps: rx.repMin, reason: `Con ${w(top)} no llegaste a ${rx.repMin}: baja a ${w(weightKg)}.` };
  }
  const reps = Math.min(rx.repMax, Math.max(rx.repMin, minReps + 1));
  const weightKg = fromUnit(now, unit);
  return { weightKg, reps, reason: `Repite ${w(weightKg)} e intenta ${reps} repeticiones en cada serie.` };
}

export type Performance = {
  maxWeight: { kg: number; reps: number; at: string } | null;
  bestE1rm: { kg: number; at: string } | null;
  maxVolume: { kg: number; at: string } | null;
  history: { at: string; topWeightKg: number; e1rm: number; volumeKg: number; sets: number }[];
};

/** Records and per-session history of one exercise; each record dated to the first session that reached it. */
export function performance(sessions: { at: string; sets: LoggedSet[] }[]): Performance {
  const out: Performance = { maxWeight: null, bestE1rm: null, maxVolume: null, history: [] };
  for (const session of [...sessions].sort((a, b) => a.at.localeCompare(b.at))) {
    const work = session.sets.filter((s) => s.reps > 0);
    if (work.length === 0) continue;
    const best = bests(work);
    const volumeKg = round1(work.reduce((n, s) => n + volumeOf(s), 0));
    out.history.push({ at: session.at, topWeightKg: best.weight, e1rm: best.e1rm, volumeKg, sets: work.length });
    if (best.weight > 0) {
      const reps = Math.max(...work.filter((s) => s.weightKg === best.weight).map((s) => s.reps));
      const prev = out.maxWeight;
      if (!prev || best.weight > prev.kg || (best.weight === prev.kg && reps > prev.reps)) out.maxWeight = { kg: best.weight, reps, at: session.at };
    }
    if (best.e1rm > (out.bestE1rm?.kg ?? 0)) out.bestE1rm = { kg: best.e1rm, at: session.at };
    if (volumeKg > (out.maxVolume?.kg ?? 0)) out.maxVolume = { kg: volumeKg, at: session.at };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Similar exercises
// ---------------------------------------------------------------------------

export const PATTERN: Record<string, string> = {
  "press-banca": "horizontal_push",
  "press-inclinado-barra": "horizontal_push",
  "press-banca-mancuernas": "horizontal_push",
  "press-inclinado-mancuernas": "horizontal_push",
  "press-pecho-maquina": "horizontal_push",
  flexiones: "horizontal_push",
  fondos: "dip",
  "press-banca-cerrado": "horizontal_push",
  "aperturas-mancuernas": "fly",
  "cruce-poleas": "fly",
  "contractor-pecho": "fly",
  "peso-muerto": "hinge",
  "peso-muerto-rumano": "hinge",
  "buenos-dias": "hinge",
  hiperextensiones: "hinge",
  "swing-kettlebell": "hinge",
  "remo-barra": "horizontal_pull",
  "remo-mancuerna": "horizontal_pull",
  "remo-polea-baja": "horizontal_pull",
  "remo-maquina": "horizontal_pull",
  "remo-banda": "horizontal_pull",
  dominadas: "vertical_pull",
  "dominadas-supinas": "vertical_pull",
  "jalon-pecho": "vertical_pull",
  "pullover-polea": "vertical_pull",
  encogimientos: "shrug",
  "press-militar": "vertical_push",
  "press-hombro-mancuernas": "vertical_push",
  "press-arnold": "vertical_push",
  "press-hombro-maquina": "vertical_push",
  "elevaciones-laterales": "lateral_raise",
  "elevaciones-laterales-polea": "lateral_raise",
  "elevaciones-laterales-maquina": "lateral_raise",
  pajaros: "rear_delt",
  "pajaros-maquina": "rear_delt",
  "face-pull": "rear_delt",
  "face-pull-banda": "rear_delt",
  "curl-barra": "elbow_flexion",
  "curl-mancuernas": "elbow_flexion",
  "curl-martillo": "elbow_flexion",
  "curl-inclinado": "elbow_flexion",
  "curl-predicador": "elbow_flexion",
  "curl-polea": "elbow_flexion",
  "curl-maquina": "elbow_flexion",
  "curl-banda": "elbow_flexion",
  "press-frances": "elbow_extension",
  "extension-triceps-polea": "elbow_extension",
  "extension-triceps-sobre-cabeza": "elbow_extension",
  "patada-triceps": "elbow_extension",
  "extension-triceps-maquina": "elbow_extension",
  "extension-triceps-banda": "elbow_extension",
  "curl-muneca": "wrist_flexion",
  sentadilla: "squat",
  "sentadilla-frontal": "squat",
  "sentadilla-goblet": "squat",
  "sentadilla-hack": "squat",
  prensa: "squat",
  zancadas: "lunge",
  "sentadilla-bulgara": "lunge",
  "extension-cuadriceps": "knee_extension",
  "curl-femoral-tumbado": "knee_flexion",
  "curl-femoral-sentado": "knee_flexion",
  "hip-thrust": "hip_extension",
  "puente-gluteo": "hip_extension",
  "patada-gluteo-polea": "hip_extension",
  "abduccion-cadera": "hip_abduction",
  "elevacion-talones-pie": "calf_raise",
  "elevacion-talones-sentado": "calf_raise",
  "crunch-polea": "trunk_flexion",
  "crunch-maquina": "trunk_flexion",
  "elevacion-piernas-colgado": "trunk_flexion",
  "rueda-abdominal": "anti_extension",
  "press-pallof": "anti_rotation",
  "cargada-potencia": "olympic",
};

const RELATED: [string, string][] = [
  ["squat", "lunge"], ["squat", "knee_extension"], ["hinge", "hip_extension"], ["horizontal_push", "dip"],
  ["horizontal_push", "fly"], ["horizontal_pull", "vertical_pull"], ["horizontal_pull", "rear_delt"],
  ["vertical_push", "lateral_raise"], ["trunk_flexion", "anti_extension"], ["anti_extension", "anti_rotation"],
];
const related = (a: string, b: string) => RELATED.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

export const EQUIPMENT_ES: Record<string, string> = {
  machine: "Máquina", cable: "Polea", dumbbell: "Mancuernas", barbell: "Barra", bodyweight: "Peso corporal", band: "Bandas", kettlebell: "Kettlebell",
};

export const MUSCLE_ES: Record<string, string> = {
  chest: "Pecho", back: "Espalda", shoulders: "Hombros", biceps: "Bíceps", triceps: "Tríceps", forearms: "Antebrazos",
  quads: "Cuádriceps", hamstrings: "Femorales", glutes: "Glúteos", calves: "Pantorrillas", core: "Abdomen", full_body: "Cuerpo completo", cardio: "Cardio",
};

export type SimilarExercise = { exercise: LibraryExercise; score: number; reasons: string[] };

/**
 * Alternatives to `from`: same primary muscle (or sharing it as a secondary),
 * scored by movement pattern, kind and secondaries; preferred equipment first.
 * Cardio swaps for cardio only.
 */
export function similarExercises(from: Pick<LibraryExercise, "id" | "muscle" | "secondary" | "kind" | "equipment">, library: LibraryExercise[], preferred: string[] = [], limit = 8): SimilarExercise[] {
  const out: SimilarExercise[] = [];
  for (const to of library) {
    if (to.id === from.id) continue;
    if ((from.kind === "cardio") !== (to.kind === "cardio")) continue;
    const reasons: string[] = [];
    let score = 0;
    if (from.kind === "cardio") {
      score = 40 + (to.secondary.some((m) => from.secondary.includes(m)) ? 10 : 0);
      reasons.push("Cardio");
    } else {
      const same = to.muscle === from.muscle;
      const shares = from.secondary.includes(String(to.muscle)) || to.secondary.includes(String(from.muscle));
      if (!same && !shares) continue;
      score = same ? 30 : 10;
      if (same) reasons.push("Mismo músculo");
      const [pa, pb] = [PATTERN[from.id], PATTERN[to.id]];
      if (pa && pa === pb) {
        score += 30;
        reasons.push("Mismo movimiento");
      } else if (pa && pb && related(pa, pb)) {
        score += 12;
        reasons.push("Movimiento parecido");
      }
      const union = new Set([...from.secondary, ...to.secondary]);
      if (union.size) score += (10 * from.secondary.filter((m) => to.secondary.includes(m)).length) / union.size;
      if (from.kind === to.kind) score += 5;
    }
    const rank = preferred.indexOf(String(to.equipment));
    if (rank >= 0) score += (15 * (preferred.length - rank)) / preferred.length;
    if (to.equipment !== from.equipment) reasons.push(EQUIPMENT_ES[String(to.equipment)] ?? String(to.equipment));
    out.push({ exercise: to, score: Math.round(score * 10) / 10, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Blocks, weeks and dated sessions
// ---------------------------------------------------------------------------

/** Under this share of a day's prescribed sets (a cardio block counts as one), a done session is "partial". */
export const PARTIAL_SHARE = 0.75;

export type SessionStatus = "done" | "partial" | "missed" | "planned" | "skipped" | "in_progress";

/** The week number (1-based, may exceed `weeks`) that `date` falls in for a block starting on `startsOn`. Weeks run Monday–Sunday. */
export function weekOf(startsOn: string, date: string): number {
  return Math.floor(daysBetween(weekStart(startsOn), date) / 7) + 1;
}

/** The block's current week, clamped to [1, weeks]. */
export function currentWeek(startsOn: string, weeks: number, today: string): number {
  return Math.max(1, Math.min(weeks, weekOf(startsOn, today)));
}

/** Monday and Sunday of a block's week `n`. */
export function weekRange(startsOn: string, n: number): { from: string; to: string } {
  const from = addDays(weekStart(startsOn), (n - 1) * 7);
  return { from, to: addDays(from, 6) };
}

/** The date a day lands on in week `n` (null when the day has no weekday). */
export function dayDate(startsOn: string, n: number, weekday: number | null): string | null {
  if (!weekday) return null;
  return addDays(weekRange(startsOn, n).from, weekday - 1);
}

/** Sets a day prescribes (a cardio block counts as one). */
export const prescribedSets = (exercises: ProgramExercise[]) => exercises.reduce((n, e) => n + (e.cardio ? 1 : Math.max(1, e.sets)), 0);

/** Rough minutes for a list: ~45 s per set plus its rest; cardio its minutes. */
export function estimateMinutes(exercises: ProgramExercise[]): number {
  let s = 0;
  for (const e of exercises) {
    if (e.cardio) s += (e.cardio.minutes ?? 20) * 60;
    else s += e.sets * (45 + (e.restSeconds ?? 90));
  }
  return Math.max(5, Math.round(s / 60 / 5) * 5);
}

/** A dated session's state today, from its row and how many sets it logged. */
export function sessionStatus(w: Pick<Workout, "status" | "local_date" | "started_at" | "ended_at">, today: string, setsLogged = 0, prescribed = 0): SessionStatus {
  if (w.status === "skipped") return "skipped";
  if (w.status === "done") return prescribed > 0 && setsLogged < prescribed * PARTIAL_SHARE ? "partial" : "done";
  if (w.started_at && !w.ended_at) return "in_progress";
  if (w.local_date && w.local_date < today) return "missed";
  return "planned";
}

/** Which (day, week) pairs a block still lacks a dated session for. */
export function missingSessions(
  program: { starts_on: string; weeks: number },
  days: Pick<ProgramDay, "id" | "weekday">[],
  existing: { program_day_id: string | null; week: number | null }[],
): { dayId: string; week: number; date: string | null }[] {
  const have = new Set(existing.filter((e) => e.program_day_id && e.week).map((e) => `${e.program_day_id}:${e.week}`));
  const out: { dayId: string; week: number; date: string | null }[] = [];
  for (let n = 1; n <= program.weeks; n++) {
    for (const d of days) if (!have.has(`${d.id}:${n}`)) out.push({ dayId: d.id, week: n, date: dayDate(program.starts_on, n, d.weekday) });
  }
  return out;
}

export const WEEKDAY_ES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const WEEKDAY_SHORT = ["", "L", "M", "X", "J", "V", "S", "D"];
export const STATUS_ES: Record<SessionStatus, string> = {
  done: "Hecha", partial: "A medias", missed: "Sin hacer", planned: "Por hacer", skipped: "Saltada", in_progress: "En curso",
};
