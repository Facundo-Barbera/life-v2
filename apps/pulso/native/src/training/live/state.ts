import type { CardioLog, CardioTarget, Equipment, Exercise, ExerciseKind, LiveSession, LoadSuggestion, ProgramDay, SessionInput } from "@/contract";
import { elapsed, totalSeconds, type CardioClock } from "../cardio";
import { nextDrop as suggestDrop, type Segment } from "../drops";
import { contains, groupOf, normalize, range, type Group } from "../superset";
import { cardioSummary, effortText, list, restClock, restWords, shortTarget, targetText } from "../text";
import { formatWeight, fromUnit, KG, snap, snapKg, stepDown, stepUp, type UnitOf, type WeightUnit } from "../units";

// The session in progress as pure values: a port of SwiftUI's
// LiveSessionState.swift. Every function here mutates the draft it is given,
// like Swift's `mutating func`; callers clone first (`produce`). Times are
// epoch ms, durations seconds. `toWire`/`fromWire` are exactly the contract's
// `LiveSession`, which is what the engine, the Coach and the Watch read.

export type LiveSet = {
  id: string;
  /** The top segment. */
  weightKg: number;
  reps: number;
  /** The reps were set by hand (or by the Coach). Until then an open set shows the range and logs its top when checked off. */
  repsChosen: boolean;
  rpe: number | null;
  /** Null until checked off. */
  doneAt: number | null;
  /** The lighter segments the load dropped to, to finish it. */
  drops: Segment[];
};

export type CutShort = { at: number; reason: string | null };

export type LiveExercise = {
  /** The `ProgramExercise.id` it came from, or a fresh id for one added today. */
  id: string;
  exerciseId: string;
  name: string;
  equipment: Equipment;
  kind: ExerciseKind;
  modality: string | null;
  repMin: number;
  repMax: number;
  targetRpe: number | null;
  targetRir: number | null;
  restSeconds: number;
  notes: string | null;
  hint: string | null;
  /** Empty for cardio. */
  sets: LiveSet[];
  cardio: CardioTarget | null;
  cardioLog: CardioLog | null;
  /** The Coach ended the block early: done, not skipped. */
  cutShort: CutShort | null;
  skipped: boolean;
  supersetId: string | null;
};

export type LiveState = {
  id: string;
  programId: string | null;
  dayId: string | null;
  /** The dated session (SessionInstance) it was started from; null for a free one or when unknown (the engine matches it). */
  instanceId: string | null;
  name: string;
  startedAt: number;
  exercises: LiveExercise[];
  /** Index of the exercise on screen. */
  focus: number;
  restStartedAt: number | null;
  restEndsAt: number | null;
  cardioClock: CardioClock | null;
  /** The engine's version this copy is based on. */
  version: number;
  updatedAt: number;
  threadId: string | null;
};

export type Library = Pick<Exercise, "id" | "name" | "equipment" | "kind"> & { modality?: string | null };

export const newId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().toLowerCase();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
};

export const newSet = (weightKg: number, reps: number, id = newId()): LiveSet => ({ id, weightKg, reps, repsChosen: false, rpe: null, doneAt: null, drops: [] });

// ── Values ───────────────────────────────────────────────────────────────────

export const isCardio = (ex: LiveExercise) => ex.kind === "cardio";
export const isDone = (set: LiveSet) => set.doneAt != null;
export const segments = (set: LiveSet): Segment[] => [{ weightKg: set.weightKg, reps: set.reps }, ...set.drops];
export const setVolume = (set: LiveSet) => segments(set).reduce((n, s) => n + s.weightKg * s.reps, 0);
export const exerciseDone = (ex: LiveExercise) => (isCardio(ex) ? ex.cardioLog != null : ex.sets.every(isDone));
/** Something was logged, so removing it would lose history. */
export const hasDoneWork = (ex: LiveExercise) => ex.cardioLog != null || ex.sets.some(isDone);
/** Neither done nor skipped: where focus moves next. */
export const pending = (ex: LiveExercise) => !ex.skipped && !exerciseDone(ex);
export const doneCount = (ex: LiveExercise) => ex.sets.filter(isDone).length;

/** What an open set with its reps not chosen shows (8–10); null once they are, or without a range. */
export const repRange = (ex: LiveExercise, set: LiveSet): [number, number] | null =>
  isDone(set) || set.repsChosen || ex.repMin >= ex.repMax ? null : [ex.repMin, ex.repMax];

/** "3 series de 6 a 8 repeticiones", or the cardio target. */
export const prescription = (ex: LiveExercise) => (isCardio(ex) ? cardioSummary(ex.cardio) : targetText(ex.sets.length, ex.repMin, ex.repMax));

/** The load of the next set to do (or the last one). */
export const workingWeight = (ex: LiveExercise) => (ex.sets.find((s) => !isDone(s)) ?? ex.sets.at(-1))?.weightKg ?? 0;

/** "4 series de 6 a 8 repeticiones con 80 kg", the load in `unit`. */
export function target(ex: LiveExercise, unit: WeightUnit = "kg"): string {
  const w = workingWeight(ex);
  if (isCardio(ex) || w <= 0) return prescription(ex);
  return `${prescription(ex)} con ${formatWeight(snapKg(w, unit), unit)}`;
}

/** "3 series de 8 a 10 · descanso 2:30". */
export function targetLine(ex: LiveExercise): string {
  const sets = shortTarget(ex.sets.length, ex.repMin, ex.repMax);
  return ex.restSeconds > 0 ? `${sets} · descanso ${restClock(ex.restSeconds)}` : sets;
}

/** "Acaba cada serie pudiendo hacer 2 más. Descansa 3 min." */
export function guidance(ex: LiveExercise): string | null {
  if (isCardio(ex)) return null;
  const parts = [effortText(ex.targetRir, ex.targetRpe), ex.restSeconds > 0 ? `Descansa ${restWords(ex.restSeconds)}` : null].filter(Boolean);
  return parts.length ? parts.join(". ") + "." : null;
}

