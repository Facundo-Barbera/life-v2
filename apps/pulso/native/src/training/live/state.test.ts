import { describe, expect, test } from "bun:test";
import type { CardioLog } from "@/contract";
import { cues, phaseAt, phases, totalSeconds, cardioStatus, zoneText, clockText } from "../cardio";
import { labels, normalize, pair, unpair } from "../superset";
import { activityState } from "./activity";
import { at, rowing, T0, torso } from "./fixtures";
import * as L from "./state";

// The cases of SwiftUI's LiveSessionTests, against the TypeScript port.

const state = () =>
  L.fromDay(torso, "p", { pe1: { exerciseId: "press-banca", weightKg: 80, reps: 7, reason: "Mantén 80 kg", lastSessionAt: 1 } }, T0);

const log = (exerciseId: string, durationSeconds: number, doneAt: number, extra: Partial<CardioLog> = {}): CardioLog => ({
  exerciseId,
  durationSeconds,
  distanceKm: null,
  level: null,
  inclinePercent: null,
  avgHr: null,
  kcal: null,
  doneAt,
  ...extra,
});

describe("building", () => {
  test("cardio blocks have no sets and keep their target", () => {
    const s = state();
    expect(s.exercises[2]!.kind).toBe("cardio");
    expect(s.exercises[2]!.modality).toBe("treadmill");
    expect(s.exercises[2]!.sets).toEqual([]);
    expect(s.exercises[2]!.cardio?.intervals?.rounds).toBe(3);
    expect(s.exercises[2]!.hint).toBeNull();
    expect(L.setsTotal(s)).toBe(5);
    expect(s.focus).toBe(0);
    expect(s.version).toBe(0);
    expect(L.target(s.exercises[0]!)).toBe("3 series de 6 a 8 repeticiones con 80 kg");
    expect(L.target(s.exercises[0]!, "lb")).toBe("3 series de 6 a 8 repeticiones con 175 lb");
  });

  test("a hand-set load prefills without a suggestion", () => {
    const plan = structuredClone(torso);
    plan.exercises[1]!.weightKg = 14;
    expect(L.fromDay(plan, null, {}, T0).exercises[1]!.sets.map((x) => x.weightKg)).toEqual([14, 14]);
  });
});

