import type { CardioLog } from "@/contract";
import type { WatchEdit as WireEdit, WorkoutStage } from "pulso-watch";
import type { CardioClock } from "../cardio";
import type { WeightUnit } from "../units";
import { equal, focused, fromWire, isCardio, runningCardio, sanitizeLog, setFromWire, type LiveSet, type LiveState } from "./state";

// The session kept the same on the phone and the Watch (WatchShared's
// SessionSync.swift): what the Watch changes travels as one edit per set, rest
// or cardio block, stamped with when it happened; the phone applies each unless
// it changed the same thing later (the latest wins, equal values never clash).

export type Change =
  | { kind: "set"; exerciseId: string; set: LiveSet }
  | { kind: "rest"; startedAt: number | null; endsAt: number | null }
  | { kind: "cardio"; exerciseId: string; clock: CardioClock | null; log: CardioLog | null }
  | { kind: "finish"; save: boolean }
  | { kind: "start"; state: LiveState }
  | { kind: "unit"; exerciseId: string; unit: WeightUnit };

/** A Watch edit with this app's values (epoch ms, the internal session). */
export type Edit = { id: string; sessionId: string; at: number; change: Change };

/** What two edits must share to be about the same thing. */
export function changeKey(change: Change): string {
  switch (change.kind) {
    case "set":
      return `set:${change.set.id}`;
    case "cardio":
      return `cardio:${change.exerciseId}`;
    case "unit":
      return `unit:${change.exerciseId}`;
    default:
      return change.kind;
  }
}

/** Whether an edit made at `at` goes over a local change made at `stamp`: the latest wins. */
export const wins = (at: number, stamp: number | undefined) => stamp == null || stamp <= at;

/** What changed from `old` to `next`, set by set. Structure (exercises added, removed, reordered) is the phone's alone and isn't listed. */
export function changes(old: LiveState, next: LiveState): Change[] {
  const out: Change[] = [];
  const before = new Map(old.exercises.flatMap((ex) => ex.sets.map((set) => [set.id, set] as const)));
  for (const ex of next.exercises) for (const set of ex.sets) if (!equal(before.get(set.id), set)) out.push({ kind: "set", exerciseId: ex.id, set });
  if (old.restStartedAt !== next.restStartedAt || old.restEndsAt !== next.restEndsAt) out.push({ kind: "rest", startedAt: next.restStartedAt, endsAt: next.restEndsAt });
  for (const ex of next.exercises) {
    if (!isCardio(ex)) continue;
    const was = old.exercises.find((x) => x.id === ex.id);
    const clockBefore = old.cardioClock?.exerciseId === ex.id ? old.cardioClock : null;
    const clockNow = next.cardioClock?.exerciseId === ex.id ? next.cardioClock : null;
    if (!equal(was?.cardioLog, ex.cardioLog) || !equal(clockBefore, clockNow)) out.push({ kind: "cardio", exerciseId: ex.id, clock: clockNow, log: ex.cardioLog });
  }
  return out;
}

/** Applies one of the Watch's changes to the draft; false when it names something the session no longer has. */
export function apply(s: LiveState, change: Change): boolean {
  switch (change.kind) {
    case "set": {
      const ex = s.exercises.find((x) => x.id === change.exerciseId);
      const index = ex?.sets.findIndex((x) => x.id === change.set.id) ?? -1;
      if (!ex || index < 0) return false;
      ex.sets[index] = { ...change.set, drops: change.set.drops.map((d) => ({ ...d })) };
      if (change.set.doneAt != null) ex.skipped = false;
      return true;
    }
    case "rest":
      s.restStartedAt = change.startedAt;
      s.restEndsAt = change.endsAt;
      return true;
    case "cardio": {
      const ex = s.exercises.find((x) => x.id === change.exerciseId);
      if (!ex) return false;
      ex.cardioLog = change.log;
      if (change.clock) s.cardioClock = { ...change.clock };
      else if (s.cardioClock?.exerciseId === change.exerciseId) s.cardioClock = null;
      return true;
    }
    default:
      return false;
  }
}