/** "12 de 20 min" for a block ended early. */
export function cutShortAmount(ex: LiveExercise): string | null {
  if (!ex.cutShort || !ex.cardioLog) return null;
  const done = Math.round(ex.cardioLog.durationSeconds / 60);
  const total = totalSeconds(ex.cardio);
  const planned = total != null ? Math.round(total / 60) : 0;
  return planned > 0 ? `${done} de ${planned} min` : `${done} min`;
}
export const cutShortSummary = (ex: LiveExercise) => {
  const amount = cutShortAmount(ex);
  return amount ? `${ex.name} · ${amount}` : null;
};

/** The effort rated for this exercise (on its sets), 1–10. */
export function effort(ex: LiveExercise): number | null {
  const set = [...ex.sets].reverse().find((s) => isDone(s) && s.rpe != null);
  return set?.rpe != null ? Math.round(set.rpe) : null;
}

/** A new exercise from the library, its sets prefilled with `weightKg`. */
export function fresh(library: Library, weightKg: number, opts: { id?: string; sets?: number; repMin?: number; repMax?: number; restSeconds?: number } = {}): LiveExercise {
  const cardio = library.kind === "cardio";
  const { id = newId(), sets = 3, repMin = 8, repMax = 12, restSeconds = 90 } = opts;
  return {
    id,
    exerciseId: library.id,
    name: library.name,
    equipment: library.equipment,
    kind: library.kind,
    modality: library.modality ?? null,
    repMin: cardio ? 1 : repMin,
    repMax: cardio ? 1 : repMax,
    targetRpe: null,
    targetRir: null,
    restSeconds: cardio ? 0 : restSeconds,
    notes: null,
    hint: null,
    sets: cardio ? [] : Array.from({ length: Math.max(1, sets) }, () => newSet(weightKg, repMin)),
    cardio: null,
    cardioLog: null,
    cutShort: null,
    skipped: false,
    supersetId: null,
  };
}

/** Sets prefilled from the suggested load (else the hand-set one, else 0 kg). */
export function fromDay(day: ProgramDay, programId: string | null, suggestions: Record<string, LoadSuggestion>, now = Date.now(), instanceId: string | null = null): LiveState {
  const exercises = day.exercises.map((ex): LiveExercise => {
    const suggestion = suggestions[ex.id];
    const weight = suggestion?.weightKg ?? ex.weightKg ?? 0;
    const reps = suggestion?.reps ?? ex.repMin;
    const cardio = ex.kind === "cardio";
    return {
      id: ex.id,
      exerciseId: ex.exerciseId,
      name: ex.exerciseName,
      equipment: ex.equipment,
      kind: ex.kind ?? "compound",
      modality: ex.modality ?? null,
      repMin: ex.repMin,
      repMax: ex.repMax,
      targetRpe: ex.targetRpe,
      targetRir: ex.targetRir,
      restSeconds: ex.restSeconds,
      notes: ex.notes,
      hint: cardio ? null : (suggestion?.reason ?? null),
      sets: cardio ? [] : Array.from({ length: ex.sets }, () => newSet(weight, reps)),
      cardio: ex.cardio,
      cardioLog: null,
      cutShort: null,
      skipped: false,
      supersetId: ex.supersetId ?? null,
    };
  });
  return {
    id: newId(),
    programId,
    dayId: day.id,
    instanceId,
    name: day.name,
    startedAt: now,
    exercises,
    focus: 0,
    restStartedAt: null,
    restEndsAt: null,
    cardioClock: null,
    version: 0,
    updatedAt: now,
    threadId: null,
  };
}

// ── Progress ─────────────────────────────────────────────────────────────────

/** Sets of the exercises still planned, plus any done in a skipped one. */
export const setsTotal = (s: LiveState) => s.exercises.reduce((n, ex) => n + (ex.skipped ? doneCount(ex) : ex.sets.length), 0);
export const setsDone = (s: LiveState) => s.exercises.reduce((n, ex) => n + doneCount(ex), 0);
export const volumeKg = (s: LiveState) => s.exercises.flatMap((ex) => ex.sets.filter(isDone)).reduce((n, set) => n + setVolume(set), 0);
export const cardioLogs = (s: LiveState) => s.exercises.flatMap((ex) => (ex.cardioLog ? [ex.cardioLog] : []));
/** Anything worth saving. */
export const hasWork = (s: LiveState) => setsDone(s) > 0 || cardioLogs(s).length > 0;
export const allDone = (s: LiveState) => !s.exercises.some(pending);
/** Exercises passed over today with nothing logged, by name. */
export const skippedNames = (s: LiveState) => s.exercises.filter((ex) => ex.skipped && !hasDoneWork(ex)).map((ex) => ex.name);
export const focused = (s: LiveState): LiveExercise | null => s.exercises[s.focus] ?? null;

export type SetRef = { exercise: number; set: number };

/** The first strength set not yet done, in order, skipping passed-over exercises; in a superset, the member furthest behind. */
export function current(s: LiveState): SetRef | null {
  let e = 0;
  while (e < s.exercises.length) {
    const group = supersetOf(s, e);
    if (group) {
      const next = nextInSuperset(s, group);
      if (next) return next;
      e = group.end;
      continue;
    }
    const ex = s.exercises[e]!;
    const set = ex.sets.findIndex((x) => !isDone(x));
    if (!ex.skipped && set >= 0) return { exercise: e, set };
    e++;
  }
  return null;
}

// ── Supersets ────────────────────────────────────────────────────────────────

export const supersetOf = (s: LiveState, e: number) => groupOf(e, s.exercises.map((ex) => ex.supersetId));

