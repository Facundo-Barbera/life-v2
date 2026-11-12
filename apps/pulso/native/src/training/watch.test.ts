import { describe, expect, test } from "bun:test";
import { decodeWatchMessage, encodeWatchMessage, type WatchMessage, type WatchMetrics } from "../../modules/pulso-watch/src/messages";
import { T0, torso } from "./live/fixtures";
import { LiveSession } from "./live/session";
import * as L from "./live/state";
import { STRENGTH_STAGE } from "./live/sync";
import { WatchLink, type WatchMemory } from "./watch";

// SwiftUI's WatchLink, on the phone: who records, the Watch's edits applied and acknowledged, the plan.

function setup(opts: { phoneAvailable?: boolean } = {}) {
  const sent: WatchMessage[] = [];
  const follows: string[] = [];
  const finishes: string[] = [];
  let onMessage: (m: WatchMessage) => void = () => {};
  let memory: WatchMemory = { applied: [], recorded: null, phoneRecords: true };
  let live: LiveSession | null = null;
  const adopted: L.LiveState[] = [];
  const fx = { api: () => null, unit: () => "kg" as const, now: () => T0, save: () => {} };
  const link = new WatchLink({
    watch: {
      send: (m) => (sent.push(m), true),
      publish: () => true,
      startWatchApp: async () => {},
      onMessage: (l) => ((onMessage = l), () => {}),
      onState: () => () => {},
    },
    phone: {
      available: opts.phoneAvailable ?? true,
      follow: async (id, stage, o) => void follows.push(`${id}:${stage.activity}:${o.paused}`),
      finish: async (id, save) => void finishes.push(`${id}:${save}`),
      recover: async () => {},
      metrics: () => null,
      onMetrics: () => () => {},
    },
    host: {
      live: () => live,
      plan: () => (live ? null : { day: torso, programId: "p", suggestions: {} }),
      unit: () => "kg",
      hrZones: () => null,
      adoptFromWatch: (s) => {
        adopted.push(s);
        live = new LiveSession(s, fx);
      },
      setUnit: () => {},
      finish: async () => {},
      discard: async () => {},
    },
    memory: { load: () => memory, save: (m) => void (memory = m) },
    watchWaitMs: 5,
    publishDelayMs: 0,
  });
  link.activate();
  const start = () => {
    live = new LiveSession(L.fromDay(torso, "p", {}, T0), fx);
    return live;
  };
  const wait = (ms = 15) => new Promise((r) => setTimeout(r, ms));
  return { link, sent, follows, finishes, receive: (m: WatchMessage) => onMessage(m), start, wait, memory: () => memory, adopted, live: () => live };
}

const metrics: WatchMetrics = { stage: STRENGTH_STAGE, heartRate: 120, activeKcal: 10, paused: false };

describe("who records", () => {
  test("the Watch answering takes the recording", async () => {
    const t = setup();
    const live = t.start();
    t.link.began(live.state.id, true);
    t.receive({ kind: "metrics", metrics });
    expect(t.link.recorder).toBe("watch");
    await t.wait();
    expect(t.link.recorder).toBe("watch");
    expect(t.link.recordedFor(live.state.id)?.strength).toBe(true);
    expect(t.follows).toEqual([]);
  });

  test("silence, and the iPhone records, following the session", async () => {
    const t = setup();
    const live = t.start();
    t.link.began(live.state.id, true);
    await t.wait();
    expect(t.link.recorder).toBe("phone");
    await t.wait();
    expect(t.follows.at(-1)).toBe(`${live.state.id}:50:false`);
    // The Watch late: its numbers don't take the recording back.
    t.receive({ kind: "metrics", metrics });
    expect(t.link.recorder).toBe("phone");
    const done = t.link.ended(live.state.id, true);
    expect(done?.by).toBe("phone");
    expect(t.finishes).toEqual([`${live.state.id}:true`]);
  });

  test("without the phone setting, nobody records", async () => {
    const t = setup();
    t.link.phoneRecords = false;
    const live = t.start();
    t.link.began(live.state.id, true);
    await t.wait();
    expect(t.link.recorder).toBeNull();
  });
});

describe("to and from the Watch", () => {
  test("without a session the Watch gets the plan; with one, the session, in Swift's encoding", async () => {
    const t = setup();
    await t.wait();
    const first = t.sent.at(-1);
    expect(first?.kind === "sync" && first.sync.plan?.day.id).toBe("d1");
    const live = t.start();
    t.link.publish();
    await t.wait();
    const last = t.sent.at(-1)!;
    expect(last.kind === "sync" && last.sync.state?.id).toBe(live.state.id);
    // Round trip through the wire the Swift side reads.
    const back = decodeWatchMessage(encodeWatchMessage(last));
    expect(back?.kind === "sync" && back.sync.state).toEqual(L.toWire(live.state));
  });

  test("an edit applies once, is acknowledged, and a replay changes nothing", async () => {
    const t = setup();
    const live = t.start();
    const set = live.state.exercises[0]!.sets[0]!;
    const wire = { id: "e1", sessionId: live.state.id, at: new Date(T0 + 5_000), change: { set: { exerciseId: "pe1", set: { ...L.setToWire(set), doneAt: T0 + 5_000 } } } };
    t.receive({ kind: "edits", edits: [wire] });
    await t.wait();
    expect(live.state.exercises[0]!.sets[0]!.doneAt).toBe(T0 + 5_000);
    const ack = t.sent.at(-1)!;
    expect(ack.kind === "sync" && ack.sync.applied).toContain("e1");
    expect(t.memory().applied).toEqual(["e1"]);
    live.toggle(0, 0);
    t.receive({ kind: "edits", edits: [wire] });
    await t.wait();
    expect(live.state.exercises[0]!.sets[0]!.doneAt).toBeNull();
  });

  test("a session started on the Watch is adopted", async () => {
    const t = setup();
    const state = L.fromDay(torso, "p", {}, T0);
    t.receive({ kind: "edits", edits: [{ id: "s1", sessionId: state.id, at: new Date(T0), change: { start: { _0: L.toWire(state) } } }] });
    await t.wait();
    expect(t.adopted.map((s) => s.id)).toEqual([state.id]);
  });
});
