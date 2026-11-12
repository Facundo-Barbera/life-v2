import { describe, expect, test } from "bun:test";
import { createGate, serial } from "./gate";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("presentation gate", () => {
  test("idle now: resolves after the settle time", async () => {
    const gate = createGate(20);
    let done = false;
    void gate.whenIdle().then(() => (done = true));
    await tick(5);
    expect(done).toBe(false);
    await tick(30);
    expect(done).toBe(true);
  });

  test("waits while something is presented, and for the settle after it closes", async () => {
    const gate = createGate(20);
    const release = gate.hold();
    let done = false;
    void gate.whenIdle().then(() => (done = true));
    await tick(40);
    expect(done).toBe(false);
    release();
    release(); // idempotent: doesn't free a second holder
    await tick(5);
    expect(done).toBe(false);
    await tick(30);
    expect(done).toBe(true);
  });

  test("a modal opening during the settle restarts the wait", async () => {
    const gate = createGate(30);
    let done = false;
    void gate.whenIdle().then(() => (done = true));
    await tick(10);
    const release = gate.hold();
    await tick(40);
    expect(done).toBe(false);
    release();
    await tick(45);
    expect(done).toBe(true);
  });

  test("not while the app is in the background", async () => {
    const gate = createGate(10);
    gate.setActive(false);
    let done = false;
    void gate.whenIdle().then(() => (done = true));
    await tick(30);
    expect(done).toBe(false);
    gate.setActive(true);
    await tick(25);
    expect(done).toBe(true);
  });

  test("two holders: idle only when both release", () => {
    const gate = createGate(10);
    const a = gate.hold();
    const b = gate.hold();
    a();
    a();
    expect(gate.idle()).toBe(false);
    b();
    expect(gate.idle()).toBe(true);
  });
});

describe("serial", () => {
  test("one task at a time, in order, past a failure", async () => {
    const run = serial();
    const log: string[] = [];
    const task = (name: string, ms: number, fail = false) => async () => {
      log.push(`start ${name}`);
      await tick(ms);
      log.push(`end ${name}`);
      if (fail) throw new Error(name);
      return name;
    };
    const a = run(task("a", 20, true));
    const b = run(task("b", 5));
    await expect(a).rejects.toThrow("a");
    expect(await b).toBe("b");
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });
});