/** The member with the fewest sets done among those with sets left; the earliest on a tie. */
export function nextInSuperset(s: LiveState, group: Group): SetRef | null {
  let best: number | null = null;
  for (const e of range(group)) {
    const ex = s.exercises[e];
    if (!ex || ex.skipped || !ex.sets.some((x) => !isDone(x))) continue;
    if (best == null || doneCount(ex) < doneCount(s.exercises[best]!)) best = e;
  }
  if (best == null) return null;
  return { exercise: best, set: s.exercises[best]!.sets.findIndex((x) => !isDone(x)) };
}

export function normalizeSupersets(s: LiveState) {
  const ids = normalize(
    s.exercises.map((ex) => ex.supersetId),
    s.exercises.map(isCardio),
  );
  s.exercises.forEach((ex, i) => (ex.supersetId = ids[i] ?? null));
}

/** What one screen shows: a superset's members together, else the exercise alone. */
export const blockOf = (s: LiveState, e: number): Group => supersetOf(s, e) ?? { start: e, end: e + 1 };

/** The screens in order. */
export function blocks(s: LiveState): Group[] {
  const out: Group[] = [];
  for (let e = 0; e < s.exercises.length; ) {
    const block = blockOf(s, e);
    out.push(block);
    e = block.end;
  }
  return out;
}

/** Rounds of a superset: as many as its longest member's sets. */
export const rounds = (s: LiveState, group: Group) => Math.max(0, ...range(group).map((e) => s.exercises[e]?.sets.length ?? 0));

const openAt = (ex: LiveExercise | undefined, r: number) => {
  const set = ex?.sets[r];
  return !!ex && !ex.skipped && !!set && !isDone(set);
};

/** The first round with a set still open among the members not skipped. */
export function currentRound(s: LiveState, group: Group): number | null {
  for (let r = 0; r < rounds(s, group); r++) if (range(group).some((e) => openAt(s.exercises[e], r))) return r;
  return null;
}

/** A round counts as done when no member not skipped has it open. */
export const roundDone = (s: LiveState, group: Group, r: number) => !range(group).some((e) => openAt(s.exercises[e], r));

/** The next exercise to do after `index`'s screen, wrapping to earlier ones left behind. */
export function nextPending(s: LiveState, index: number): number | null {
  const all = s.exercises.map((_, i) => i);
  if (index < 0 || index >= s.exercises.length) return all.find((i) => pending(s.exercises[i]!)) ?? null;
  const block = blockOf(s, index);
  const order = [...all.slice(block.end), ...all.slice(0, block.start)];
  return order.find((i) => pending(s.exercises[i]!)) ?? null;
}

export const resting = (s: LiveState, now = Date.now()) => s.restEndsAt != null && s.restEndsAt > now;

/** The rest ran out with no change saved after it: the app was gone when its timer would have moved on. */
export const restEndedWhileAway = (s: LiveState, now = Date.now()) => s.restEndsAt != null && s.restEndsAt <= now && s.restEndsAt > s.updatedAt;

// ── Sets ─────────────────────────────────────────────────────────────────────

const has = (s: LiveState, e: number, set: number) => !!s.exercises[e]?.sets[set];

/**
 * Checks a set off (starting its rest) or un-checks it. Checking also logs the
 * earlier sets left open, in order; un-checking also un-checks the later ones.
 * Checking carries the set's weight to the later sets not done yet. The load
 * logged is the one shown, on the exercise's `unit` steps.
 */
export function toggle(s: LiveState, e: number, set: number, now = Date.now(), unit: WeightUnit = "kg") {
  if (!has(s, e, set)) return;
  const ex = s.exercises[e]!;
  if (isDone(ex.sets[set]!)) {
    for (let later = set; later < ex.sets.length; later++) ex.sets[later]!.doneAt = null;
    skipRest(s);
    return;
  }
  // A millisecond apart, so the saved order is the list's order; each keeps its own load.
  const earlier = ex.sets.map((_, i) => i).filter((i) => i < set && !isDone(ex.sets[i]!));
  earlier.forEach((open, i) => check(s, e, open, now + (i - earlier.length), unit, false));
  check(s, e, set, now, unit);
  // A superset goes straight to the partner still behind; the rest comes after the round.
  const group = supersetOf(s, e);
  const next = group ? nextInSuperset(s, group) : null;
  if (next) {
    s.focus = next.exercise;
    if (doneCount(s.exercises[next.exercise]!) < doneCount(ex)) return skipRest(s);
  }
  startRest(s, e, now);
}

/** Logs set `i` as it stands and (with `carry`) its load to the later sets not done. */
function check(s: LiveState, e: number, i: number, now: number, unit: WeightUnit, carry = true) {
  const ex = s.exercises[e]!;
  const set = ex.sets[i]!;
  set.doneAt = now;
  settleReps(ex, set);
  set.weightKg = snapKg(set.weightKg, unit);
  set.drops = set.drops.map((d) => ({ weightKg: snapKg(d.weightKg, unit), reps: d.reps }));
  ex.skipped = false;
  if (!carry) return;
  ex.sets.forEach((later, k) => {
    if (k > i && !isDone(later)) later.weightKg = set.weightKg;
  });
}

/** Checked off with the reps not chosen: the top of the range. */
function settleReps(ex: LiveExercise, set: LiveSet) {
  if (set.repsChosen || ex.repMax <= 0) return;
  set.reps = ex.repMax;
}

/** "Hecho" on a superset round: the earlier rounds left open first, then round `r`, each member in order; then one rest, the last member's. */
export function completeRound(s: LiveState, group: Group, r: number, now = Date.now(), unit: (e: number) => WeightUnit = () => "kg") {
  const open: { round: number; exercise: number }[] = [];
  for (let round = 0; round <= r; round++) for (const e of range(group)) if (openAt(s.exercises[e], round)) open.push({ round, exercise: e });
  const last = open.filter((o) => o.round === r).at(-1)?.exercise;
  const first = open.findIndex((o) => o.round === r);
  if (last == null || first < 0) return;
  open.forEach((o, i) => check(s, o.exercise, o.round, now + (i - first), unit(o.exercise), o.round === r));
  const next = nextInSuperset(s, group);
  if (next) s.focus = next.exercise;
  startRest(s, last, now);
}

