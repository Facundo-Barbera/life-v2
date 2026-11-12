/**
 * Apple Health workouts (Pulso's `workouts-tools.ts` and `/api/mobile/workouts`):
 * the Coach's two lists and what the iPhone syncs and links. Types in `./workouts-types`.
 */
import { z } from "zod";
import { op } from "./operation";
import { TrainingSession } from "./training";
import { ActivityEntry, Workout, WorkoutInput } from "./workouts-types";

const LinkedSession = z.object({ session: TrainingSession.nullable() });

export const workoutOperations = {
  list_workouts: op({
    name: "list_workouts",
    description:
      "Recent Apple Health workouts (newest first) that are NOT part of a Pulso session, one per real workout: duplicates from two apps are already merged, so don't dedupe or halve. " +
      "Workouts recorded during a Pulso session, and Pulso's own copies, are left out (list_sessions has them as `recorded`). " +
      "Times epoch ms, energy kcal, distance meters, avg/maxHeartRate bpm; sourceName = the recording app.",
    access: "read",
    method: "GET",
    path: "/workouts/standalone",
    input: z.object({ limit: z.number().int().min(1).max(200).default(30) }),
    output: z.array(Workout),
  }),
  list_activity: op({
    name: "list_activity",
    description:
      "Everything trained, newest first, each workout once: Pulso sessions (Watch data recorded during them merged in: merged: true, the workouts in `parts`) and standalone Health workouts. " +
      "Use it for totals (workouts, minutes, kcal this week) instead of adding list_sessions and list_workouts. Times epoch ms (startedAt/endedAt span the parts), energy kcal, distance meters, volumeKg = kg × reps.",
    access: "read",
    method: "GET",
    path: "/workouts/activity",
    input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    output: z.array(ActivityEntry),
  }),
  get_workouts: op({
    name: "get_workouts",
    description:
      "What the iPhone lists: `workouts`, the last 50 Health workouts that are not part of a Pulso session, and `activity`, those and the sessions merged, newest first (30): what Hoy shows. Same rows as list_workouts and list_activity.",
    access: "read",
    method: "GET",
    path: "/workouts",
    input: z.object({}),
    output: z.object({ workouts: z.array(Workout), activity: z.array(ActivityEntry) }),
  }),
  sync_workouts: op({
    name: "sync_workouts",
    description:
      "The iPhone's Apple Health sync: up to 1000 workouts (each with up to 600 heart-rate points), upserted by HealthKit UUID; duplicates of one session from two apps are linked so lists show it once. Returns how many were written. Not for logging by hand.",
    access: "write",
    method: "POST",
    path: "/workouts",
    input: z.object({ workouts: z.array(WorkoutInput).max(1000) }),
    output: z.object({ written: z.number() }),
    event: "workouts.synced",
  }),
  link_workout: op({
    name: "link_workout",
    description:
      "«Unir con…»: join a Health workout to a logged training session (its kcal, heart rate and distance merge in), or keep it apart with sessionId null («Separar»). Pulso's own copies can't be moved. Returns the session it is now in, or the one it left, merged.",
    access: "write",
    method: "PUT",
    path: "/workouts/{id}/link",
    input: z.object({ id: z.string(), sessionId: z.string().nullable() }),
    output: LinkedSession,
    event: "workout.linked",
  }),
  unlink_workout: op({
    name: "unlink_workout",
    description: "Drops the person's say on a Health workout: matching by time decides again. Returns the session it ends up in, or the one it left, merged.",
    access: "write",
    method: "DELETE",
    path: "/workouts/{id}/link",
    input: z.object({ id: z.string() }),
    output: LinkedSession,
    event: "workout.linked",
  }),
};