/** A Watch edit as decoded from Swift's JSON (pulso-watch), in this app's values. */
export function fromWireEdit(edit: WireEdit): Edit {
  const c = edit.change;
  let change: Change;
  if ("set" in c) change = { kind: "set", exerciseId: c.set.exerciseId, set: setFromWire(c.set.set) };
  else if ("rest" in c) change = { kind: "rest", startedAt: c.rest.startedAt?.getTime() ?? null, endsAt: c.rest.endsAt?.getTime() ?? null };
  else if ("cardio" in c) {
    const clock = c.cardio.clock;
    change = {
      kind: "cardio",
      exerciseId: c.cardio.exerciseId,
      clock: clock ? { exerciseId: clock.exerciseId, runningSince: clock.runningSince?.getTime() ?? null, accumulated: clock.accumulated } : null,
      log: c.cardio.log ? sanitizeLog({ ...c.cardio.log, distanceKm: c.cardio.log.distanceKm ?? null, level: c.cardio.log.level ?? null, inclinePercent: c.cardio.log.inclinePercent ?? null, avgHr: c.cardio.log.avgHr ?? null, kcal: c.cardio.log.kcal ?? null }) : null,
    };
  } else if ("finish" in c) change = { kind: "finish", save: c.finish.save };
  else if ("start" in c) change = { kind: "start", state: fromWire(c.start._0) };
  else change = { kind: "unit", exerciseId: c.unit.exerciseId, unit: c.unit.unit };
  return { id: edit.id, sessionId: edit.sessionId, at: edit.at.getTime(), change };
}

// ── The one workout per session ──────────────────────────────────────────────

/** HKWorkoutActivityType raw values the session uses. */
export const HK = {
  cycling: 13,
  elliptical: 16,
  rowing: 35,
  running: 37,
  stairClimbing: 44,
  traditionalStrengthTraining: 50,
  walking: 52,
  highIntensityIntervalTraining: 63,
  jumpRope: 64,
  mixedCardio: 73,
} as const;

export const STRENGTH_STAGE: WorkoutStage = { activity: HK.traditionalStrengthTraining, indoor: true };
/** From here up a treadmill target is a run. */
export const RUNNING_KMH = 7.5;

/** A cardio block's kind (WorkoutStage.cardio): on the treadmill, a walk unless the target is a running pace. */
export function cardioStage(modality: string | null | undefined, speedKmh: number | null | undefined): WorkoutStage {
  switch (modality) {
    case "treadmill":
      return { activity: (speedKmh ?? 0) >= RUNNING_KMH ? HK.running : HK.walking, indoor: true };
    case "elliptical":
      return { activity: HK.elliptical, indoor: true };
    case "bike":
      return { activity: HK.cycling, indoor: true };
    case "rower":
      return { activity: HK.rowing, indoor: true };
    case "stairs":
      return { activity: HK.stairClimbing, indoor: true };
    case "run":
      return { activity: HK.running, indoor: false };
    case "walk":
      return { activity: HK.walking, indoor: false };
    case "jump_rope":
      return { activity: HK.jumpRope, indoor: true };
    case "hiit":
      return { activity: HK.highIntensityIntervalTraining, indoor: true };
    default:
      return { activity: HK.mixedCardio, indoor: true };
  }
}

export type Recording = { stage: WorkoutStage; paused: boolean; stageSince: number | null };

/**
 * What the session's one workout records now, the same on the phone and the
 * Watch: the cardio block on its clock, paused with it while it's still the block
 * in focus (moving on to a set resumes the recording as strength), else strength.
 * `stageSince` is when the running block's clock started.
 */
export function recording(s: LiveState): Recording {
  const block = runningCardio(s);
  if (block) return { stage: cardioStage(block.modality, block.cardio?.speedKmh), paused: false, stageSince: s.cardioClock?.runningSince ?? null };
  const clock = s.cardioClock;
  const ex = focused(s);
  if (clock && clock.accumulated > 0 && ex && ex.id === clock.exerciseId && isCardio(ex) && ex.cardioLog == null) {
    return { stage: cardioStage(ex.modality, ex.cardio?.speedKmh), paused: true, stageSince: null };
  }
  return { stage: STRENGTH_STAGE, paused: false, stageSince: null };
}
