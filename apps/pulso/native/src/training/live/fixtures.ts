import type { ProgramDay, ProgramExercise } from "@/contract";

// Test fixtures: the same days the Swift tests (PulsoTests) use.

export const T0 = 1_000_000; // Date(timeIntervalSince1970: 1_000)
export const at = (seconds: number) => T0 + seconds * 1000;

export function pe(p: Partial<ProgramExercise> & Pick<ProgramExercise, "id" | "exerciseId" | "exerciseName">): ProgramExercise {
  return {
    equipment: "barbell",
    kind: "compound",
    modality: null,
    sets: 3,
    repMin: 8,
    repMax: 10,
    targetRpe: null,
    targetRir: null,
    restSeconds: 90,
    notes: null,
    cardio: null,
    weightKg: null,
    supersetId: null,
    ...p,
  };
}

/** LiveSessionTests' day. */
export const torso: ProgramDay = {
  id: "d1",
  name: "Torso A",
  focus: null,
  weekday: null,
  exercises: [
    pe({ id: "pe1", exerciseId: "press-banca", exerciseName: "Press de banca", sets: 3, repMin: 6, repMax: 8, targetRir: 2, restSeconds: 120 }),
    pe({ id: "pe2", exerciseId: "curl-mancuernas", exerciseName: "Curl con mancuernas", equipment: "dumbbell", kind: "isolation", sets: 2, repMin: 10, repMax: 12, targetRpe: 8, restSeconds: 60 }),
    pe({
      id: "pe3",
      exerciseId: "cinta",
      exerciseName: "Cinta",
      equipment: "machine",
      kind: "cardio",
      modality: "treadmill",
      sets: 1,
      repMin: 1,
      repMax: 1,
      restSeconds: 0,
      cardio: { durationMinutes: 8, zone: 4, intervals: { rounds: 3, workSeconds: 30, restSeconds: 90 } },
    }),
  ],
};

/** WatchSyncTests' and WorkoutClockTests' day: strength, then a treadmill walk. */
export const withTreadmill: ProgramDay = {
  id: "d1",
  name: "Torso A",
  focus: null,
  weekday: null,
  exercises: [
    pe({ id: "pe1", exerciseId: "press-banca", exerciseName: "Press de banca", sets: 3, repMin: 8, repMax: 10, targetRir: 2, restSeconds: 90 }),
    pe({ id: "pe2", exerciseId: "cinta", exerciseName: "Caminadora", equipment: "machine", kind: "cardio", modality: "treadmill", sets: 1, repMin: 1, repMax: 1, restSeconds: 0, cardio: { durationMinutes: 15, speedKmh: 5.5 } }),
  ],
};

export const rowing = { id: "remo-polea", name: "Remo en polea", equipment: "cable" as const, kind: "compound" as const };
