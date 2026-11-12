import type { HrZoneRange } from "@/contract";
import type { ActivityContentState } from "pulso-watch";
import { cardioStatus, type CardioStatus } from "../cardio";
import { dropsText } from "../drops";
import { cardioSummary, loadText } from "../text";
import { formatWeight, KG, snapKg, type UnitOf } from "../units";
import { current, focused, isCardio, resting, setsDone, setsTotal, type LiveState } from "./state";

// The Live Activity's view of the session (SwiftUI's LiveSessionActivity.swift
// + LiveSession.activityState): what TrainingActivityAttributes.ContentState
// shows on the lock screen and in the Dynamic Island.

/** The lock screen: the cardio block `cardio` names when given, else the next set. */
export function activityState(s: LiveState, opts: { now?: number; cardio?: { index: number; status: CardioStatus }; unit?: UnitOf } = {}): ActivityContentState {
  const { now = Date.now(), cardio, unit = KG } = opts;
  const counts = { setsDone: setsDone(s), setsTotal: setsTotal(s) };
  const block = cardio ? s.exercises[cardio.index] : undefined;
  if (cardio && block) {
    return { exerciseName: block.name, setLabel: cardio.status.detail, target: block.cardio ? cardioSummary(block.cardio) : "", ...counts, cardio: cardio.status };
  }
  const next = current(s);
  if (!next) return { exerciseName: "Sesión completa", setLabel: "Todas las series hechas", target: "", ...counts };
  const ex = s.exercises[next.exercise]!;
  const set = ex.sets[next.set]!;
  const weightUnit = unit(ex.exerciseId);
  const kg = snapKg(set.weightKg, weightUnit);
  // A set planned with a drop: the top segment now, the lighter one after it.
  const drops = set.drops.length ? ` → ${dropsText(set.drops, weightUnit)}` : "";
  const isResting = resting(s, now);
  return {
    exerciseName: ex.name,
    setLabel: `Serie ${next.set + 1} de ${ex.sets.length}`,
    target: loadText(kg, set.reps, weightUnit) + drops,
    ...counts,
    restStartedAt: isResting && s.restStartedAt != null ? new Date(s.restStartedAt) : null,
    restEndsAt: isResting && s.restEndsAt != null ? new Date(s.restEndsAt) : null,
    weight: kg > 0 ? formatWeight(kg, weightUnit) : null,
  };
}

/** The cardio block the lock screen shows: the one on the clock, else the one on screen still to do. */
export function cardioIndex(s: LiveState): number | null {
  const clock = s.cardioClock;
  if (clock) {
    const index = s.exercises.findIndex((ex) => ex.id === clock.exerciseId);
    if (index >= 0) return index;
  }
  const ex = focused(s);
  return ex && isCardio(ex) && ex.cardioLog == null ? s.focus : null;
}

/** The session's Live Activity state with its cardio block, as the controller drives it. */
export function liveActivityState(s: LiveState, zones: HrZoneRange[] | null | undefined, unit: UnitOf = KG, now = Date.now()): ActivityContentState {
  const index = cardioIndex(s);
  const cardio = index != null ? { index, status: cardioStatus(s.exercises[index]!, s.cardioClock, zones, now) } : undefined;
  return activityState(s, { now, cardio, unit });
}

/** Whether a Live Activity was started for `s` (ActivityKit's copy of the date may round). */
export const isActivityOf = (startedAt: Date, s: LiveState) => Math.abs(startedAt.getTime() - s.startedAt) < 1000;
