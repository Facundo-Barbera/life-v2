import { describe, expect, test } from "bun:test";
import fixtures from "./swift-fixtures.json";
import { decodeWatchMessage, encodeWatchMessage, type WatchMessage } from "./messages";

// The fixtures are what the Swift side (WatchShared, unchanged) actually encodes.
const T0 = 1_792_620_000_000; // the generator's t0

describe("Watch messages, against Swift's own encoding", () => {
  for (const [name, wire] of Object.entries(fixtures)) {
    test(`${name}: decodes, and encodes back byte-equivalent`, () => {
      const message = decodeWatchMessage(JSON.stringify(wire));
      expect(message?.kind).toBe(name as WatchMessage["kind"]);
      expect(JSON.parse(encodeWatchMessage(message!))).toEqual(wire);
    });
  }

  test("Swift dates are seconds since 2001, read as real instants", () => {
    const metrics = decodeWatchMessage(JSON.stringify(fixtures.metrics));
    if (metrics?.kind !== "metrics") throw new Error("not metrics");
    expect(metrics.metrics.elapsedFrom?.getTime()).toBe(T0);
    const edits = decodeWatchMessage(JSON.stringify(fixtures.edits));
    if (edits?.kind !== "edits") throw new Error("not edits");
    expect(edits.edits[0]?.at.getTime()).toBe(T0 + 61_000);
    // The session inside keeps the contract's epoch ms.
    const start = edits.edits.find((e) => "start" in e.change)?.change;
    expect(start && "start" in start ? start.start._0.startedAt : null).toBe(T0);
  });

  test("anything else is not a message", () => {
    expect(decodeWatchMessage("nope")).toBeNull();
    expect(decodeWatchMessage(JSON.stringify({ hello: {} }))).toBeNull();
  });
});
