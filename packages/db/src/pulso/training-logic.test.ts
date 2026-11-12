import { describe, expect, test } from "bun:test";
import type { LibraryExercise } from "../types";
import { bests, currentWeek, dayDate, e1rm, estimateMinutes, formatSet, missingSessions, nextLoad, performance, recordsFor, sessionStatus, similarExercises, snap, weekOf } from "./training-logic";

const lib = (id: string, muscle: string, equipment: string, kind: "compound" | "isolation" | "cardio" = "compound", secondary: string[] = []): LibraryExercise => ({ id, name: id, muscle, secondary, equipment, kind, cardio_modality: null });

describe("units and sets", () => {
  test("snap", () => {
    expect(snap(20, "lb")).toBe(45);
    expect(snap(61.25, "kg")).toBe(61.25);
  });
  test("e1rm and bests", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 5)).toBe(116.7);
    expect(bests([{ weightKg: 80, reps: 5 }, { weightKg: 0, reps: 12 }])).toEqual({ e1rm: 93.3, weight: 80, reps: 12 });
    expect(formatSet({ weightKg: 80, reps: 5, drops: [{ weightKg: 60, reps: 3 }] }, "kg")).toBe("80 kg × 5 → 60 kg × 3");
  });
  test("records need history", () => {
    expect(recordsFor([{ weightKg: 100, reps: 5 }], [])).toEqual([]);
    expect(recordsFor([{ weightKg: 100, reps: 5 }], [{ weightKg: 95, reps: 5 }]).map((r) => r.kind)).toEqual(["e1rm", "weight"]);
  });
});

describe("progression", () => {
  const rx = { sets: 3, repMin: 8, repMax: 12 };
  test("first time", () => expect(nextLoad(rx, null, 2.5).weightKg).toBeNull());
  test("all sets at the top go up", () => {
    const s = nextLoad(rx, [{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 12 }, { weightKg: 60, reps: 12 }], 2.5);
    expect(s.weightKg).toBe(62.5);
    expect(s.reps).toBe(8);
  });
  test("short of the bottom backs off", () => expect(nextLoad(rx, [{ weightKg: 60, reps: 6 }], 2.5).weightKg).toBe(57.5));
  test("otherwise one more rep", () => expect(nextLoad(rx, [{ weightKg: 60, reps: 9 }, { weightKg: 60, reps: 10 }], 2.5)).toMatchObject({ weightKg: 60, reps: 10 }));
});

test("performance dates records to the first session", () => {
  const p = performance([
    { at: "2026-11-02", sets: [{ weightKg: 80, reps: 5 }] },
    { at: "2026-11-09", sets: [{ weightKg: 80, reps: 6 }, { weightKg: 70, reps: 8 }] },
  ]);
  expect(p.maxWeight).toEqual({ kg: 80, reps: 6, at: "2026-11-09" });
  expect(p.history).toHaveLength(2);
});

test("similar exercises", () => {
  const library = [lib("press-banca", "chest", "barbell"), lib("press-pecho-maquina", "chest", "machine"), lib("aperturas-mancuernas", "chest", "dumbbell", "isolation"), lib("sentadilla", "quads", "barbell"), lib("correr", "cardio", "bodyweight", "cardio")];
  const out = similarExercises(library[0]!, library);
  expect(out[0]!.exercise.id).toBe("press-pecho-maquina");
  expect(out.map((s) => s.exercise.id)).not.toContain("sentadilla");
  expect(out.map((s) => s.exercise.id)).not.toContain("correr");
});

describe("weeks", () => {
  test("weeks run Monday to Sunday from the block's start", () => {
    expect(weekOf("2026-11-12", "2026-11-09")).toBe(1);
    expect(weekOf("2026-11-12", "2026-11-16")).toBe(2);
    expect(currentWeek("2026-11-12", 4, "2027-03-01")).toBe(4);
    expect(dayDate("2026-11-12", 2, 3)).toBe("2026-11-18");
    expect(dayDate("2026-11-12", 2, null)).toBeNull();
  });
  test("missing sessions", () => {
    const m = missingSessions({ starts_on: "2026-11-09", weeks: 2 }, [{ id: "a", weekday: 1 }, { id: "b", weekday: 4 }], [{ program_day_id: "a", week: 1 }]);
    expect(m).toEqual([{ dayId: "b", week: 1, date: "2026-11-12" }, { dayId: "a", week: 2, date: "2026-11-16" }, { dayId: "b", week: 2, date: "2026-11-19" }]);
  });
  test("status", () => {
    const base = { status: "planned" as const, local_date: "2026-11-10", started_at: null, ended_at: null };
    expect(sessionStatus(base, "2026-11-12")).toBe("missed");
    expect(sessionStatus({ ...base, local_date: "2026-11-12" }, "2026-11-12")).toBe("planned");
    expect(sessionStatus({ ...base, started_at: "x" }, "2026-11-12")).toBe("in_progress");
    expect(sessionStatus({ ...base, status: "done" }, "2026-11-12", 5, 12)).toBe("partial");
    expect(sessionStatus({ ...base, status: "done" }, "2026-11-12", 10, 12)).toBe("done");
  });
  test("minutes", () => expect(estimateMinutes([{ exerciseId: "x", name: "x", sets: 3, repMin: 8, repMax: 12, restSeconds: 90 }])).toBe(5));
});