describe("the contract's JSON", () => {
  test("encodes exactly the contract shape", () => {
    const s = state();
    L.toggle(s, 0, 0, at(60));
    L.setEffort(s, 0, 8);
    L.logCardio(s, 2, log("cinta", 480, 1_500_000, { distanceKm: 1.6 }));
    const json = JSON.parse(JSON.stringify(L.toWire(s)));
    expect(Object.keys(json).sort()).toEqual(
      ["id", "programId", "dayId", "instanceId", "name", "startedAt", "exercises", "focus", "restStartedAt", "restEndsAt", "cardioClock", "version", "updatedAt", "threadId"].sort(),
    );
    expect(json.cardioClock).toBeNull();
    expect(json.startedAt).toBe(1_000_000);
    expect(json.restStartedAt).toBe(1_060_000);
    expect(json.restEndsAt).toBe(1_180_000);
    expect(json.threadId).toBeNull();
    const [press, , cinta] = json.exercises;
    expect(Object.keys(press).sort()).toEqual(
      ["id", "exerciseId", "name", "equipment", "kind", "modality", "repMin", "repMax", "targetRpe", "targetRir", "restSeconds", "notes", "hint", "sets", "cardio", "cardioLog", "cutShort", "skipped", "supersetId"].sort(),
    );
    expect(press.cutShort).toBeNull();
    expect(press.modality).toBeNull();
    expect(Object.keys(press.sets[0]).sort()).toEqual(["id", "weightKg", "reps", "repsChosen", "rpe", "doneAt", "segments"].sort());
    expect(press.sets[0].segments).toHaveLength(1);
    expect(press.sets[0].doneAt).toBe(1_060_000);
    expect(press.sets[0].rpe).toBe(8);
    expect(press.sets[1].doneAt).toBeNull();
    expect(Object.keys(cinta.cardioLog).sort()).toEqual(["exerciseId", "durationSeconds", "distanceKm", "level", "inclinePercent", "avgHr", "kcal", "doneAt"].sort());
    expect(cinta.cardioLog.kcal).toBeNull();
    expect(cinta.cardio.zone).toBe(4);
  });

  test("round-trips", () => {
    const s = state();
    L.toggle(s, 1, 0, at(30));
    L.logCardio(s, 2, log("cinta", 480, 1_500_000, { avgHr: 150 }));
    L.setSkipped(s, 0, true);
    s.threadId = "t1";
    s.version = 7;
    expect(L.fromWire(L.toWire(s))).toEqual(s);
  });

  test("decodes the engine's copy with optional keys left out", () => {
    const wire = {
      id: "s1", programId: null, dayId: "d1", name: "Torso A", startedAt: 1790000000000, focus: 1, restStartedAt: null, restEndsAt: null, version: 4, updatedAt: 1790000060000, threadId: "th",
      exercises: [
        { id: "pe1", exerciseId: "press-banca", name: "Press de banca", equipment: "barbell", kind: "compound", repMin: 6, repMax: 8, targetRpe: null, targetRir: 2, restSeconds: 120, notes: null, hint: null, sets: [{ id: "a", weightKg: 80, reps: 8, rpe: null, doneAt: 1790000030000 }], cardio: null, cardioLog: null, skipped: false, supersetId: null },
        { id: "x", exerciseId: "eliptica", name: "Elíptica", equipment: "machine", kind: "cardio", modality: "elliptical", repMin: 1, repMax: 1, targetRpe: null, targetRir: null, restSeconds: 0, notes: null, hint: null, sets: [], cardio: { durationMinutes: 20, zone: 2 }, cardioLog: null, skipped: false, supersetId: null },
      ],
    } as Parameters<typeof L.fromWire>[0];
    const s = L.fromWire(wire);
    expect(s.version).toBe(4);
    expect(L.focused(s)?.name).toBe("Elíptica");
    expect(s.exercises[0]!.modality).toBeNull();
    expect(s.exercises[0]!.sets[0]!.repsChosen).toBe(false);
    expect(s.cardioClock).toBeNull();
    expect(s.exercises[1]!.cutShort).toBeNull();
  });

  test("the clock and a cut-short travel in the contract shape", () => {
    const s = state();
    s.cardioClock = { exerciseId: "pe3", runningSince: T0, accumulated: 12.5 };
    s.exercises[2]!.cutShort = { at: at(60), reason: null };
    const json = L.toWire(s);
    expect(json.cardioClock).toEqual({ exerciseId: "pe3", runningSince: 1_000_000, accumulatedSeconds: 12.5 });
    expect(json.exercises[2]!.cutShort).toEqual({ at: 1_060_000, reason: null });
    expect(L.fromWire(json)).toEqual(s);
  });
});

/** The treadmill planned for 20 min, timed on this phone: 2 min done, then running since t0. */
function timedTreadmill() {
  const s = state();
  s.exercises[2]!.cardio = { durationMinutes: 20, zone: 2 };
  L.setFocus(s, 2);
  s.cardioClock = { exerciseId: "pe3", runningSince: T0, accumulated: 120 };
  return s;
}

