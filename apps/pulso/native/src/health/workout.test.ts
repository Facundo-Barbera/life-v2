import { describe, expect, mock, test } from "bun:test";

// pulso-watch's native side doesn't exist under bun test.
mock.module("pulso-watch", () => ({ NativeWorkout: null }));
const { createPhoneWorkout } = await import("./workout");

const STRENGTH = { activity: 50, indoor: true };
const WALK = { activity: 52, indoor: true };
const since = new Date(2026, 9, 21, 9, 0);
const tick = () => new Promise((r) => setTimeout(r, 0));
const running = { paused: false, since, stageSince: null };

/** WorkoutManager as far as calls go: each follow takes a tick, like the real start. */
function fakeNative(watchRecording = false) {
  const calls: string[] = [];
  let release: (() => void) | null = null;
  const native = {
    watchRecording: () => watchRecording,
    follow: async (stage: { activity: number }, paused: boolean) => {
      calls.push(`follow ${stage.activity}${paused ? " paused" : ""}`);
      await new Promise<void>((resolve) => (release = resolve));
    },
    finish: async (save: boolean) => void calls.push(`finish ${save}`),
    recover: async () => void calls.push("recover"),
    metrics: () => null,
    onMetrics: () => () => {},
  };
  const step = async () => {
    await Promise.resolve();
    release?.();
    release = null;
    await new Promise((r) => setTimeout(r, 0));
  };
  return { native, calls, step };
}

describe("PhoneWorkout", () => {
  test("follows run in order and only the latest waiting one is applied", async () => {
    const { native, calls, step } = fakeNative();
    const workout = createPhoneWorkout(native);
    void workout.follow("s1", STRENGTH, running);
    await tick();
    // The start is still going: these wait, and only the last one counts.
    void workout.follow("s1", WALK, running);
    void workout.follow("s1", WALK, { ...running, paused: true });
    await step();
    await step();
    expect(calls).toEqual(["follow 50", "follow 52 paused"]);
  });

  test("a finished session is saved once and never starts again", async () => {
    const { native, calls, step } = fakeNative();
    const workout = createPhoneWorkout(native);
    void workout.follow("s1", STRENGTH, running);
    await step();
    void workout.finish("s1", true);
    void workout.finish("s1", true);
    void workout.follow("s1", STRENGTH, running);
    await step();
    expect(calls).toEqual(["follow 50", "finish true"]);
  });

  test("a finish while a start is still going drops the follows waiting behind it", async () => {
    const { native, calls, step } = fakeNative();
    const workout = createPhoneWorkout(native);
    void workout.follow("s1", STRENGTH, running);
    await tick();
    void workout.follow("s1", WALK, running);
    const done = workout.finish("s1", false);
    await step();
    await done;
    expect(calls).toEqual(["follow 50", "finish false"]);
  });

  test("never records while the Watch does, nor a second session over the first", async () => {
    const watch = fakeNative(true);
    void createPhoneWorkout(watch.native).follow("s1", STRENGTH, running);
    await watch.step();
    expect(watch.calls).toEqual([]);

    const { native, calls, step } = fakeNative();
    const workout = createPhoneWorkout(native);
    void workout.follow("s1", STRENGTH, running);
    await step();
    void workout.follow("s2", WALK, running);
    void workout.finish("s2", true);
    await step();
    expect(calls).toEqual(["follow 50"]);
  });

  test("without the native module everything is a no-op", async () => {
    const workout = createPhoneWorkout(null);
    expect(workout.available).toBe(false);
    await workout.follow("s1", STRENGTH, running);
    await workout.finish("s1", true);
    expect(workout.metrics()).toBeNull();
  });
});
