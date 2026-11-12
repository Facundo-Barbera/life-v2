import { describe, expect, mock, test } from "bun:test";

mock.module("@kingstinct/react-native-healthkit", () => ({ isHealthDataAvailable: () => false, requestAuthorization: async () => true, saveWorkoutSample: async () => ({}) }));
mock.module("./access", () => ({ askHealth: async () => true }));
const { finishedWorkouts } = await import("./save-workout");

const session = { id: "s1", startedAt: 1_000_000, endedAt: 4_600_000, sets: [{}] as never[] };

describe("finished workouts for Salud", () => {
  test("strength over the session and each cardio block before it was logged, ids by place", () => {
    const blocks = [
      { log: { durationSeconds: 600, doneAt: 2_000_000, kcal: 80, distanceKm: 1.2 }, modality: "treadmill", speedKmh: 6 },
      { log: { durationSeconds: 300, doneAt: 3_000_000, kcal: null, distanceKm: 2 }, modality: "stairs", speedKmh: null },
    ];
    const out = finishedWorkouts(session, blocks, true);
    expect(out.map((w) => [w.activity, w.externalId, w.kcal, w.distanceMeters])).toEqual([
      [50, "s1", null, null],
      [52, "s1-0", 80, 1200],
      [44, "s1-1", null, null],
    ]);
    expect(out[1]!.start.getTime()).toBe(1_400_000);
  });

  test("the strength part only when asked and with sets; empty blocks skipped", () => {
    expect(finishedWorkouts(session, [], false)).toEqual([]);
    expect(finishedWorkouts({ ...session, sets: [] }, [], true)).toEqual([]);
    expect(finishedWorkouts(session, [{ log: { durationSeconds: 0, doneAt: 1, kcal: null, distanceKm: null }, modality: "run", speedKmh: null }], false)).toEqual([]);
  });
});