describe("cardio ended early, skipped or swapped", () => {
  test("the Coach ending a block early logs it with this phone's clock", () => {
    const local = timedTreadmill();
    const remote = L.clone(local);
    remote.version = 3;
    remote.cardioClock = null;
    remote.exercises[2]!.cutShort = { at: at(600), reason: "Le molesta la rodilla" };
    remote.exercises[2]!.cardioLog = log("cinta", 690, at(600));
    const { state: merged, keptLocal } = L.merge(remote, local);
    expect(merged.exercises[2]!.cardioLog?.durationSeconds).toBe(720);
    expect(merged.exercises[2]!.cardioLog?.doneAt).toBe(at(600));
    expect(merged.cardioClock).toBeNull();
    expect(L.exerciseDone(merged.exercises[2]!)).toBe(true);
    expect(merged.exercises[2]!.skipped).toBe(false);
    expect(keptLocal).toBe(true);
    expect(L.cutShortSummary(merged.exercises[2]!)).toBe("Cinta · 12 de 20 min");
    expect(L.finishedSession(merged, at(700)).cardio[0]?.durationSeconds).toBe(720);
    expect(L.merge(merged, merged).keptLocal).toBe(false);
    const undone = L.undoingCoach(local, merged);
    expect(undone.exercises[2]!.cardioLog).toBeNull();
    expect(undone.exercises[2]!.cutShort).toBeNull();
    expect(undone.cardioClock).toEqual(local.cardioClock);
  });

  test("without a clock here the synced one times the cut", () => {
    const local = state();
    local.exercises[2]!.cardio = { durationMinutes: 20 };
    const remote = L.clone(local);
    remote.version = 2;
    remote.cardioClock = { exerciseId: "pe3", runningSince: T0, accumulated: 0 };
    remote.exercises[2]!.cutShort = { at: at(480), reason: null };
    expect(L.merge(remote, local).state.exercises[2]!.cardioLog?.durationSeconds).toBe(480);
    remote.exercises[2]!.cardioLog = log("cinta", 470, 1);
    expect(L.merge(remote, local).state.exercises[2]!.cardioLog?.durationSeconds).toBe(470);
  });

  test("skipping, removing or swapping a block stops its clock", () => {
    const skipped = timedTreadmill();
    L.setSkipped(skipped, 1, true);
    expect(skipped.cardioClock).not.toBeNull();
    L.setSkipped(skipped, 2, true);
    expect(skipped.cardioClock).toBeNull();
    expect(skipped.exercises[2]!.cardioLog).toBeNull();

    const local = timedTreadmill();
    const remote = L.clone(local);
    remote.version = 2;
    remote.exercises[2]!.skipped = true;
    expect(L.merge(remote, local).state.cardioClock).toBeNull();

    const removed = timedTreadmill();
    L.remove(removed, 2);
    expect(removed.cardioClock).toBeNull();

    const swapped = timedTreadmill();
    L.swap(swapped, 2, { id: "eliptica", name: "Elíptica", equipment: "machine", kind: "cardio", modality: "elliptical" }, 0);
    expect(swapped.cardioClock).toBeNull();

    const logged = timedTreadmill();
    L.logCardio(logged, 2, log("cinta", 900, 1));
    expect(logged.cardioClock).toBeNull();
  });

  test("the rest ends when nothing is left", () => {
    const s = state();
    for (const set of [0, 1, 2]) L.toggle(s, 0, set, T0);
    expect(s.restEndsAt).not.toBeNull();
    L.setSkipped(s, 1, true);
    expect(s.restEndsAt).not.toBeNull();
    L.setSkipped(s, 2, true);
    expect(s.restEndsAt).toBeNull();
  });
});

