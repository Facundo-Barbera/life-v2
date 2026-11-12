import { describe, expect, test } from "bun:test";
import { dropOffer, dropsShort, dropsText, nextDrop } from "./drops";
import { at, pe, T0 } from "./live/fixtures";
import * as L from "./live/state";
import { activityState } from "./live/activity";
import { formatBoth, formatTotal, formatWeight, fromUnit, number, shown, snap, snapKg, stepDown, stepUp, toUnit, KG_PER_LB } from "./units";

// SwiftUI's WeightUnitTests and SetDropTests (the engine's units/segments tests), ported.

describe("weight units", () => {
  test("a pound entry is stored as its exact kg", () => {
    expect(fromUnit(45, "lb")).toBeCloseTo(20.41165665, 8);
    expect(fromUnit(45, "kg")).toBe(45);
    expect(toUnit(KG_PER_LB, "lb")).toBe(1);
  });

  test("round trip is stable across switches", () => {
    for (const pounds of [2.5, 22.5, 45, 47.5, 70, 135, 225, 405]) {
      let stored = fromUnit(pounds, "lb");
      for (let i = 0; i < 5; i++) stored = snapKg(snapKg(stored, "lb"), "lb");
      expect(snap(stored, "lb")).toBe(pounds);
      expect(shown(stored, "lb")).toBe(pounds);
      expect(formatWeight(stored, "lb")).toBe(`${number(pounds)} lb`);
    }
    for (const kilos of [1, 9, 14, 20, 32.5, 61.25, 100]) expect(snap(kilos, "kg")).toBe(kilos);
    expect(formatWeight(61.25, "kg")).toBe("61,25 kg");
  });

  test("kg from the other unit goes to pound plates, and back", () => {
    expect(snap(20, "lb")).toBe(45);
    expect(snap(100, "lb")).toBe(220);
    expect(snap(10, "lb")).toBe(22.5);
    expect(snap(31.75, "lb")).toBe(70);
    expect(snap(fromUnit(45, "lb"), "kg")).toBe(20);
    expect(snap(fromUnit(70, "lb"), "kg")).toBe(32.5);
    expect(snap(fromUnit(15, "lb"), "kg")).toBe(7);
    expect(snap(14, "kg")).toBe(14);
    expect(snap(-1, "kg")).toBe(0);
  });

  test("steppers", () => {
    expect([stepUp(45, "lb"), stepUp(47, "lb"), stepUp(22.5, "lb"), stepUp(25, "lb")]).toEqual([50, 50, 25, 30]);
    expect([stepDown(30, "lb"), stepDown(25, "lb"), stepDown(27, "lb"), stepDown(2.5, "lb"), stepDown(0, "lb")]).toEqual([25, 22.5, 25, 0, 0]);
    expect([stepUp(9, "kg"), stepUp(10, "kg"), stepUp(14, "kg")]).toEqual([10, 12.5, 15]);
    expect([stepDown(12.5, "kg"), stepDown(10, "kg"), stepDown(11, "kg")]).toEqual([10, 9, 10]);
    expect(stepUp(toUnit(fromUnit(45, "lb"), "lb"), "lb")).toBe(50);
    expect(stepDown(toUnit(fromUnit(45, "lb"), "lb"), "lb")).toBe(40);
  });

  test("formatting in Spanish, the other unit second", () => {
    expect(formatWeight(fromUnit(45, "lb"), "lb")).toBe("45 lb");
    expect(formatWeight(fromUnit(45, "lb"), "kg")).toBe("20,4 kg");
    expect(formatBoth(fromUnit(100, "lb"), "lb")).toBe("100 lb · 45,4 kg");
    expect(formatBoth(fromUnit(70, "lb"), "lb")).toBe("70 lb · 31,8 kg");
    expect(formatTotal(1074.4, "kg")).toBe("1074 kg");
  });

  const machine = { id: "d1", name: "Torso A", focus: null, weekday: null, exercises: [pe({ id: "pe1", exerciseId: "remo-maquina", exerciseName: "Remo en máquina", equipment: "machine", restSeconds: 150, targetRir: 2, weightKg: 31.75 })] };

  test("Hecho logs the shown weight's exact kg", () => {
    const s = L.fromDay(machine, null, {}, T0);
    L.toggle(s, 0, 0, T0, "lb");
    expect(s.exercises[0]!.sets[0]!.weightKg).toBe(fromUnit(70, "lb"));
    expect(s.exercises[0]!.sets[1]!.weightKg).toBe(fromUnit(70, "lb"));
  });

  test("steps and typed values are in the unit", () => {
    const s = L.fromDay(machine, null, {}, T0);
    L.stepWeight(s, 0, 0, true, "lb");
    expect(s.exercises[0]!.sets[0]!.weightKg).toBe(fromUnit(75, "lb"));
    L.stepWeight(s, 0, 0, false, "lb");
    L.stepWeight(s, 0, 0, false, "lb");
    expect(s.exercises[0]!.sets[0]!.weightKg).toBe(fromUnit(65, "lb"));
    L.setWeight(s, 0, 1, 45, "lb");
    expect(snap(s.exercises[0]!.sets[1]!.weightKg, "lb")).toBe(45);
    L.setWeight(s, 0, 1, 22.3, "kg");
    expect(s.exercises[0]!.sets[1]!.weightKg).toBe(22.25);
  });

  test("switching unit snaps open sets and keeps done ones", () => {
    const s = L.fromDay(machine, null, {}, T0);
    L.setWeight(s, 0, 0, 20);
    L.toggle(s, 0, 0, T0);
    L.snapOpenSets(s, 0, "lb");
    expect(s.exercises[0]!.sets[0]!.weightKg).toBe(20);
    expect(s.exercises[0]!.sets[1]!.weightKg).toBe(fromUnit(45, "lb"));
    L.snapOpenSets(s, 0, "kg");
    expect(s.exercises[0]!.sets[1]!.weightKg).toBe(20);
  });

  test("the Live Activity shows the exercise's unit", () => {
    const s = L.fromDay(machine, null, {}, T0);
    const activity = activityState(s, { now: T0, unit: () => "lb" });
    expect(activity.weight).toBe("70 lb");
    expect(activity.target).toBe("70 lb, 8 repeticiones");
    expect(activityState(s, { now: T0 }).weight).toBe("31,75 kg");
  });
});

