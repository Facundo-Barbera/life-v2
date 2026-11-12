/**
 * Health workouts and how they merge into Pulso sessions, ported from
 * `@pulso/contract` `workouts.ts` (and `Workout`/`WorkoutInput` from its
 * `index.ts`) as zod with the same names. The specs are in `./workouts.ts`;
 * these types live apart because training's types use them too.
 *
 * One workout is often in Salud three times: the Pulso session, the Watch's
 * strength workout started for it, and the Watch walk of its treadmill block.
 * The engine attaches such Health workouts to the session they belong to, so
 * every list and total sees the session once.
 */
import { z } from "zod";

/** One heart-rate reading. `at` epoch ms. */
export const HeartRatePoint = z.object({ at: z.number(), bpm: z.number() });
export type HeartRatePoint = z.infer<typeof HeartRatePoint>;

/** A workout as stored by the engine. `source` says where it came from. */
export const Workout = z.object({
  id: z.string(),
  /** HealthKit UUID when synced from the phone; dedupes re-syncs. */
  externalId: z.string().nullable(),
  source: z.enum(["healthkit", "manual"]),
  activity: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  energy: z.number().nullable().describe("kcal"),
  distance: z.number().nullable().describe("meters"),
  /** HealthKit source app, e.g. `com.apple.health.<uuid>` for the Watch or a gym app's bundle id. */
  sourceBundle: z.string().nullable(),
  /** Display name of that source, e.g. "Apple Watch de Facundo". */
  sourceName: z.string().nullable(),
  /** HealthKit's `HKMetadataKeyExternalUUID`. Pulso writes its finished sessions to Salud with the session id ("<sessionId>" strength, "<sessionId>-<n>" cardio). */
  externalRef: z.string().nullable().optional(),
  avgHeartRate: z.number().nullable().optional().describe("bpm, from the workout's heart-rate statistics"),
  maxHeartRate: z.number().nullable().optional(),
});
export type Workout = z.infer<typeof Workout>;

/**
 * What the phone sends from HealthKit. Apple Health often holds one session
 * twice (two apps); the engine returns only the canonical one, so clients
 * never need to merge.
 */
export const WorkoutInput = z.object({
  externalId: z.string(),
  activity: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  energy: z.number().nullable(),
  distance: z.number().nullable(),
  sourceBundle: z.string().nullable().optional(),
  sourceName: z.string().nullable().optional(),
  externalRef: z.string().nullable().optional(),
  avgHeartRate: z.number().nullable().optional(),
  maxHeartRate: z.number().nullable().optional(),
  /** Heart rate during the workout, about one point a minute. */
  heartRate: z.array(HeartRatePoint).nullable().optional(),
});
export type WorkoutInput = z.infer<typeof WorkoutInput>;

/** A Health workout recorded during a Pulso session (the Watch's "Fuerza", the treadmill walk). */
export const RecordedPart = z.object({
  workoutId: z.string(),
  /** Health activity, e.g. "strength", "walking" */
  activity: z.string(),
  /** Spanish, e.g. "Fuerza", "Caminata" */
  title: z.string(),
  startedAt: z.number(),
  endedAt: z.number(),
  energy: z.number().nullable(),
  distance: z.number().nullable(),
  avgHeartRate: z.number().nullable(),
  maxHeartRate: z.number().nullable(),
  /** The app that recorded it, e.g. "Apple Watch de Facundo". */
  sourceName: z.string().nullable(),
  /** walking, running, cycling, elliptical, rowing, stairs, HIIT… */
  cardio: z.boolean(),
  /** "overlap": matched by time; "manual": the person joined it ("Unir con…"). */
  link: z.enum(["overlap", "manual"]),
});
export type RecordedPart = z.infer<typeof RecordedPart>;

/** What Health recorded during a session, merged in. */
export const SessionRecording = z.object({
  parts: z.array(RecordedPart),
  /** Union of the session and its parts: what the row's duration shows. */
  startedAt: z.number(),
  endedAt: z.number(),
  /** kcal: the distinct parts summed, never Pulso's estimates on top. Null without any. */
  energy: z.number().nullable(),
  /** meters, from the cardio parts */
  distance: z.number().nullable(),
  /** bpm, weighted by each part's length */
  avgHeartRate: z.number().nullable(),
  maxHeartRate: z.number().nullable(),
  /** The parts' heart rate, oldest first; empty when Health had none. */
  heartRate: z.array(HeartRatePoint),
});
export type SessionRecording = z.infer<typeof SessionRecording>;

/** A Health workout near a session that the person may join to it ("Unir con…"). */
export const JoinCandidate = RecordedPart.omit({ link: true }).extend({
  /** The session it is part of now, when it is part of another one. */
  joinedTo: z.string().nullable(),
});
export type JoinCandidate = z.infer<typeof JoinCandidate>;

/** `link_workout`: join to `sessionId`, or keep apart with null ("Separar"). `unlink_workout` goes back to automatic. */
export const WorkoutLinkInput = z.object({ sessionId: z.string().nullable() });
export type WorkoutLinkInput = z.infer<typeof WorkoutLinkInput>;

/**
 * One row of "what I trained": a Pulso session, with whatever Health recorded
 * during it merged in, or a Health workout on its own. Lists and totals built
 * from these count each workout once.
 */
export const ActivityEntry = z.object({
  kind: z.enum(["session", "workout"]),
  /** The session's or the workout's id. */
  id: z.string(),
  /** Spanish: the session's name ("Torso A") or the activity ("Carrera"). */
  title: z.string(),
  /** Health activity for workouts; null for sessions. */
  activity: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number(),
  energy: z.number().nullable(),
  distance: z.number().nullable(),
  avgHeartRate: z.number().nullable(),
  maxHeartRate: z.number().nullable(),
  /** Sessions: sets done and their volume (kg × reps). */
  sets: z.number().nullable(),
  volumeKg: z.number().nullable(),
  /** true when Health workouts were merged into this session. */
  merged: z.boolean(),
  parts: z.array(RecordedPart),
  /** Workouts: the app that recorded it. */
  sourceName: z.string().nullable(),
});
export type ActivityEntry = z.infer<typeof ActivityEntry>;