describe("sets, rest and focus", () => {
  test("finishing an exercise rests, then advances", () => {
    const s = state();
    L.toggle(s, 0, 0, T0);
    L.toggle(s, 0, 1, T0);
    expect(L.advanceIfDone(s)).toBe(false);
    L.toggle(s, 0, 2, at(10));
    expect(s.restEndsAt).toBe(at(130));
    expect(L.resting(s, at(60))).toBe(true);
    expect(s.focus).toBe(0);
    expect(L.advanceIfDone(s)).toBe(true);
    expect(s.focus).toBe(1);
    expect(L.current(s)?.exercise).toBe(1);
  });

  test("the rest still runs before a pending cardio block", () => {
    const s = state();
    for (const [e, set] of [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]] as const) L.toggle(s, e, set, T0);
    expect(L.current(s)).toBeNull();
    expect(L.allDone(s)).toBe(false);
    expect(s.restEndsAt).not.toBeNull();
    L.logCardio(s, 2, log("cinta", 300, 1));
    expect(L.allDone(s)).toBe(true);
  });

  test("typed values and sets added or removed", () => {
    const s = state();
    L.setWeight(s, 0, 0, 81.25);
    L.setReps(s, 0, 0, -2);
    expect(s.exercises[0]!.sets[0]!.weightKg).toBe(81.25);
    expect(s.exercises[0]!.sets[0]!.reps).toBe(0);
    L.addSet(s, 0);
    expect(s.exercises[0]!.sets).toHaveLength(4);
    expect(s.exercises[0]!.sets[3]!.weightKg).toBe(80);
    L.toggle(s, 0, 3, T0);
    L.removeSet(s, 0, 3);
    expect(s.exercises[0]!.sets).toHaveLength(4);
    L.toggle(s, 0, 0, T0);
    expect(L.setsDone(s)).toBe(0);
    L.removeSet(s, 0, 2);
    expect(s.exercises[0]!.sets).toHaveLength(3);
    L.addSet(s, 2);
    expect(s.exercises[2]!.sets).toEqual([]);
  });

  test("an open set shows the range and Hecho logs its top", () => {
    const s = state();
    expect(L.repRange(s.exercises[0]!, s.exercises[0]!.sets[0]!)).toEqual([6, 8]);
    L.toggle(s, 0, 0, T0);
    expect(s.exercises[0]!.sets[0]!.reps).toBe(8);
    expect(L.repRange(s.exercises[0]!, s.exercises[0]!.sets[0]!)).toBeNull();
    L.toggle(s, 0, 0, T0);
    expect(L.repRange(s.exercises[0]!, s.exercises[0]!.sets[0]!)).toEqual([6, 8]);
    L.setReps(s, 0, 1, 7);
    expect(L.repRange(s.exercises[0]!, s.exercises[0]!.sets[1]!)).toBeNull();
    L.toggle(s, 0, 1, T0);
    expect(s.exercises[0]!.sets[1]!.reps).toBe(7);
    L.adjustReps(s, 0, 2, -1);
    expect(s.exercises[0]!.sets[2]!.reps).toBe(7);
    expect(s.exercises[0]!.sets[2]!.repsChosen).toBe(true);
  });

  test("rounds and complete-all log the top too", () => {
    const s = state();
    L.completeAll(s, 1, T0);
    expect(s.exercises[1]!.sets.map((x) => x.reps)).toEqual([12, 12]);
    s.exercises[0]!.supersetId = "a";
    s.exercises[1]!.supersetId = "a";
    s.exercises[1]!.sets.push(L.newSet(14, 10));
    L.completeRound(s, { start: 0, end: 2 }, 2, T0);
    expect(s.exercises[0]!.sets[2]!.reps).toBe(8);
    expect(s.exercises[1]!.sets[2]!.reps).toBe(12);
  });
});

describe("resuming", () => {
  test("a rest that ran out while away moves on when resumed", () => {
    const s = state();
    s.updatedAt = T0;
    s.restEndsAt = at(90);
    expect(L.restEndedWhileAway(s, at(60))).toBe(false);
    expect(L.restEndedWhileAway(s, at(600))).toBe(true);
    s.updatedAt = at(91);
    expect(L.restEndedWhileAway(s, at(600))).toBe(false);
    s.restEndsAt = null;
    expect(L.restEndedWhileAway(s, at(600))).toBe(false);
  });
});

