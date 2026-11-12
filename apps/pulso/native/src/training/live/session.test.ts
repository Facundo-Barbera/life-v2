import { describe, expect, test } from "bun:test";
import type { LiveSession as WireSession } from "@/contract";
import { at, rowing, T0, torso } from "./fixtures";
import { LiveSession, type LiveApi, type LiveEffects } from "./session";
import * as L from "./state";

// The controller's sync with the engine: versions, conflicts (the Coach's
// change wins, the phone's checked sets stay), the Coach's undo, the Watch's edits.

/** An engine that keeps one copy and bumps its version on every write, like the real one. */
function fakeEngine() {
  let copy: WireSession | null = null;
  const calls: string[] = [];
  const api: LiveApi = {
    async put(session, baseVersion) {
      calls.push(`put@${baseVersion}`);
      if (copy && copy.id === session.id && copy.version > baseVersion) return { session: copy, conflict: true };
      copy = { ...session, version: (copy?.version ?? 0) + 1, updatedAt: session.updatedAt };
      return { session: copy, conflict: false };
    },
    async get() {
      calls.push("get");
      return copy;
    },
    async end() {
      calls.push("end");
      copy = null;
    },
  };
  /** The Coach editing the engine's copy (edit_live_session). */
  const coach = (change: (s: L.LiveState) => void) => {
    const s = L.fromWire(copy!);
    change(s);
    copy = { ...L.toWire(s), version: copy!.version + 1 };
  };
  return { api, calls, coach, copy: () => copy };
}

function setup(now = T0) {
  const engine = fakeEngine();
  let clock = now;
  const saved: (L.LiveState | null)[] = [];
  const haptics: string[] = [];
  const fx: LiveEffects = {
    api: () => engine.api,
    unit: () => "kg",
    now: () => clock,
    save: (s) => saved.push(s),
    haptic: (k) => haptics.push(k),
    delays: { push: 60_000, resume: 60_000, undo: 60_000, coachWait: 1 },
  };
  const live = new LiveSession(L.fromDay(torso, "p", {}, now), fx);
  return { live, engine, saved, haptics, tick: (seconds: number) => (clock += seconds * 1000) };
}