describe("drops", () => {
  const done = (weightKg: number, reps: number, drops: { weightKg: number; reps: number }[] = []) => ({ weightKg, reps, doneAt: T0, drops });
  const state = () =>
    L.fromDay(
      { id: "d", name: "Torso", focus: null, weekday: null, exercises: [pe({ id: "pe", exerciseId: "press-banca", exerciseName: "Press de banca", repMin: 8, repMax: 10, restSeconds: 120 })] },
      null,
      { pe: { exerciseId: "press-banca", weightKg: 80, reps: 8, reason: "", lastSessionAt: 1 } },
      T0,
    );

  test("offered only for a loaded set short of the range's bottom", () => {
    expect(dropOffer(done(80, 5), 8, "kg")).toEqual({ weightKg: 67.5, reps: 3 });
    expect(dropOffer(done(80, 8), 8, "kg")).toBeNull();
    expect(dropOffer(done(0, 4), 8, "kg")).toBeNull();
    expect(dropOffer(done(80, 0), 8, "kg")).toBeNull();
    expect(dropOffer(done(80, 5, [{ weightKg: 60, reps: 3 }]), 8, "kg")).toBeNull();
    expect(dropOffer({ ...done(80, 5), doneAt: null }, 8, "kg")).toBeNull();
  });

  test("the prefill is 10–20 % lighter on the unit's steps", () => {
    for (const [unit, top] of [["kg", 20], ["kg", 32.5], ["kg", 80], ["kg", 140], ["lb", 45], ["lb", 100], ["lb", 225]] as const) {
      const kg = fromUnit(top, unit);
      const drop = nextDrop({ weightKg: kg, reps: 4 }, [], 10, unit);
      const cut = 1 - drop.weightKg / kg;
      expect(cut).toBeGreaterThanOrEqual(0.09);
      expect(cut).toBeLessThanOrEqual(0.21);
      expect(shown(drop.weightKg, unit) % (unit === "lb" ? 5 : 2.5)).toBe(0);
      expect(drop.reps).toBe(6);
    }
    expect(nextDrop({ weightKg: fromUnit(100, "lb"), reps: 4 }, [], 8, "lb")).toEqual({ weightKg: fromUnit(85, "lb"), reps: 4 });
    expect(nextDrop({ weightKg: 80, reps: 4 }, [{ weightKg: 67.5, reps: 2 }], 8, "kg")).toEqual({ weightKg: 57.5, reps: 2 });
    expect(nextDrop({ weightKg: 10, reps: 9 }, [], 8, "kg")).toEqual({ weightKg: 9, reps: 1 });
  });

  test("a drop counts in volume and travels as segments", () => {
    const s = state();
    L.setReps(s, 0, 0, 5);
    L.toggle(s, 0, 0, at(60));
    L.addDrop(s, 0, 0, { weightKg: 60, reps: 3 }, at(90));
    expect(L.volumeKg(s)).toBe(80 * 5 + 60 * 3);
    expect(dropsShort(L.segments(s.exercises[0]!.sets[0]!), "kg")).toBe("80 × 5 → 60 × 3");
    expect(dropsText(L.segments(s.exercises[0]!.sets[0]!), "kg")).toBe("80 kg × 5 → 60 kg × 3");
    expect(s.exercises[0]!.sets[1]!.drops).toEqual([]);
    const log = L.finishedSession(s, at(600)).sets[0]!;
    expect([log.weightKg, log.reps]).toEqual([80, 5]);
    expect(log.segments).toEqual([{ weightKg: 80, reps: 5 }, { weightKg: 60, reps: 3 }]);
    const wire = L.setToWire(s.exercises[0]!.sets[0]!);
    expect(wire.segments).toHaveLength(2);
    expect(L.setFromWire(wire)).toEqual(s.exercises[0]!.sets[0]!);
  });

  test("the rest starts after the last segment", () => {
    const s = state();
    L.toggle(s, 0, 0, at(60));
    expect(s.restEndsAt).toBe(at(180));
    L.addDrop(s, 0, 0, { weightKg: 60, reps: 3 }, at(80));
    expect(s.restStartedAt).toBe(at(80));
    expect(s.restEndsAt).toBe(at(200));
    L.addDrop(s, 0, 2, { weightKg: 60, reps: 3 }, at(90));
    expect(s.restEndsAt).toBe(at(200));
  });

  test("a pound drop lands on its steps", () => {
    const s = state();
    L.addDrop(s, 0, 0, { weightKg: 27, reps: 2 }, T0, "lb");
    expect(shown(s.exercises[0]!.sets[0]!.drops[0]!.weightKg, "lb")).toBe(60);
    L.setDropWeight(s, 0, 0, 0, 45, "lb");
    L.stepDropWeight(s, 0, 0, 0, false, "lb");
    expect(shown(L.setFromWire(L.setToWire(s.exercises[0]!.sets[0]!)).drops[0]!.weightKg, "lb")).toBe(40);
    L.removeDrop(s, 0, 0, 0);
    expect(s.exercises[0]!.sets[0]!.drops).toEqual([]);
  });

  test("an old copy without segments is one segment", () => {
    const set = L.setFromWire({ id: "s", weightKg: 80, reps: 8, rpe: null, doneAt: null });
    expect(set.drops).toEqual([]);
    expect(L.segments(set)).toEqual([{ weightKg: 80, reps: 8 }]);
  });

  test("a merge keeps a drop the engine doesn't have yet", () => {
    const local = state();
    L.toggle(local, 0, 0, at(60));
    const remote = L.clone(local);
    remote.version = 3;
    L.addDrop(local, 0, 0, { weightKg: 60, reps: 3 }, at(80));
    const { state: merged, keptLocal } = L.merge(remote, local);
    expect(keptLocal).toBe(true);
    expect(merged.exercises[0]!.sets[0]!.drops).toEqual([{ weightKg: 60, reps: 3 }]);
  });

  test("the lock screen shows a planned drop", () => {
    const s = state();
    L.addDrop(s, 0, 0, { weightKg: 60, reps: 3 });
    expect(activityState(s, { now: T0 }).target).toBe("80 kg, 8 repeticiones → 60 kg × 3");
  });
});