/** Un-checks round `r` and every later one, of every member; the rest goes too. */
export function undoRound(s: LiveState, group: Group, r: number) {
  for (const e of range(group)) s.exercises[e]?.sets.forEach((set, i) => i >= r && (set.doneAt = null));
  skipRest(s);
}

/** One more round: a set more for each member not skipped. */
export function addRound(s: LiveState, group: Group) {
  for (const e of range(group)) if (s.exercises[e] && !s.exercises[e]!.skipped) addSet(s, e);
}

/** One round less: the last set of each member that reaches the last round, when it isn't done and isn't the only one. */
export function removeRound(s: LiveState, group: Group) {
  const last = rounds(s, group);
  for (const e of range(group)) if (s.exercises[e]?.sets.length === last) removeLastSet(s, e);
}

export function canRemoveRound(s: LiveState, group: Group): boolean {
  const last = rounds(s, group);
  const members = range(group).filter((e) => s.exercises[e]?.sets.length === last);
  return members.length > 0 && members.every((e) => removableSets(s, e) > 0);
}

/** The last set, unless it is done or the exercise's only one. */
export function removeLastSet(s: LiveState, e: number) {
  const ex = s.exercises[e];
  if (!ex || ex.sets.length <= 1 || isDone(ex.sets.at(-1)!)) return;
  ex.sets.pop();
}

/** Sets that can go from the end: those not done after the last done one, keeping at least one. */
export function removableSets(s: LiveState, e: number): number {
  const sets = s.exercises[e]?.sets;
  if (!sets) return 0;
  let lastDone = -1;
  sets.forEach((set, i) => isDone(set) && (lastDone = i));
  return Math.min(sets.length - (lastDone + 1), sets.length - 1);
}

/** The superset goes back to separate exercises, each keeping every set logged. */
export function splitSuperset(s: LiveState, group: Group) {
  for (const e of range(group)) if (s.exercises[e]) s.exercises[e]!.supersetId = null;
  const ex = s.exercises[s.focus];
  if (contains(group, s.focus) && ex && exerciseDone(ex)) {
    const open = range(group).find((e) => pending(s.exercises[e]!));
    if (open != null) s.focus = open;
  }
}

/** The exercise whose set (or round) started the rest running now: the last one checked off. */
export function restingExercise(s: LiveState): number | null {
  if (s.restEndsAt == null) return null;
  let latest = -1;
  let at = -Infinity;
  s.exercises.forEach((ex, e) => {
    for (const set of ex.sets) if (set.doneAt != null && set.doneAt > at) [latest, at] = [e, set.doneAt];
  });
  if (latest < 0) return null;
  const group = supersetOf(s, latest);
  return group ? group.end - 1 : latest;
}

/** Sets the rest of the exercise resting now (today), and the running rest to it from its start. */
export function setRest(s: LiveState, seconds: number, now = Date.now()) {
  const e = restingExercise(s);
  if (e == null || s.restStartedAt == null) return;
  const ex = s.exercises[e]!;
  ex.restSeconds = Math.max(0, Math.round(seconds));
  const end = s.restStartedAt + ex.restSeconds * 1000;
  if (end > now) s.restEndsAt = end;
  else skipRest(s);
}

/** "Registrar todas": every set left as it stands, in order, with one rest after the last. */
export function completeAll(s: LiveState, e: number, now = Date.now(), unit: WeightUnit = "kg") {
  const ex = s.exercises[e];
  if (!ex) return;
  const open = ex.sets.filter((set) => !isDone(set));
  if (!open.length) return;
  open.forEach((set, i) => {
    set.doneAt = now + i;
    set.weightKg = snapKg(set.weightKg, unit);
    settleReps(ex, set);
  });
  ex.skipped = false;
  startRest(s, e, now);
}

/** The rest after a set of `e`; none once the whole session is done. */
function startRest(s: LiveState, e: number, now: number) {
  if (current(s) == null && allDone(s)) return skipRest(s);
  s.restStartedAt = now;
  s.restEndsAt = now + (s.exercises[e]?.restSeconds ?? 0) * 1000;
}

/** −/+ one step of the equipment in `unit`, stored as its exact kg. */
export function stepWeight(s: LiveState, e: number, i: number, up: boolean, unit: WeightUnit = "kg") {
  if (!has(s, e, i)) return;
  const set = s.exercises[e]!.sets[i]!;
  const value = snap(set.weightKg, unit);
  set.weightKg = fromUnit(up ? stepUp(value, unit) : stepDown(value, unit), unit);
}

/** −/+ one from the reps shown: the top of the range while it shows. */
export function adjustReps(s: LiveState, e: number, i: number, delta: number) {
  if (!has(s, e, i)) return;
  const ex = s.exercises[e]!;
  const set = ex.sets[i]!;
  const base = repRange(ex, set)?.[1] ?? set.reps;
  set.reps = Math.max(0, base + delta);
  set.repsChosen = true;
}

/** Typed in `unit`: to the quarter, never negative, kept as its exact kg. */
export function setWeight(s: LiveState, e: number, i: number, value: number, unit: WeightUnit = "kg") {
  if (!has(s, e, i)) return;
  s.exercises[e]!.sets[i]!.weightKg = fromUnit(Math.max(0, Math.round(value * 4) / 4), unit);
}

/** The exercise's unit changed: its open sets move onto the new unit's steps; done ones keep what was lifted. */
export function snapOpenSets(s: LiveState, e: number, unit: WeightUnit) {
  for (const set of s.exercises[e]?.sets ?? []) if (!isDone(set)) set.weightKg = snapKg(set.weightKg, unit);
}

export function setReps(s: LiveState, e: number, i: number, reps: number) {
  if (!has(s, e, i)) return;
  const set = s.exercises[e]!.sets[i]!;
  set.reps = Math.max(0, Math.round(reps));
  set.repsChosen = true;
}

