import { describe, expect, test } from "bun:test";
import { clockText, elapsed, newClock, origin, pauseClock, startClock, ticksFrom } from "../cardio";
import { at, T0, withTreadmill } from "./fixtures";
import * as L from "./state";
import { apply, cardioStage, changeKey, changes, HK, recording, STRENGTH_STAGE, wins } from "./sync";

// SwiftUI's WatchSyncTests and WorkoutClockTests (the parts on the phone), ported.

const state = () => L.fromDay(withTreadmill, "p", {}, T0);

describe("what travels to and from the Watch", () => {
  test("a Hecho travels as the set and the rest", () => {
    const before = state();
    const after = L.produce(before, (s) => L.toggle(s, 0, 0, T0));
    const list = changes(before, after);
    expect(list.map(changeKey)).toEqual([`set:${after.exercises[0]!.sets[0]!.id}`, "rest"]);
    const phone = L.clone(before);
    for (const change of list) apply(phone, change);
    expect(phone.exercises).toEqual(after.exercises);
    expect(phone.restEndsAt).toBe(after.restEndsAt);
  });

  test("the cardio clock travels with its block", () => {
    const before = state();
    const clock = startClock(newClock("pe2"), T0);
    const after = { ...L.clone(before), cardioClock: clock };
    expect(changes(before, after)).toEqual([{ kind: "cardio", exerciseId: "pe2", clock, log: null }]);
    expect(L.runningCardio(after)?.id).toBe("pe2");
    const phone = L.clone(before);
    apply(phone, { kind: "cardio", exerciseId: "pe2", clock, log: null });
    expect(phone.cardioClock).toEqual(clock);
    apply(phone, { kind: "cardio", exerciseId: "pe2", clock: null, log: { exerciseId: "cinta", durationSeconds: 900, distanceKm: null, level: null, inclinePercent: null, avgHr: null, kcal: null, doneAt: 2 } });
    expect(phone.cardioClock).toBeNull();
    expect(phone.exercises[1]!.cardioLog?.durationSeconds).toBe(900);
  });

  test("an edit for something gone is dropped", () => {
    expect(apply(state(), { kind: "set", exerciseId: "nope", set: L.newSet(1, 1) })).toBe(false);
  });

  test("the latest change wins", () => {
    expect(wins(T0, undefined)).toBe(true);
    expect(wins(T0, at(-60))).toBe(true);
    expect(wins(T0, at(60))).toBe(false);
  });

  test("the treadmill is a walk unless a running pace", () => {
    expect(cardioStage("treadmill", 5.5).activity).toBe(HK.walking);
    expect(cardioStage("treadmill", null).activity).toBe(HK.walking);
    expect(cardioStage("treadmill", 10).activity).toBe(HK.running);
    expect(cardioStage("run", null).indoor).toBe(false);
  });
});

describe("one clock for the phone, the Watch and the lock screen", () => {
  test("the cardio clock sums its running spans", () => {
    let clock = startClock(newClock("pe2"), T0);
    expect(elapsed(clock, at(9.6))).toBeCloseTo(9.6, 6);
    clock = pauseClock(clock, at(30));
    expect(elapsed(clock, at(100))).toBeCloseTo(30, 6);
    expect(origin(clock)).toBeNull();
    clock = startClock(clock, at(100));
    expect(elapsed(clock, at(105))).toBeCloseTo(35, 6);
    expect(origin(clock)).toBe(at(70));
  });

  test("both devices read the same second from the same clock", () => {
    const clock = startClock(newClock("pe2"), T0);
    const watchCopy = JSON.parse(JSON.stringify(clock));
    expect(clockText(elapsed(clock, at(9.4)))).toBe("0:09");
    expect(clockText(elapsed(watchCopy, at(9.4)))).toBe("0:09");
    expect(clockText(9.99)).toBe("0:09");
  });

  test("ticks fall on the clock's whole seconds", () => {
    const o = at(0.7);
    expect(ticksFrom(o, at(50))).toBe(o);
    const rest = at(90.3);
    const from = ticksFrom(rest, T0);
    expect(from).toBeLessThanOrEqual(T0);
    expect((rest - from) % 1000).toBe(0);
  });
});

describe("the session's one workout", () => {
  test("strength, treadmill, pause, resume, strength follow the session", () => {
    const walk = cardioStage("treadmill", 5.5);
    const s = state();
    expect(recording(s)).toEqual({ stage: STRENGTH_STAGE, paused: false, stageSince: null });
    L.setFocus(s, 1);
    s.cardioClock = startClock(newClock("pe2"), at(60));
    expect(recording(s)).toEqual({ stage: walk, paused: false, stageSince: at(60) });
    s.cardioClock = pauseClock(s.cardioClock, at(180));
    expect(recording(s)).toEqual({ stage: walk, paused: true, stageSince: null });
    s.cardioClock = startClock(s.cardioClock, at(240));
    expect(recording(s).paused).toBe(false);
    L.logCardio(s, 1, { exerciseId: "cinta", durationSeconds: elapsed(s.cardioClock, at(300)), distanceKm: null, level: null, inclinePercent: null, avgHr: null, kcal: null, doneAt: at(300) });
    expect(recording(s).stage).toEqual(STRENGTH_STAGE);
  });

  test("a paused block left behind doesn't hold the recording", () => {
    const s = state();
    L.setFocus(s, 1);
    s.cardioClock = pauseClock(startClock(newClock("pe2"), T0), at(30));
    expect(recording(s).paused).toBe(true);
    L.setFocus(s, 0);
    expect(recording(s)).toEqual({ stage: STRENGTH_STAGE, paused: false, stageSince: null });
  });
});