describe("the live session and the engine", () => {
  test("a new session goes out at version 0 and adopts the engine's version", async () => {
    const { live, engine } = setup();
    live.begin();
    await live.flush();
    expect(engine.calls).toEqual(["put@0"]);
    expect(live.state.version).toBe(1);
    live.toggle(0, 0);
    await live.flush();
    expect(engine.calls).toEqual(["put@0", "put@1"]);
    expect(live.state.version).toBe(2);
    expect(engine.copy()!.exercises[0]!.sets[0]!.doneAt).not.toBeNull();
  });

  test("every change is saved to disk at once", () => {
    const { live, saved } = setup();
    const before = saved.length;
    live.toggle(0, 0);
    expect(saved.length).toBeGreaterThan(before);
    expect(saved.at(-1)?.exercises[0]!.sets[0]!.doneAt).toBe(T0);
  });

  test("a conflict adopts the Coach's copy and keeps the set checked here", async () => {
    const { live, engine } = setup();
    live.begin();
    await live.flush();
    engine.coach((s) => {
      L.setSkipped(s, 1, true);
      s.exercises.push(L.fresh(rowing, 40, { id: "row" }));
    });
    live.toggle(0, 0);
    await live.flush();
    // The put met version 2 on the engine: conflict, adopt, keep the set, push back.
    expect(engine.calls.slice(0, 2)).toEqual(["put@0", "put@1"]);
    expect(live.state.exercises[1]!.skipped).toBe(true);
    expect(live.state.exercises.map((e) => e.id)).toContain("row");
    expect(L.isDone(live.state.exercises[0]!.sets[0]!)).toBe(true);
    expect(live.state.version).toBe(2);
    await live.flush();
    expect(engine.copy()!.exercises[0]!.sets[0]!.doneAt).not.toBeNull();
    expect(live.state.version).toBe(3);
  });

  test("a Coach edit made outside shows up on pull, with an undo that keeps sets checked since", async () => {
    const { live, engine, haptics } = setup();
    live.begin();
    await live.flush();
    engine.coach((s) => L.setSkipped(s, 1, true));
    await live.coachChanged();
    expect(live.state.exercises[1]!.skipped).toBe(true);
    expect(live.coachSummary).toBe("Se saltó Curl con mancuernas en otro dispositivo");
    expect(live.coachUndo).not.toBeNull();
    expect(haptics).toContain("coach");
    live.toggle(0, 0);
    live.undoCoach();
    expect(live.state.exercises[1]!.skipped).toBe(false);
    expect(L.isDone(live.state.exercises[0]!.sets[0]!)).toBe(true);
    expect(live.coachUndo).toBeNull();
  });

  test("pull changes nothing when the engine has this copy", async () => {
    const { live, engine } = setup();
    live.begin();
    await live.flush();
    const before = live.state;
    await live.pull();
    expect(live.state).toBe(before);
    expect(engine.calls.at(-1)).toBe("get");
  });

  test("a session the engine lost is given back", async () => {
    const { live, engine } = setup();
    live.begin();
    await live.flush();
    await engine.api.end(true);
    await live.pull();
    expect(engine.copy()?.id).toBe(live.state.id);
  });

  test("offline, the change waits and goes out with the next push", async () => {
    const { live, engine } = setup();
    const put = engine.api.put;
    engine.api.put = async () => {
      throw new Error("offline");
    };
    live.toggle(0, 0);
    await live.flush();
    expect(engine.copy()).toBeNull();
    engine.api.put = put;
    await live.flush();
    expect(engine.copy()?.exercises[0]!.sets[0]!.doneAt).not.toBeNull();
  });

  test("closed, nothing goes out anymore", async () => {
    const { live, engine, saved } = setup();
    live.toggle(0, 0);
    live.close();
    await live.flush();
    expect(engine.calls).toEqual([]);
    expect(saved.at(-1)).toBeNull();
  });
});

describe("the Watch's edits", () => {
  test("an edit applies unless the phone changed the same set later", () => {
    const { live, tick } = setup();
    const set = live.state.exercises[0]!.sets[0]!;
    // The Watch checked the set at t0+5; the phone hasn't touched it: it applies.
    tick(10);
    live.applyWatch({ id: "w1", sessionId: live.state.id, at: at(5), change: { kind: "set", exerciseId: "pe1", set: { ...set, doneAt: at(5), reps: 8 } } });
    expect(live.state.exercises[0]!.sets[0]!.doneAt).toBe(at(5));
    // The phone un-checks it at t0+20; a Watch edit from t0+15 loses.
    tick(10);
    live.toggle(0, 0);
    live.applyWatch({ id: "w2", sessionId: live.state.id, at: at(15), change: { kind: "set", exerciseId: "pe1", set: { ...set, doneAt: at(15) } } });
    expect(live.state.exercises[0]!.sets[0]!.doneAt).toBeNull();
    // Another session's edit is ignored.
    live.applyWatch({ id: "w3", sessionId: "other", at: at(30), change: { kind: "set", exerciseId: "pe1", set: { ...set, doneAt: at(30) } } });
    expect(live.state.exercises[0]!.sets[0]!.doneAt).toBeNull();
  });

  test("the treadmill's clock is one instant for every screen, its pauses as intervals", () => {
    const { live, tick } = setup();
    live.startCardio(2);
    const startedAt = live.state.cardioClock!.runningSince;
    expect(startedAt).toBe(T0);
    tick(30);
    live.pauseCardio();
    expect(live.state.cardioClock).toEqual({ exerciseId: "pe3", runningSince: null, accumulated: 30 });
    tick(60);
    live.startCardio(2);
    expect(live.state.cardioClock).toEqual({ exerciseId: "pe3", runningSince: at(90), accumulated: 30 });
    live.finishCardio(2, { exerciseId: "cinta", durationSeconds: 45, distanceKm: null, level: null, inclinePercent: null, avgHr: null, kcal: null, doneAt: at(105) });
    expect(live.state.cardioClock).toBeNull();
    live.close();
  });
});