/** The effort felt on the whole exercise, 1–10 (null clears), kept on each done set. */
export function setEffort(s: LiveState, e: number, value: number | null) {
  for (const set of s.exercises[e]?.sets ?? []) if (isDone(set)) set.rpe = value == null ? null : Math.min(10, Math.max(1, value));
}

/** One more set, copying the last one's load and reps (or the target's bottom). */
export function addSet(s: LiveState, e: number) {
  const ex = s.exercises[e];
  if (!ex || isCardio(ex)) return;
  const last = ex.sets.at(-1);
  ex.sets.push(newSet(last?.weightKg ?? 0, last?.reps ?? ex.repMin));
  ex.skipped = false;
}

/** Only a set not done yet: un-check it first to drop a logged one. */
export function removeSet(s: LiveState, e: number, i: number) {
  if (!has(s, e, i) || isDone(s.exercises[e]!.sets[i]!)) return;
  s.exercises[e]!.sets.splice(i, 1);
}

/** Where the set with `id` is. */
export function locate(s: LiveState, id: string): SetRef | null {
  for (let e = 0; e < s.exercises.length; e++) {
    const set = s.exercises[e]!.sets.findIndex((x) => x.id === id);
    if (set >= 0) return { exercise: e, set };
  }
  return null;
}

// ── Drops ────────────────────────────────────────────────────────────────────

/** One more segment, on the unit's steps. One added to the set just done, while resting, restarts the rest. */
export function addDrop(s: LiveState, e: number, i: number, drop: Segment, now = Date.now(), unit: WeightUnit = "kg") {
  if (!has(s, e, i) || isCardio(s.exercises[e]!)) return;
  const set = s.exercises[e]!.sets[i]!;
  set.drops.push({ weightKg: snapKg(Math.max(0, drop.weightKg), unit), reps: Math.max(0, drop.reps) });
  if (set.doneAt == null || !resting(s, now)) return;
  const latest = Math.max(...s.exercises.flatMap((ex) => ex.sets.map((x) => x.doneAt ?? -Infinity)));
  if (set.doneAt === latest) startRest(s, e, now);
}

/** The suggested next segment for a set: about 15 % lighter, for the reps still missing. */
export function nextDrop(s: LiveState, e: number, i: number, unit: WeightUnit = "kg"): Segment | null {
  if (!has(s, e, i)) return null;
  const set = s.exercises[e]!.sets[i]!;
  return suggestDrop({ weightKg: set.weightKg, reps: set.reps }, set.drops, s.exercises[e]!.repMin, unit);
}

const dropAt = (s: LiveState, e: number, i: number, d: number) => s.exercises[e]?.sets[i]?.drops[d];

export function removeDrop(s: LiveState, e: number, i: number, d: number) {
  if (dropAt(s, e, i, d)) s.exercises[e]!.sets[i]!.drops.splice(d, 1);
}

export function stepDropWeight(s: LiveState, e: number, i: number, d: number, up: boolean, unit: WeightUnit = "kg") {
  const seg = dropAt(s, e, i, d);
  if (!seg) return;
  const value = snap(seg.weightKg, unit);
  seg.weightKg = fromUnit(up ? stepUp(value, unit) : stepDown(value, unit), unit);
}

export function setDropWeight(s: LiveState, e: number, i: number, d: number, value: number, unit: WeightUnit = "kg") {
  const seg = dropAt(s, e, i, d);
  if (seg) seg.weightKg = fromUnit(Math.max(0, Math.round(value * 4) / 4), unit);
}

/** A drop keeps at least one rep: to get rid of it, remove it. */
export function setDropReps(s: LiveState, e: number, i: number, d: number, reps: number) {
  const seg = dropAt(s, e, i, d);
  if (seg) seg.reps = Math.max(1, Math.round(reps));
}

// ── Rest and focus ───────────────────────────────────────────────────────────

/** +15 s or −15 s. Cut to nothing, the rest ends. */
export function extendRest(s: LiveState, seconds: number, now = Date.now()) {
  if (s.restEndsAt == null || s.restEndsAt <= now) return;
  const next = s.restEndsAt + seconds * 1000;
  if (next > now) s.restEndsAt = next;
  else skipRest(s);
}

export function skipRest(s: LiveState) {
  s.restStartedAt = null;
  s.restEndsAt = null;
}

export function setFocus(s: LiveState, index: number) {
  s.focus = s.exercises.length ? Math.min(Math.max(index, 0), s.exercises.length - 1) : 0;
}

/** After the focused exercise (all of its superset) is finished or skipped, moves on to the next one still to do. */
export function advanceIfDone(s: LiveState): boolean {
  if (!focused(s)) return false;
  if (range(blockOf(s, s.focus)).some((e) => pending(s.exercises[e]!))) return false;
  const next = nextPending(s, s.focus);
  if (next == null) return false;
  s.focus = next;
  return true;
}

// ── Editing (solo hoy) ───────────────────────────────────────────────────────

/** Moves the exercises at `source` to before the row now at `destination` (SwiftUI's onMove); the exercise on screen stays on screen. */
export function move(s: LiveState, source: number[], destination: number) {
  const focusedId = focused(s)?.id;
  const moving = source.filter((i) => i >= 0 && i < s.exercises.length).map((i) => s.exercises[i]!);
  const kept = s.exercises.filter((_, i) => !source.includes(i));
  const at = Math.min(kept.length, Math.max(0, destination - source.filter((i) => i < destination).length));
  kept.splice(at, 0, ...moving);
  s.exercises = kept;
  normalizeSupersets(s);
  const index = s.exercises.findIndex((ex) => ex.id === focusedId);
  if (index >= 0) s.focus = index;
}

/** Appends an exercise and returns its index. */
export function add(s: LiveState, library: Library, weightKg: number): number {
  s.exercises.push(fresh(library, weightKg));
  return s.exercises.length - 1;
}

