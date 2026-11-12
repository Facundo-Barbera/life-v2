import { describe, expect, test } from "bun:test";
import { applying, doseOf, workoutOf, type WidgetSnapshot } from "./snapshot";

const now = new Date(2026, 9, 21, 9, 30);
const old: WidgetSnapshot = {
  updatedAt: 1,
  date: "2026-10-21",
  recovery: { score: 70, level: "medium", explanation: "x" },
  macros: { kcal: 500, kcalTarget: 2000, protein: 40 },
  nextDose: { medicationId: "m", name: "Vitamina D", doseText: "1 comprimido", date: "2026-10-21", time: "21:00", due: 2 },
  dosesLeft: 2,
  workout: { programName: "P", dayName: "Torso", exercises: 5 },
};

describe("widget snapshot", () => {
  test("a failed section keeps its old value the same day", () => {
    const next = applying({ recovery: { score: 80, level: "high", explanation: "y" } }, old, now);
    expect(next).toEqual({ ...old, updatedAt: now.getTime(), recovery: { score: 80, level: "high", explanation: "y" } });
  });

  test("on a new day the day-bound sections start over", () => {
    const next = applying({}, { ...old, date: "2026-10-20" }, now);
    expect(next.macros).toBeUndefined();
    expect(next.nextDose).toBeUndefined();
    expect(next.dosesLeft).toBe(0);
    expect(next.recovery).toEqual(old.recovery);
    expect(next.workout).toEqual(old.workout);
  });

  test("no active program clears the workout; no next dose clears it", () => {
    const next = applying({ workout: null, doses: { left: 0 } }, old, now);
    expect(next.workout).toBeUndefined();
    expect(next.nextDose).toBeUndefined();
    expect(next.dosesLeft).toBe(0);
  });

  test("a dose keeps its slot key and is due at its local time; one waiting for a workout has none", () => {
    const slot = { medicationId: "m", name: "Creatina", dose: 5, unit: "g", date: "2026-10-21", time: "08:00", slot: "desayuno" } as never;
    expect(doseOf(slot)).toMatchObject({ doseText: "5 g", slot: "desayuno", due: new Date(2026, 9, 21, 8, 0).getTime() });
    expect(doseOf({ ...(slot as object), time: null } as never)).toBeUndefined();
  });

  test("the next day of the program, else its first", () => {
    const days = [
      { id: "a", name: "Torso", focus: null, exercises: [{}, {}] },
      { id: "b", name: "Pierna", focus: "Sentadilla", exercises: [{}] },
    ];
    expect(workoutOf({ program: { name: "Fuerza", days }, nextDayId: "b" } as never)).toEqual({ programName: "Fuerza", dayName: "Pierna", focus: "Sentadilla", exercises: 1 });
    expect(workoutOf({ program: { name: "Fuerza", days }, nextDayId: null } as never)).toEqual({ programName: "Fuerza", dayName: "Torso", exercises: 2 });
    expect(workoutOf({ program: null, nextDayId: null } as never)).toBeNull();
  });
});
