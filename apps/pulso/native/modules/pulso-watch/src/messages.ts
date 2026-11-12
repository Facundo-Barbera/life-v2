import { HrZoneRange, LiveSession, LiveSet, LoadSuggestion, ProgramDay } from "../../../src/contract";
import { z } from "zod";

// What the phone and the Watch say to each other, byte for byte what the
// unchanged Swift side (apps/pulso-ios/WatchShared: WorkoutLink.swift,
// SessionSync.swift) encodes with a plain `JSONEncoder()`:
// - an enum case is an object with one key, the case: `{"metrics":{"_0":{…}}}`
//   (unlabelled associated value → `_0`), `{"rest":{"startedAt":…}}` (labelled);
// - a `Date` is seconds since 2001-01-01 (Swift's reference date), NOT epoch ms;
// - a nil optional is left out (or `null`; Swift reads both).
// The session itself (`LiveSessionState`) has its own Codable in the contract's
// shape (epoch ms), so it is @life/client's `LiveSession` as is.
// `swift-fixtures.json` is the real Swift output (see README); the tests decode it.

/** Swift's `Date` in a default JSONEncoder: seconds since 2001-01-01T00:00:00Z. */
const REFERENCE_EPOCH_MS = 978_307_200_000;
export const SwiftDate = z.codec(z.number(), z.date(), {
  decode: (seconds) => new Date(REFERENCE_EPOCH_MS + seconds * 1000),
  encode: (date) => (date.getTime() - REFERENCE_EPOCH_MS) / 1000,
});

/** `HKWorkoutActivityType.rawValue` + indoor/outdoor. */
export const WorkoutStage = z.object({ activity: z.number().int(), indoor: z.boolean() });
export type WorkoutStage = z.infer<typeof WorkoutStage>;
/** `HKWorkoutActivityType.traditionalStrengthTraining` (50). */
export const STRENGTH: WorkoutStage = { activity: 50, indoor: true };

/** Watch → phone: the live numbers, a few times a second at most. */
export const WatchMetrics = z.object({
  stage: WorkoutStage,
  heartRate: z.number().nullish(),
  activeKcal: z.number(),
  distanceMeters: z.number().nullish(),
  paused: z.boolean(),
  totalKcal: z.number().nullish(),
  averageHeartRate: z.number().nullish(),
  steps: z.number().nullish(),
  paceSecondsPerKm: z.number().nullish(),
  cadence: z.number().nullish(),
  elapsedFrom: SwiftDate.nullish(),
  elapsedSeconds: z.number().nullish(),
});
export type WatchMetrics = z.output<typeof WatchMetrics>;

const WeightUnit = z.enum(["kg", "lb"]);

/** Swift's own `CardioClock` (Date + `accumulated`), not the contract's `LiveCardioClock`. */
const WatchCardioClock = z.object({ exerciseId: z.string(), runningSince: SwiftDate.nullish(), accumulated: z.number() });

/** Swift's synthesized `CardioLog`: its nil fields are left out. */
const WatchCardioLog = z.object({
  exerciseId: z.string(),
  durationSeconds: z.number(),
  distanceKm: z.number().nullish(),
  level: z.number().nullish(),
  inclinePercent: z.number().nullish(),
  avgHr: z.number().nullish(),
  kcal: z.number().nullish(),
  doneAt: z.number(),
  recordedBy: z.string().nullish(),
});

/** `WatchEdit.Change`, one key per case. */
export const WatchChange = z.union([
  z.object({ set: z.object({ exerciseId: z.string(), set: LiveSet }) }),
  z.object({ rest: z.object({ startedAt: SwiftDate.nullish(), endsAt: SwiftDate.nullish() }) }),
  z.object({ cardio: z.object({ exerciseId: z.string(), clock: WatchCardioClock.nullish(), log: WatchCardioLog.nullish() }) }),
  z.object({ finish: z.object({ save: z.boolean() }) }),
  z.object({ start: z.object({ _0: LiveSession }) }),
  z.object({ unit: z.object({ exerciseId: z.string(), unit: WeightUnit }) }),
]);