/** Only an exercise with nothing logged; skip the others. */
export function remove(s: LiveState, index: number) {
  const ex = s.exercises[index];
  if (!ex || hasDoneWork(ex)) return;
  const focusedId = focused(s)?.id;
  s.exercises.splice(index, 1);
  normalizeSupersets(s);
  const kept = s.exercises.findIndex((x) => x.id === focusedId);
  if (kept >= 0) s.focus = kept;
  else setFocus(s, Math.min(index, s.exercises.length - 1));
  stopWhatEnded(s);
}

/** Skipping the exercise on screen moves on to the next one; a skipped block's clock stops. */
export function setSkipped(s: LiveState, index: number, skipped: boolean) {
  const ex = s.exercises[index];
  if (!ex) return;
  ex.skipped = skipped;
  if (skipped && index === s.focus) advanceIfDone(s);
  stopWhatEnded(s);
}

/** After a skip, removal, swap or log: a clock only times a cardio block still to do, and a rest only runs while something is left. */
export function stopWhatEnded(s: LiveState) {
  const clock = s.cardioClock;
  if (clock && !s.exercises.some((ex) => ex.id === clock.exerciseId && isCardio(ex) && !ex.skipped && ex.cardioLog == null)) s.cardioClock = null;
  if (s.restEndsAt != null && current(s) == null && allDone(s)) skipRest(s);
}

export type TargetEdit = { sets: number; repMin: number; repMax: number; weightKg: number | null; restSeconds: number };

/** New targets for today. Set count can't drop below the sets done; the load and rep range apply to the sets not done yet. */
export function updateTarget(s: LiveState, index: number, t: TargetEdit) {
  const ex = s.exercises[index];
  if (!ex) return;
  ex.repMin = Math.max(1, t.repMin);
  ex.repMax = Math.max(ex.repMin, t.repMax);
  ex.restSeconds = Math.max(0, t.restSeconds);
  const clampReps = (r: number) => Math.min(Math.max(r, ex.repMin), ex.repMax);
  for (const set of ex.sets) {
    if (isDone(set)) continue;
    if (t.weightKg != null) set.weightKg = Math.max(0, t.weightKg);
    set.reps = clampReps(set.reps);
  }
  if (isCardio(ex)) return;
  const want = Math.max(t.sets, doneCount(ex), 1);
  while (ex.sets.length < want) {
    const last = [...ex.sets].reverse().find((x) => !isDone(x)) ?? ex.sets.at(-1);
    ex.sets.push(newSet(t.weightKg ?? last?.weightKg ?? 0, last ? clampReps(last.reps) : ex.repMin));
  }
  while (ex.sets.length > want) {
    let last = -1;
    ex.sets.forEach((x, i) => !isDone(x) && (last = i));
    if (last < 0) break;
    ex.sets.splice(last, 1);
  }
}

/**
 * "Cambiar ejercicio". With nothing logged it is replaced in place (keeping its
 * id and targets); otherwise the logged sets stay with the exercise performed and
 * the new one goes right after it with the sets left. Returns the new one's index, which gets focus.
 */
export function swap(s: LiveState, index: number, library: Library, weightKg: number): number {
  const old = s.exercises[index];
  if (!old) return s.focus;
  // Another machine: the old one's stopwatch doesn't carry over.
  if (s.cardioClock?.exerciseId === old.id) s.cardioClock = null;
  const left = old.sets.filter((x) => !isDone(x));
  const reps = left[0]?.reps ?? old.repMin;
  const next: LiveExercise = {
    ...clone(old),
    exerciseId: library.id,
    name: library.name,
    equipment: library.equipment,
    kind: library.kind,
    modality: library.modality ?? null,
    hint: null,
    notes: null,
    cardioLog: null,
    skipped: false,
  };
  if (library.kind === "cardio") {
    next.sets = [];
    next.cardio = isCardio(old) ? old.cardio : null;
    next.restSeconds = 0;
  } else {
    const count = isCardio(old) ? 3 : Math.max(1, hasDoneWork(old) ? left.length : old.sets.length);
    if (isCardio(old)) {
      next.repMin = 8;
      next.repMax = 12;
      next.restSeconds = 90;
      next.cardio = null;
    }
    next.sets = Array.from({ length: count }, () => newSet(weightKg, isCardio(old) ? next.repMin : reps));
  }
  if (!hasDoneWork(old)) {
    s.exercises[index] = next;
    s.focus = index;
    return index;
  }
  old.sets = old.sets.filter(isDone);
  next.id = newId();
  s.exercises.splice(index + 1, 0, next);
  s.focus = index + 1;
  return index + 1;
}

// ── Cardio ───────────────────────────────────────────────────────────────────

export function sanitizeLog(log: CardioLog): CardioLog {
  const reading = (v: number | null | undefined, min: number, max: number) => (v != null && Number.isFinite(v) && v >= min && v <= max ? v : null);
  return {
    exerciseId: log.exerciseId,
    durationSeconds: Number.isFinite(log.durationSeconds) ? Math.max(0, log.durationSeconds) : 0,
    distanceKm: reading(log.distanceKm, 0, 500),
    level: reading(log.level, 0, 100),
    inclinePercent: reading(log.inclinePercent, 0, 50),
    avgHr: reading(log.avgHr, 20, 250),
    kcal: reading(log.kcal, 0, 10_000),
    doneAt: log.doneAt,
  };
}

/** Logs a block and stops its clock. */
export function logCardio(s: LiveState, index: number, log: CardioLog) {
  const ex = s.exercises[index];
  if (!ex || !isCardio(ex)) return;
  ex.cardioLog = sanitizeLog(log);
  ex.skipped = false;
  stopWhatEnded(s);
}

export function clearCardioLog(s: LiveState, index: number) {
  const ex = s.exercises[index];
  if (ex) ex.cardioLog = null;
}

/** The exercise whose cardio clock is running, if any. */
export function runningCardio(s: LiveState): LiveExercise | null {
  const clock = s.cardioClock;
  if (!clock || clock.runningSince == null) return null;
  return s.exercises.find((ex) => ex.id === clock.exerciseId) ?? null;
}