describe("editing", () => {
  test("reorder keeps the exercise on screen", () => {
    const s = state();
    L.setFocus(s, 1);
    L.move(s, [1], 0);
    expect(s.exercises.map((x) => x.id)).toEqual(["pe2", "pe1", "pe3"]);
    expect(L.focused(s)?.id).toBe("pe2");
    L.move(s, [2], 0);
    expect(L.focused(s)?.id).toBe("pe2");
    expect(s.focus).toBe(1);
  });

  test("add, remove and skip", () => {
    const s = state();
    expect(L.add(s, rowing, 45)).toBe(3);
    expect(s.exercises[3]!.sets.map((x) => x.weightKg)).toEqual([45, 45, 45]);
    expect(s.exercises[3]!.id).not.toBe("remo-polea");
    L.toggle(s, 0, 0, T0);
    L.remove(s, 0);
    expect(s.exercises).toHaveLength(4);
    L.remove(s, 3);
    expect(s.exercises).toHaveLength(3);
    L.setFocus(s, 1);
    L.setSkipped(s, 1, true);
    expect(s.exercises[1]!.skipped).toBe(true);
    expect(s.focus).toBe(2);
    expect(L.setsTotal(s)).toBe(3);
    expect(L.current(s)?.exercise).toBe(0);
  });

  test("removing the last and the focused exercise stays in range (the live-workout crash)", () => {
    const s = state();
    L.setFocus(s, 2);
    L.remove(s, 2);
    expect(s.exercises).toHaveLength(2);
    expect(s.focus).toBe(1);
    expect(L.blocks(s).every((b) => b.end <= s.exercises.length)).toBe(true);
    expect(activityState(s, { now: T0 }).setLabel).toBe(`Serie 1 de ${s.exercises[0]!.sets.length}`);
    L.remove(s, 1);
    L.remove(s, 0);
    expect(s.exercises).toEqual([]);
    expect(s.focus).toBe(0);
    expect(L.focused(s)).toBeNull();
    expect(L.blocks(s)).toEqual([]);
    expect(activityState(s, { now: T0 }).exerciseName).toBe("Sesión completa");
  });

  const skippedByCoach = () => {
    const before = state();
    const row = L.fresh(rowing, 40, { id: "row" });
    const row2 = { ...L.fresh(rowing, 40, { id: "row2" }), name: "Remo con barra" };
    before.exercises = [before.exercises[0]!, before.exercises[1]!, row, row2];
    L.setFocus(before, 1);
    const remote = L.clone(before);
    remote.version = 2;
    remote.exercises[1]!.skipped = true;
    remote.exercises[2]!.skipped = true;
    return { before, remote };
  };

  test("focus and next pass over skipped exercises", () => {
    const { before, remote } = skippedByCoach();
    const merged = L.merge(remote, before).state;
    expect(merged.focus).toBe(3);
    expect(L.nextPending(merged, 0)).toBe(3);
    expect(L.current(merged)?.exercise).toBe(0);
    expect(L.skippedNames(merged)).toEqual(["Curl con mancuernas", "Remo en polea"]);
    const s = L.clone(merged);
    for (const set of [0, 1, 2]) L.toggle(s, 0, set, T0);
    L.setFocus(s, 0);
    L.skipRest(s);
    L.advanceIfDone(s);
    expect(s.focus).toBe(3);
    const mine = L.clone(before);
    mine.exercises[1]!.skipped = true;
    expect(L.merge(mine, mine).state.focus).toBe(1);
  });

  test("counts and the Live Activity leave skipped out", () => {
    const { before, remote } = skippedByCoach();
    const merged = L.merge(remote, before).state;
    expect(L.setsTotal(before)).toBe(11);
    expect(L.setsTotal(merged)).toBe(6);
    const activity = activityState(merged, { now: T0 });
    expect(activity.setsTotal).toBe(6);
    expect(activity.exerciseName).toBe("Press de banca");
  });

  test("the undo toast names what the Coach skipped", () => {
    const { before, remote } = skippedByCoach();
    expect(L.coachSummary(before, remote)).toBe("Se saltó Curl con mancuernas y Remo en polea en otro dispositivo");
    const three = L.clone(remote);
    three.exercises[3]!.skipped = true;
    three.exercises[0]!.skipped = true;
    expect(L.coachSummary(before, three)).toBe("Se saltó Press de banca, Curl con mancuernas y 2 más en otro dispositivo");
    expect(L.coachSummary(before, before)).toBe("La sesión cambió en otro dispositivo");
  });

  test("target edits respect done sets", () => {
    const s = state();
    L.toggle(s, 0, 0, T0);
    L.toggle(s, 0, 1, T0);
    L.updateTarget(s, 0, { sets: 1, repMin: 8, repMax: 10, weightKg: 85, restSeconds: 90 });
    expect(s.exercises[0]!.sets.map((x) => x.weightKg)).toEqual([80, 80]);
    L.updateTarget(s, 0, { sets: 4, repMin: 8, repMax: 10, weightKg: 85, restSeconds: 90 });
    expect(s.exercises[0]!.sets.map((x) => x.weightKg)).toEqual([80, 80, 85, 85]);
    expect(s.exercises[0]!.sets.map((x) => x.reps)).toEqual([8, 8, 8, 8]);
    expect(s.exercises[0]!.restSeconds).toBe(90);
  });

  test("swap with nothing logged replaces in place", () => {
    const s = state();
    expect(L.swap(s, 0, rowing, 50)).toBe(0);
    const ex = s.exercises[0]!;
    expect(ex.id).toBe("pe1");
    expect(ex.exerciseId).toBe("remo-polea");
    expect([ex.repMin, ex.repMax, ex.restSeconds]).toEqual([6, 8, 120]);
    expect(ex.sets.map((x) => x.weightKg)).toEqual([50, 50, 50]);
    expect(ex.hint).toBeNull();
  });

  test("swap after logged sets keeps them with the exercise performed", () => {
    const s = state();
    L.toggle(s, 0, 0, T0);
    expect(L.swap(s, 0, rowing, 0)).toBe(1);
    expect(s.focus).toBe(1);
    expect(s.exercises.map((x) => x.exerciseId)).toEqual(["press-banca", "remo-polea", "curl-mancuernas", "cinta"]);
    expect(s.exercises[0]!.sets).toHaveLength(1);
    expect(s.exercises[1]!.sets).toHaveLength(2);
    expect(s.exercises[1]!.id).not.toBe("pe1");
    expect(L.finishedSession(s, at(600)).sets.map((x) => x.exerciseId)).toEqual(["press-banca"]);
  });

  test("swap between strength and cardio", () => {
    const s = state();
    L.swap(s, 1, { id: "bici", name: "Bici", equipment: "machine", kind: "cardio", modality: "bike" }, 0);
    expect(L.isCardio(s.exercises[1]!)).toBe(true);
    expect(s.exercises[1]!.sets).toEqual([]);
    L.swap(s, 2, rowing, 40);
    expect(s.exercises[2]!.sets).toHaveLength(3);
    expect(s.exercises[2]!.cardio).toBeNull();
  });
});

