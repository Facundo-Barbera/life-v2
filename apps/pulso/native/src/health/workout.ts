import { NativeWorkout, type WatchMetrics, type WorkoutStage } from "pulso-watch";

// The workout the iPhone records when no Watch does (WatchLink decides who
// records and calls this only when it's the phone). Native is the SwiftUI
// app's own WorkoutManager; this layer adds what JS calls need around it:
// - calls run one after another, and while one runs only the LATEST follow is
//   kept (WorkoutManager ignores a follow that arrives while it is starting);
// - one session, one workout: once a session is finished, its late follows and
//   a second finish do nothing, so it is saved exactly once and never restarted;
// - never both devices: no recording starts while the Watch's mirrored workout runs.

export type FollowOptions = {
  /** The cardio block in focus is paused: so is the workout. */
  paused: boolean;
  /** The session's start: the workout is backdated to it (up to 60 s). */
  since: Date;
  /** When the current stage's cardio clock started, if it did. */
  stageSince: Date | null;
};

type Wanted = { sessionId: string; stage: WorkoutStage; options: FollowOptions };

export function createPhoneWorkout(native: NativeWorkout | null) {
  let recording: string | null = null;
  const finished = new Set<string>();
  let wanted: Wanted | null = null;
  let queue: Promise<void> = Promise.resolve();
  let following = false;

  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch(() => {});
    return queue;
  };

  async function drain() {
    following = true;
    try {
      while (wanted && native) {
        const next: Wanted = wanted;
        wanted = null;
        if (finished.has(next.sessionId)) continue;
        await native.follow(next.stage, next.options.paused, next.options.since, next.options.stageSince);
      }
    } finally {
      following = false;
    }
  }

  return {
    available: native !== null,

    /** Records `sessionId` at `stage`: starts the workout, or moves/pauses/resumes it. Idempotent. */
    follow(sessionId: string, stage: WorkoutStage, options: FollowOptions): Promise<void> {
      if (!native || finished.has(sessionId)) return queue;
      if (recording && recording !== sessionId) return queue;
      if (!recording && native.watchRecording()) return queue;
      recording = sessionId;
      wanted = { sessionId, stage, options };
      return following ? queue : enqueue(drain);
    },

    /** Ends `sessionId`'s workout: into Salud with `save` (and 10 s or longer), else thrown away. Once. */
    finish(sessionId: string, save: boolean): Promise<void> {
      if (!native || finished.has(sessionId)) return queue;
      // Another session's workout is running: this one has none to end.
      if (recording && recording !== sessionId) return queue;
      finished.add(sessionId);
      recording = null;
      if (wanted?.sessionId === sessionId) wanted = null;
      return enqueue(() => native.finish(save));
    },

    /** After a relaunch mid-session: the same workout carries on (time, pauses and all). */
    recover(): Promise<void> {
      return native ? enqueue(() => native.recover()) : queue;
    },

    /** The numbers now, in the Watch's shape; null while nothing records. */
    metrics: (): WatchMetrics | null => native?.metrics() ?? null,

    onMetrics: (listener: (metrics: WatchMetrics | null) => void): (() => void) => native?.onMetrics(listener) ?? (() => {}),
  };
}

export type PhoneWorkout = ReturnType<typeof createPhoneWorkout>;

export const PhoneWorkout: PhoneWorkout = createPhoneWorkout(NativeWorkout);