// ── Merging the engine's copy ────────────────────────────────────────────────

/**
 * The engine's copy, keeping what this phone logged that it doesn't have yet:
 * checked sets, drops, cardio logs, the clock, the rest timer and the exercise on
 * screen. `keptLocal`: the result differs from `remote`, so it must be pushed back.
 */
export function merge(remote: LiveState, local: LiveState): { state: LiveState; keptLocal: boolean } {
  const merged = clone(remote);
  let kept = false;
  const localExercises = new Map(local.exercises.map((ex) => [ex.id, ex] as const));
  const localSets = new Map(local.exercises.flatMap((ex) => ex.sets.map((set) => [set.id, set] as const)));
  for (const ex of merged.exercises) {
    ex.sets = ex.sets.map((set) => {
      const mine = localSets.get(set.id);
      if (set.doneAt == null && mine && isDone(mine)) {
        kept = true;
        return clone(mine);
      }
      if (!set.drops.length && mine?.drops.length) {
        // A drop logged here that the engine's copy doesn't have yet.
        kept = true;
        return { ...set, drops: clone(mine.drops) };
      }
      return set;
    });
    const log = localExercises.get(ex.id)?.cardioLog;
    if (ex.cardioLog == null && log) {
      ex.cardioLog = clone(log);
      kept = true;
    }
  }
  // The Coach ended a block early: done, timed up to then by this phone's clock
  // when it was timing it (more precise than the synced copy), else by the synced one, keeping what was typed.
  for (const ex of merged.exercises) {
    if (!ex.cutShort) continue;
    const before = clone(ex);
    const mine = local.cardioClock?.exerciseId === ex.id ? local.cardioClock : null;
    const synced = remote.cardioClock?.exerciseId === ex.id ? remote.cardioClock : null;
    ex.skipped = false;
    if (mine == null && ex.cardioLog != null) continue;
    const typed = localExercises.get(ex.id)?.cardioLog ?? ex.cardioLog;
    const clock = mine ?? synced;
    ex.cardioLog = {
      exerciseId: ex.exerciseId,
      durationSeconds: Math.round(clock ? elapsed(clock, ex.cutShort.at) : 0),
      distanceKm: typed?.distanceKm ?? null,
      level: typed?.level ?? null,
      inclinePercent: typed?.inclinePercent ?? null,
      avgHr: typed?.avgHr ?? null,
      kcal: typed?.kcal ?? null,
      doneAt: Math.round(ex.cutShort.at),
    };
    if (!equal(ex, before)) kept = true;
  }
  merged.cardioClock = clone(local.cardioClock);
  merged.restStartedAt = local.restStartedAt;
  merged.restEndsAt = local.restEndsAt;
  const focusedId = focused(local)?.id;
  const index = focusedId == null ? -1 : merged.exercises.findIndex((ex) => ex.id === focusedId);
  if (index >= 0) merged.focus = index;
  else setFocus(merged, remote.focus);
  // Skipped from elsewhere (the Coach) while on screen: move on to one still to do.
  if (focused(merged)?.skipped && !focused(local)?.skipped) advanceIfDone(merged);
  stopWhatEnded(merged);
  if (!equal(merged.cardioClock, remote.cardioClock)) kept = true;
  return { state: merged, keptLocal: kept };
}

/** "Deshacer" after the Coach's change: the exercises as they were, keeping what was logged since; a block it ended early runs on. */
export function undoingCoach(before: LiveState, current: LiveState): LiveState {
  const restored = merge(before, current).state;
  const clock = before.cardioClock;
  if (clock && current.exercises.find((ex) => ex.id === clock.exerciseId)?.cutShort) {
    const ex = restored.exercises.find((x) => x.id === clock.exerciseId);
    if (ex) {
      ex.cardioLog = null;
      ex.cutShort = null;
      restored.cardioClock = clone(clock);
    }
  }
  return restored;
}

/** "El Coach saltó Remo en máquina", "… saltó Remo y Curl", "… saltó Remo, Curl y 2 más". */
export function coachSummary(before: LiveState, after: LiveState): string {
  const was = new Set(before.exercises.filter((ex) => ex.skipped).map((ex) => ex.id));
  const names = after.exercises.filter((ex) => ex.skipped && !was.has(ex.id)).map((ex) => ex.name);
  if (names.length === 0) return "La sesión cambió en otro dispositivo";
  if (names.length <= 2) return `Se saltó ${list(names)} en otro dispositivo`;
  return `Se saltó ${names[0]}, ${names[1]} y ${names.length - 2} más en otro dispositivo`;
}

// ── Output ───────────────────────────────────────────────────────────────────

const finite = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);

/** What the engine stores: done sets only, numbered per exercise in the order done, and the cardio blocks in session order. */
export function finishedSession(s: LiveState, endedAt: number): SessionInput & { cardio: CardioLog[] } {
  const done = s.exercises
    .flatMap((ex) => ex.sets.filter(isDone).map((set) => ({ exerciseId: ex.exerciseId, set })))
    .sort((a, b) => a.set.doneAt! - b.set.doneAt!);
  const counts = new Map<string, number>();
  const sets = done.map(({ exerciseId, set }) => {
    const index = counts.get(exerciseId) ?? 0;
    counts.set(exerciseId, index + 1);
    return {
      exerciseId,
      setIndex: index,
      weightKg: finite(set.weightKg),
      reps: Math.max(0, set.reps),
      rpe: set.rpe != null && Number.isFinite(set.rpe) ? set.rpe : null,
      doneAt: Math.round(set.doneAt!),
      segments: segments(set).map((seg) => ({ weightKg: finite(seg.weightKg), reps: Math.max(0, seg.reps) })),
    };
  });
  return {
    id: s.id,
    programId: s.programId,
    dayId: s.dayId,
    instanceId: s.instanceId ?? null,
    name: s.name,
    startedAt: Math.round(s.startedAt),
    endedAt: Math.round(endedAt),
    notes: null,
    sets,
    cardio: cardioLogs(s).map(sanitizeLog),
  };
}

