import type { CardioLog, SessionInput } from "@/contract";
import { isHealthDataAvailable, saveWorkoutSample, type QuantityTypeIdentifierWriteable as QuantityTypeIdentifier } from "@kingstinct/react-native-healthkit";
import { cardioStage } from "@/training/live/sync";
import { askHealth } from "./access";

// A finished session into Salud when nothing recorded it live (no Watch, the
// phone didn't either): the SwiftUI app's StrengthWorkout.save / saveCardio.
// The strength part is one traditional strength workout over the session; each
// cardio block its own workout of its kind, ending when it was logged, with the
// kcal and distance the person entered. HKMetadataKeyExternalUUID carries the
// session id ("<id>", "<id>-<n>") so the engine knows them as this session.

export type FinishedBlock = { log: Pick<CardioLog, "durationSeconds" | "doneAt" | "kcal" | "distanceKm">; modality: string | null; speedKmh: number | null };

const ENERGY: QuantityTypeIdentifier = "HKQuantityTypeIdentifierActiveEnergyBurned";

/** Distance recorded for a kind of workout (Swift's `distanceType`). */
export function distanceType(activity: number): QuantityTypeIdentifier | null {
  if (activity === 37 || activity === 52 || activity === 24) return "HKQuantityTypeIdentifierDistanceWalkingRunning";
  if (activity === 13) return "HKQuantityTypeIdentifierDistanceCycling";
  if (activity === 35) return "HKQuantityTypeIdentifierDistanceRowing";
  return null;
}

/** What each workout to write is, pure: the strength part (if it had sets) and every cardio block with time. */
export function finishedWorkouts(session: Pick<SessionInput, "id" | "startedAt" | "endedAt" | "sets">, blocks: readonly FinishedBlock[], strength: boolean) {
  const out: { activity: number; indoor: boolean; start: Date; end: Date; externalId: string; kcal: number | null; distanceMeters: number | null }[] = [];
  if (strength && session.sets.length)
    out.push({ activity: 50, indoor: true, start: new Date(session.startedAt), end: new Date(session.endedAt), externalId: session.id, kcal: null, distanceMeters: null });
  blocks.forEach(({ log, modality, speedKmh }, index) => {
    if (log.durationSeconds <= 0) return;
    const stage = cardioStage(modality, speedKmh);
    const distance = distanceType(stage.activity);
    out.push({
      activity: stage.activity,
      indoor: stage.indoor,
      start: new Date(log.doneAt - log.durationSeconds * 1000),
      end: new Date(log.doneAt),
      externalId: `${session.id}-${index}`,
      kcal: log.kcal && log.kcal > 0 ? log.kcal : null,
      distanceMeters: distance && log.distanceKm && log.distanceKm > 0 ? log.distanceKm * 1000 : null,
    });
  });
  return out;
}

/** True when at least one workout went into Salud. Refused, unavailable or failing never throws. */
export async function saveFinishedWorkout(session: Pick<SessionInput, "id" | "startedAt" | "endedAt" | "sets">, blocks: FinishedBlock[], strength: boolean): Promise<boolean> {
  const workouts = finishedWorkouts(session, blocks, strength);
  if (!workouts.length || !isHealthDataAvailable()) return false;
  const distances = [...new Set(workouts.flatMap((w) => distanceType(w.activity) ?? []))];
  // Finished inside the live session's modal: a first-time sheet waits until it has closed.
  try {
    await askHealth({ toShare: ["HKWorkoutTypeIdentifier", ENERGY, ...distances] });
  } catch {
    return false;
  }
  let saved = false;
  for (const w of workouts) {
    const distance = distanceType(w.activity);
    const quantities = [
      ...(w.kcal ? [{ quantityType: ENERGY, quantity: w.kcal, unit: "kcal", startDate: w.start, endDate: w.end }] : []),
      ...(w.distanceMeters && distance ? [{ quantityType: distance, quantity: w.distanceMeters, unit: "m", startDate: w.start, endDate: w.end }] : []),
    ];
    try {
      await saveWorkoutSample(w.activity, quantities, w.start, w.end, undefined, { HKExternalUUID: w.externalId, HKIndoorWorkout: w.indoor });
      saved = true;
    } catch {
      // Salud refused this one; the Mac's copy is untouched.
    }
  }
  return saved;
}