/** Watch → phone: one change, when it happened. */
export const WatchEdit = z.object({ id: z.string(), sessionId: z.string(), at: SwiftDate, change: WatchChange });
export type WatchEdit = z.output<typeof WatchEdit>;

/** Phone → Watch: the phone's copy of everything the Watch needs. */
export const WatchSync = z.object({
  state: LiveSession.nullish(),
  closed: z.object({ id: z.string(), saved: z.boolean() }).nullish(),
  applied: z.array(z.string()),
  units: z.record(z.string(), WeightUnit),
  plan: z.object({ day: ProgramDay, programId: z.string().nullish(), suggestions: z.record(z.string(), LoadSuggestion) }).nullish(),
  hrZones: z.array(HrZoneRange).nullish(),
  recorder: z.enum(["watch", "phone"]).nullish(),
});
export type WatchSync = z.output<typeof WatchSync>;

/** `WatchMessage`, as Swift encodes it. */
export const WatchMessageWire = z.union([
  z.object({ metrics: z.object({ _0: WatchMetrics }) }),
  z.object({ stopped: z.object({}) }),
  z.object({ sync: z.object({ _0: WatchSync }) }),
  z.object({ edits: z.object({ _0: z.array(WatchEdit) }) }),
]);

/** The same, as the app uses it. */
export type WatchMessage =
  | { kind: "metrics"; metrics: z.output<typeof WatchMetrics> }
  | { kind: "stopped" }
  | { kind: "sync"; sync: WatchSync }
  | { kind: "edits"; edits: WatchEdit[] };

/** One message from the Watch (its JSON as WCSession or the mirrored workout carried it); null if it isn't one. */
export function decodeWatchMessage(json: string): WatchMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = WatchMessageWire.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  if ("metrics" in wire) return { kind: "metrics", metrics: wire.metrics._0 };
  if ("stopped" in wire) return { kind: "stopped" };
  if ("sync" in wire) return { kind: "sync", sync: wire.sync._0 };
  return { kind: "edits", edits: wire.edits._0 };
}

/** A message for the Watch, as Swift's `JSONDecoder` reads it. */
export function encodeWatchMessage(message: WatchMessage): string {
  const wire: z.input<typeof WatchMessageWire> =
    message.kind === "metrics"
      ? { metrics: { _0: z.encode(WatchMetrics, message.metrics) } }
      : message.kind === "stopped"
        ? { stopped: {} }
        : message.kind === "sync"
          ? { sync: { _0: z.encode(WatchSync, message.sync) } }
          : { edits: { _0: message.edits.map((edit) => z.encode(WatchEdit, edit)) } };
  return JSON.stringify(wire);
}

/** The Live Activity (PulsoActivity, `TrainingActivityAttributes`), synthesized Codable: Dates in Swift's encoding. */
export const ActivityAttributes = z.object({ sessionName: z.string(), startedAt: SwiftDate });
export const ActivityContentState = z.object({
  exerciseName: z.string(),
  setLabel: z.string(),
  target: z.string(),
  setsDone: z.number().int(),
  setsTotal: z.number().int(),
  restStartedAt: SwiftDate.nullish(),
  restEndsAt: SwiftDate.nullish(),
  cardio: z
    .object({
      phase: z.string(),
      detail: z.string(),
      elapsedFrom: SwiftDate.nullish(),
      elapsedSeconds: z.number(),
      phaseStartedAt: SwiftDate.nullish(),
      phaseEndsAt: SwiftDate.nullish(),
      work: z.boolean(),
    })
    .nullish(),
  weight: z.string().nullish(),
});
export type ActivityAttributes = z.output<typeof ActivityAttributes>;
export type ActivityContentState = z.output<typeof ActivityContentState>;