// ── The contract's JSON ──────────────────────────────────────────────────────

type WireSet = LiveSession["exercises"][number]["sets"][number];

export const setToWire = (set: LiveSet): WireSet => ({
  id: set.id,
  weightKg: finite(set.weightKg),
  reps: set.reps,
  repsChosen: set.repsChosen,
  rpe: set.rpe != null && Number.isFinite(set.rpe) ? set.rpe : null,
  doneAt: set.doneAt != null ? Math.round(set.doneAt) : null,
  segments: segments(set).map((seg) => ({ weightKg: finite(seg.weightKg), reps: Math.max(0, seg.reps) })),
});

export const setFromWire = (set: { id: string; weightKg: number; reps: number; repsChosen?: boolean | null; rpe?: number | null; doneAt?: number | null; segments?: Segment[] | null }): LiveSet => ({
  id: set.id,
  weightKg: set.weightKg,
  reps: set.reps,
  repsChosen: set.repsChosen ?? false,
  rpe: set.rpe ?? null,
  doneAt: set.doneAt ?? null,
  // `segments[0]` is the top, which weightKg/reps already are (and win over).
  drops: (set.segments ?? []).slice(1).filter((seg) => seg.reps > 0).map(({ weightKg, reps }) => ({ weightKg, reps })),
});

/** Exactly the contract's `LiveSession`: explicit nulls, segments with the top first. */
export function toWire(s: LiveState): LiveSession {
  return {
    id: s.id,
    programId: s.programId,
    dayId: s.dayId,
    instanceId: s.instanceId ?? null,
    name: s.name,
    startedAt: Math.round(s.startedAt),
    exercises: s.exercises.map((ex) => ({
      id: ex.id,
      exerciseId: ex.exerciseId,
      name: ex.name,
      equipment: ex.equipment,
      kind: ex.kind,
      modality: (ex.modality ?? null) as LiveSession["exercises"][number]["modality"],
      repMin: ex.repMin,
      repMax: ex.repMax,
      targetRpe: ex.targetRpe,
      targetRir: ex.targetRir,
      restSeconds: ex.restSeconds,
      notes: ex.notes,
      hint: ex.hint,
      sets: ex.sets.map(setToWire),
      cardio: ex.cardio,
      cardioLog: ex.cardioLog ? sanitizeLog(ex.cardioLog) : null,
      cutShort: ex.cutShort ? { at: Math.round(ex.cutShort.at), reason: ex.cutShort.reason } : null,
      skipped: ex.skipped,
      supersetId: ex.supersetId,
    })),
    focus: s.focus,
    restStartedAt: s.restStartedAt != null ? Math.round(s.restStartedAt) : null,
    restEndsAt: s.restEndsAt != null ? Math.round(s.restEndsAt) : null,
    cardioClock: s.cardioClock
      ? { exerciseId: s.cardioClock.exerciseId, runningSince: s.cardioClock.runningSince != null ? Math.round(s.cardioClock.runningSince) : null, accumulatedSeconds: s.cardioClock.accumulated }
      : null,
    version: s.version,
    updatedAt: Math.round(s.updatedAt),
    threadId: s.threadId,
  };
}

/** The contract's `LiveSession` (the engine's or the Watch's copy), lenient about keys an older copy left out. */
export function fromWire(w: LiveSession): LiveState {
  const s: LiveState = {
    id: w.id,
    programId: w.programId ?? null,
    dayId: w.dayId ?? null,
    instanceId: w.instanceId ?? null,
    name: w.name,
    startedAt: w.startedAt,
    exercises: w.exercises.map((ex) => ({
      id: ex.id,
      exerciseId: ex.exerciseId,
      name: ex.name,
      equipment: ex.equipment,
      kind: ex.kind,
      modality: ex.modality ?? null,
      repMin: ex.repMin,
      repMax: ex.repMax,
      targetRpe: ex.targetRpe ?? null,
      targetRir: ex.targetRir ?? null,
      restSeconds: ex.restSeconds,
      notes: ex.notes ?? null,
      hint: ex.hint ?? null,
      sets: (ex.sets ?? []).map(setFromWire),
      cardio: ex.cardio ?? null,
      cardioLog: ex.cardioLog ? sanitizeLog(ex.cardioLog) : null,
      cutShort: ex.cutShort ? { at: ex.cutShort.at, reason: ex.cutShort.reason ?? null } : null,
      skipped: ex.skipped ?? false,
      supersetId: ex.supersetId ?? null,
    })),
    focus: w.focus ?? 0,
    restStartedAt: w.restStartedAt ?? null,
    restEndsAt: w.restEndsAt ?? null,
    cardioClock: w.cardioClock ? { exerciseId: w.cardioClock.exerciseId, runningSince: w.cardioClock.runningSince ?? null, accumulated: w.cardioClock.accumulatedSeconds ?? 0 } : null,
    version: w.version ?? 0,
    updatedAt: w.updatedAt ?? w.startedAt,
    threadId: w.threadId ?? null,
  };
  setFocus(s, s.focus);
  return s;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const clone = <T>(value: T): T => (value == null ? value : (JSON.parse(JSON.stringify(value)) as T));

/** Deep equality of plain JSON-like values (undefined and null are the same). */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((v, i) => equal(v, other[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if (!equal(x[k], y[k])) return false;
  return true;
}

/** A copy with `change` applied, like a Swift `mutating func` on a value. */
export function produce(s: LiveState, change: (draft: LiveState) => void): LiveState {
  const draft = clone(s);
  change(draft);
  return draft;
}

/** The unit per exercise index, for the round helpers. */
export const unitByIndex = (s: LiveState, unitOf: UnitOf = KG) => (e: number) => unitOf(s.exercises[e]?.exerciseId ?? "");