describe("merging the engine's copy", () => {
  test("keeps what the phone logged and the exercise on screen", () => {
    const local = state();
    L.toggle(local, 0, 0, T0);
    L.setFocus(local, 1);
    const remote = L.clone(local);
    remote.exercises[0]!.sets[0]!.doneAt = null;
    remote.exercises.unshift(L.fresh(rowing, 40, { id: "new" }));
    remote.version = 3;
    remote.focus = 0;
    remote.restStartedAt = null;
    remote.restEndsAt = null;
    const { state: merged, keptLocal } = L.merge(remote, local);
    expect(keptLocal).toBe(true);
    expect(merged.version).toBe(3);
    expect(merged.exercises.map((x) => x.id)).toEqual(["new", "pe1", "pe2", "pe3"]);
    expect(merged.exercises[1]!.sets[0]!.doneAt).not.toBeNull();
    expect(L.focused(merged)?.id).toBe("pe2");
    expect(merged.restEndsAt).toBe(local.restEndsAt);
    const same = L.merge(local, local);
    expect(same.keptLocal).toBe(false);
    expect(same.state).toEqual(local);
  });
});

describe("supersets", () => {
  const paired = () => {
    const d = structuredClone(torso);
    d.exercises[0]!.supersetId = "a";
    d.exercises[1]!.supersetId = "a";
    return L.fromDay(d, "p", {}, T0);
  };
  const group = { start: 0, end: 2 };

  test("alternates and rests after the round", () => {
    const s = paired();
    expect(L.supersetOf(s, 0)).toEqual(group);
    expect(L.current(s)).toEqual({ exercise: 0, set: 0 });
    L.toggle(s, 0, 0, T0);
    expect(s.focus).toBe(1);
    expect(s.restEndsAt).toBeNull();
    L.toggle(s, 1, 0, at(30));
    expect(s.focus).toBe(0);
    expect(s.restEndsAt).toBe(at(90));
    L.toggle(s, 0, 1, at(200));
    L.toggle(s, 1, 1, at(230));
    expect(L.current(s)).toEqual({ exercise: 0, set: 2 });
    L.toggle(s, 0, 2, at(400));
    expect(s.restEndsAt).toBe(at(520));
  });

  test("is one screen", () => {
    const s = paired();
    expect(L.blocks(s)).toEqual([group, { start: 2, end: 3 }]);
    expect(L.blockOf(s, 1)).toEqual(group);
    expect(L.rounds(s, group)).toBe(3);
    expect(L.nextPending(s, 0)).toBe(2);
    expect(L.nextPending(s, 1)).toBe(2);
  });

  test("a round logs each member, then one rest", () => {
    const s = paired();
    L.setWeight(s, 1, 0, 12);
    L.completeRound(s, group, 0, T0);
    expect(s.exercises[0]!.sets[0]!.doneAt).toBe(T0);
    expect(s.exercises[1]!.sets[0]!.doneAt).toBe(T0 + 1);
    expect(s.exercises[1]!.sets[1]!.weightKg).toBe(12);
    expect(s.restEndsAt).toBe(at(60));
    expect(L.currentRound(s, group)).toBe(1);
    L.undoRound(s, group, 0);
    expect(L.setsDone(s)).toBe(0);
    expect(s.restEndsAt).toBeNull();
    L.completeRound(s, group, 0, T0);
    L.completeRound(s, group, 1, at(200));
    L.completeRound(s, group, 2, at(400));
    expect(L.exerciseDone(s.exercises[0]!) && L.exerciseDone(s.exercises[1]!)).toBe(true);
    expect(L.currentRound(s, group)).toBeNull();
    expect(s.restEndsAt).toBe(at(520));
    L.skipRest(s);
    expect(L.advanceIfDone(s)).toBe(true);
    expect(s.focus).toBe(2);
  });

  test("a round leaves a skipped member alone", () => {
    const s = paired();
    L.setSkipped(s, 1, true);
    L.completeRound(s, group, 0, T0);
    expect(L.isDone(s.exercises[0]!.sets[0]!)).toBe(true);
    expect(L.isDone(s.exercises[1]!.sets[0]!)).toBe(false);
    expect(L.advanceIfDone(s)).toBe(false);
    L.addRound(s, group);
    expect(s.exercises.map((x) => x.sets.length)).toEqual([4, 2, 0]);
  });

  test("ids normalize and survive the JSON", () => {
    const f = [false, false, false, false];
    expect(normalize(["a", null, "a", "a"], f)).toEqual([null, null, "a", "a"]);
    expect(normalize(["a", "a"], [false, true])).toEqual([null, null]);
    expect(pair(1, 0, [null, null, null], [false, false, false])?.slice(0, 2).every((x) => x != null)).toBe(true);
    expect(pair(0, 2, [null, null, null], [false, false, false])).toBeNull();
    expect(unpair(0, ["a", "a", "a"], [false, false, false])).toEqual([null, "a", "a"]);
    expect([...labels(["x", "x", null, "y", "y"]).entries()]).toEqual([["x", 1], ["y", 2]]);
    const s = paired();
    L.move(s, [1], 3);
    expect(s.exercises.map((x) => x.supersetId)).toEqual([null, null, null]);
    expect(L.fromWire(L.toWire(paired())).exercises.map((x) => x.supersetId)).toEqual(["a", "a", null]);
  });

  test("split keeps the sets logged and moves focus to the member with sets left", () => {
    const s = paired();
    L.completeAll(s, 1, T0);
    L.setFocus(s, 1);
    L.splitSuperset(s, group);
    expect(s.exercises.map((x) => x.supersetId)).toEqual([null, null, null]);
    expect(s.focus).toBe(0);
    expect(L.setsDone(s)).toBe(2);
  });

  test("a round can go only when its sets are open and it isn't the only one", () => {
    const s = paired();
    expect(L.canRemoveRound(s, group)).toBe(true);
    L.removeRound(s, group);
    expect(s.exercises.map((x) => x.sets.length)).toEqual([2, 2, 0]);
    L.removeRound(s, group);
    L.removeRound(s, group);
    expect(s.exercises.map((x) => x.sets.length)).toEqual([1, 1, 0]);
    expect(L.canRemoveRound(s, group)).toBe(false);
  });
});

describe("logging all and effort", () => {
  test("complete-all logs the rest in order with one rest", () => {
    const s = state();
    L.toggle(s, 0, 0, at(10));
    L.setWeight(s, 0, 2, 85);
    L.completeAll(s, 0, at(200));
    expect(L.exerciseDone(s.exercises[0]!)).toBe(true);
    expect(s.exercises[0]!.sets.map((x) => x.weightKg)).toEqual([80, 80, 85]);
    const saved = L.finishedSession(s, at(400)).sets.filter((x) => x.exerciseId === "press-banca");
    expect(saved.map((x) => x.setIndex)).toEqual([0, 1, 2]);
    expect(saved.map((x) => x.weightKg)).toEqual([80, 80, 85]);
    expect(s.restStartedAt).toBe(at(200));
    expect(s.restEndsAt).toBe(at(320));
  });

  test("effort goes on the done sets only", () => {
    const s = state();
    L.toggle(s, 0, 0, T0);
    L.toggle(s, 0, 1, at(1));
    L.setEffort(s, 0, 7);
    expect(s.exercises[0]!.sets.map((x) => x.rpe)).toEqual([7, 7, null]);
    expect(L.effort(s.exercises[0]!)).toBe(7);
    L.setEffort(s, 0, 14);
    expect(L.effort(s.exercises[0]!)).toBe(10);
    L.setEffort(s, 0, null);
    expect(L.effort(s.exercises[0]!)).toBeNull();
  });

  test("rest set while resting, from its start", () => {
    const s = state();
    L.toggle(s, 0, 0, T0);
    L.setRest(s, 60, at(10));
    expect(s.exercises[0]!.restSeconds).toBe(60);
    expect(s.restEndsAt).toBe(at(60));
    L.setRest(s, 5, at(10));
    expect(s.restEndsAt).toBeNull();
    L.toggle(s, 0, 1, at(20));
    L.extendRest(s, 15, at(21));
    expect(s.restEndsAt).toBe(at(20 + 5 + 15));
    L.extendRest(s, -60, at(21));
    expect(s.restEndsAt).toBeNull();
  });
});

describe("cardio and the saved session", () => {
  test("the session includes cardio and RPE", () => {
    const s = state();
    L.toggle(s, 0, 0, at(20));
    L.setEffort(s, 0, 9);
    const block = log("cinta", 480, 1_700_000, { distanceKm: 1.6, inclinePercent: 1, avgHr: 152, kcal: 90 });
    L.logCardio(s, 2, block);
    L.logCardio(s, 0, block);
    expect(s.exercises[0]!.cardioLog).toBeNull();
    const session = L.finishedSession(s, at(1_800));
    expect(session.sets).toHaveLength(1);
    expect(session.sets[0]!.rpe).toBe(9);
    expect(session.cardio).toEqual([block]);
    expect(session.endedAt).toBe(2_800_000);
    expect(L.hasWork(s)).toBe(true);
    L.clearCardioLog(s, 2);
    expect(L.finishedSession(s, T0).cardio).toEqual([]);
  });

  test("interval phases", () => {
    const intervals = { rounds: 3, workSeconds: 30, restSeconds: 90, workLabel: "Sprint" };
    expect(phases(intervals)).toHaveLength(6);
    expect(phases(intervals).at(-1)?.end).toBe(360);
    expect(phaseAt(10, intervals)?.label).toBe("Sprint");
    const recovery = phaseAt(45, intervals);
    expect([recovery?.label, recovery?.round, recovery?.work]).toEqual(["Suave", 1, false]);
    expect(phaseAt(125, intervals)?.round).toBe(2);
    expect(phaseAt(360, intervals)).toBeNull();
    expect(totalSeconds({ durationMinutes: 99, intervals })).toBe(360);
    expect(totalSeconds({ durationMinutes: 20 })).toBe(1_200);
    expect(phases({ rounds: 2, workSeconds: 20, restSeconds: 0 })).toHaveLength(2);
  });

  test("cues for each phase change ahead", () => {
    const list = cues(state().exercises[2]!, 100);
    expect(list.map((c) => c.after)).toEqual([20, 50, 140, 170, 260]);
    expect(list[0]?.title).toBe("Rápido · 0:30");
    expect(list[0]?.body).toBe("Ronda 2 de 3");
    expect(list.at(-1)?.title).toBe("Intervalos terminados");
  });

  test("clock and lock-screen status", () => {
    const clock = { exerciseId: "pe3", runningSince: at(100), accumulated: 40 };
    const s = state();
    const now = at(110);
    const status = cardioStatus(s.exercises[2]!, clock, [{ zone: 4, minBpm: 150, maxBpm: 165 }], now);
    expect(status.phase).toBe("Suave");
    expect(status.detail).toBe("Ronda 1 de 3 · Z4 · 150–165 ppm");
    expect(status.elapsedFrom?.getTime()).toBe(now - 50_000);
    expect(status.phaseEndsAt?.getTime()).toBe(now + 70_000);
    expect(status.work).toBe(false);
    const activity = activityState(s, { now, cardio: { index: 2, status } });
    expect(activity.exerciseName).toBe("Cinta");
    expect(activity.cardio).toEqual(status);
    expect(activityState(s, { now }).cardio).toBeUndefined();
    expect(zoneText(2, null)).toBe("Z2");
    expect(clockText(3_725)).toBe("1:02:05");
  });
});
