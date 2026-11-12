import { describe, expect, test } from "bun:test";
import type { ProgramWeek, SessionInstance, SetLog, TrainingBlock, WeekDayStatus } from "@/contract";
import { blockProgress, canRepeat, cardWhen, clampPick, datedBlock, datedWeek, dayAction, dayMark, defaultPick, diffSections, selectionKey, sessionVolume, stepPick, topSets, weekCards, weekLabel, weekLines } from "./selector";

const week = (number: number, state: ProgramWeek["state"], statuses: WeekDayStatus[]): ProgramWeek => ({
  number,
  startsAt: 0,
  endsAt: 0,
  state,
  startedEarly: false,
  deload: false,
  note: null,
  days: statuses.map((status, i) => ({ dayId: `d${i + 1}`, name: `Día ${i + 1}`, status, sessions: [] })),
  done: statuses.filter((s) => s === "done" || s === "partial").length,
  other: [],
});

const block = (weeks: ProgramWeek[], current: number, extra: Partial<TrainingBlock> = {}): TrainingBlock => ({
  programId: "p",
  number: 1,
  name: "Prueba",
  goal: "",
  startedAt: 0,
  endedAt: null,
  endReason: null,
  active: true,
  resumedFrom: null,
  days: [],
  currentWeek: current,
  weekComplete: false,
  canStartNextWeek: false,
  finished: false,
  weeks,
  ...extra,
});

const six = (current: number, statuses: WeekDayStatus[]) =>
  Array.from({ length: 6 }, (_, i) => (i + 1 < current ? week(i + 1, "past", ["done", "done"]) : i + 1 === current ? week(i + 1, "current", statuses) : week(i + 1, "future", ["planned", "planned"])));

describe("defaultPick", () => {
  test("the current week's next day", () => {
    expect(defaultPick(block(six(2, ["done", "planned"]), 2), "d2")).toEqual({ week: 2, index: 1 });
  });
  test("a complete week that may move on opens the next week's first day", () => {
    const b = block(six(1, ["done", "done"]), 1, { weekComplete: true, canStartNextWeek: true });
    expect(defaultPick(b, null)).toEqual({ week: 2, index: 0 });
  });
  test("a finished program stays on its last week's last day", () => {
    const weeks: ProgramWeek[] = six(7, []).map((w) => ({ ...w, state: "past" }));
    weeks[5] = { ...weeks[5]!, state: "current" };
    const b = block(weeks, 6, { weekComplete: true, finished: true });
    expect(defaultPick(b, null)).toEqual({ week: 6, index: 1 });
  });
  test("without a next day, the first still planned", () => {
    expect(defaultPick(block(six(1, ["done", "planned"]), 1), null)).toEqual({ week: 1, index: 1 });
  });
  test("an empty block", () => {
    expect(defaultPick(block([], 1), null)).toEqual({ week: 1, index: 0 });
  });
});

describe("dayMark", () => {
  const w = week(1, "current", ["done", "partial", "missed", "planned", "planned"]);
  test("maps each status, the next day lime", () => {
    expect(w.days.map((d) => dayMark(d, w, "d4"))).toEqual(["done", "partial", "skipped", "next", "planned"]);
  });
  test("a later week's same day is never «next»", () => {
    const f = week(2, "future", ["planned"]);
    expect(dayMark(f.days[0]!, f, "d1")).toBe("planned");
  });
});

describe("stepPick", () => {
  const b = block(six(1, ["planned", "planned"]), 1);
  test("within a week", () => expect(stepPick(b, { week: 1, index: 0 }, 1)).toEqual({ week: 1, index: 1 }));
  test("into the next week's first day", () => expect(stepPick(b, { week: 1, index: 1 }, 1)).toEqual({ week: 2, index: 0 }));
  test("into the previous week's last day", () => expect(stepPick(b, { week: 3, index: 0 }, -1)).toEqual({ week: 2, index: 1 }));
  test("null at the ends", () => {
    expect(stepPick(b, { week: 1, index: 0 }, -1)).toBeNull();
    expect(stepPick(b, { week: 6, index: 1 }, 1)).toBeNull();
  });
  test("clampPick keeps a pick inside the block", () => {
    expect(clampPick(b, { week: 2, index: 9 })).toEqual({ week: 2, index: 1 });
    expect(clampPick(b, { week: 9, index: 0 })).toBeNull();
  });
});

describe("weekCards", () => {
  const b = block(six(2, ["planned", "planned"]), 2);
  test("the week's days between edge cards into the neighbouring weeks", () => {
    expect(weekCards(b, 2)).toEqual([
      { key: "edge:1:1", pick: { week: 1, index: 1 }, edge: -1 },
      { key: "2:0", pick: { week: 2, index: 0 } },
      { key: "2:1", pick: { week: 2, index: 1 } },
      { key: "edge:3:0", pick: { week: 3, index: 0 }, edge: 1 },
    ]);
  });
  test("no edge card past the block's ends", () => {
    expect(weekCards(b, 1).map((c) => c.key)).toEqual(["1:0", "1:1", "edge:2:0"]);
    expect(weekCards(b, 6).map((c) => c.key)).toEqual(["edge:5:1", "6:0", "6:1"]);
  });
  test("an edge card skips an empty week; an unknown week has no cards", () => {
    const gap = block([week(1, "current", ["planned"]), week(2, "future", []), week(3, "future", ["planned"])], 1);
    expect(weekCards(gap, 1).at(-1)).toEqual({ key: "edge:3:0", pick: { week: 3, index: 0 }, edge: 1 });
    expect(weekCards(gap, 9)).toEqual([]);
  });
});

describe("dayAction", () => {
  test("done and partial show what was lifted; missed and past can't start", () => {
    const b = block(six(2, ["planned", "planned"]), 2);
    expect(dayAction(b, b.weeks[1]!, "done")).toBe("logged");
    expect(dayAction(b, b.weeks[1]!, "partial")).toBe("logged");
    expect(dayAction(b, b.weeks[0]!, "skipped")).toBe("missed");
  });
  test("a later week starts now, unless the week is complete: then the next week first", () => {
    const open = block(six(1, ["done", "planned"]), 1);
    expect(dayAction(open, open.weeks[2]!, "planned")).toBe("start");
    const complete = block(six(1, ["done", "done"]), 1, { weekComplete: true, canStartNextWeek: true });
    expect(dayAction(complete, complete.weeks[1]!, "planned")).toBe("startWeek");
    expect(dayAction(complete, complete.weeks[2]!, "planned")).toBe("start");
  });
  test("repeat only a done day of this week", () => {
    const b = block(six(2, ["done", "planned"]), 2);
    expect(canRepeat(b.weeks[1]!, "done")).toBe(true);
    expect(canRepeat(b.weeks[0]!, "done")).toBe(false);
    expect(canRepeat(b.weeks[1]!, "partial")).toBe(false);
  });
});

test("selectionKey changes when a session moves the next day", () => {
  const b = block(six(1, ["planned", "planned"]), 1);
  expect(selectionKey(b, "d1")).not.toBe(selectionKey(b, "d2"));
  expect(selectionKey(b, "d1")).toBe(selectionKey(b, "d1"));
});

test("blockProgress counts done and partial days", () => {
  expect(blockProgress(block(six(2, ["partial", "planned"]), 2))).toBeCloseTo(3 / 12);
});

const set = (exerciseId: string, weightKg: number, reps: number, segments?: { weightKg: number; reps: number }[]): SetLog =>
  ({ exerciseId, setIndex: 0, weightKg, reps, rpe: null, doneAt: 0, ...(segments ? { segments } : {}) }) as SetLog;

test("topSets: the heaviest set per exercise in order, most reps on a tie", () => {
  const sets = [set("a", 40, 8), set("b", 20, 10), set("a", 45, 6), set("a", 45, 7), set("b", 20, 12)];
  expect(topSets(sets)).toEqual([
    { exerciseId: "a", weightKg: 45, reps: 7, sets: 3 },
    { exerciseId: "b", weightKg: 20, reps: 12, sets: 2 },
  ]);
});

test("sessionVolume sums every segment", () => {
  expect(sessionVolume({ sets: [set("a", 40, 10), set("a", 50, 5, [{ weightKg: 50, reps: 5 }, { weightKg: 30, reps: 8 }])] })).toBe(400 + 250 + 240);
});

describe("the block's plan", () => {
  test("labels the week and its deload, with what it changes", () => {
    const w = { ...week(6, "current", ["planned"]), deload: true, changes: ["Descarga: la mitad de las series"] };
    expect(weekLabel({ weeks: [w, w, w, w, w, w] }, w)).toEqual({ title: "Semana 6 de 6", deload: true });
    expect(weekLines(w)).toEqual(["Descarga: la mitad de las series"]);
    expect(weekLines({ changes: [], note: "Semana 4 de descarga." })).toEqual(["Semana 4 de descarga."]);
    expect(weekLines({ note: null })).toEqual([]);
  });

  test("a proposal's diff shows its non-empty sections, changes first", () => {
    const item = (exerciseId: string) => ({ exerciseId, name: exerciseId, detail: "3×8–12", why: null });
    const sections = diffSections({ keep: [item("a")], change: [], add: [item("b")], remove: [item("c")], structure: [] });
    expect(sections.map((s) => s.title)).toEqual(["Entra", "Sale", "Se queda"]);
  });
});

describe("cards by date (dated sessions)", () => {
  const session = (id: string, dayId: string, date: string, status: SessionInstance["status"], extra: Partial<SessionInstance> = {}): SessionInstance => ({
    id, programId: "p", templateDayId: dayId, name: `Día ${dayId.slice(1)}`, date, time: "18:00", durationMin: 60, week: 1, status, edited: false, reason: null, conflict: null, movedFrom: null, sessionId: null, ...extra,
  });
  // The Coach put Día 2 today (Monday) and Día 1 on Wednesday: cards follow the dates, not the program's order.
  const current = { ...week(1, "current", ["done", "planned", "planned"]), instances: [
    session("i0", "d3", "2032-03-01", "done", { sessionId: "s3" }),
    session("i2", "d2", "2032-03-02", "planned"),
    session("i1", "d1", "2032-03-04", "planned"),
  ] };
  current.days[2] = { ...current.days[2]!, status: "done", sessions: [{ id: "s3", dayId: "d3", name: "Día 3", startedAt: 0, endedAt: 1, sets: 9, cardioMinutes: 0 }] };

  test("a week's cards are its sessions by date, the next one marked by its instance", () => {
    const dated = datedWeek(current, "i2");
    expect(dated.days.map((d) => [d.dayId, d.status])).toEqual([["d3", "done"], ["d2", "planned"], ["d1", "planned"]]);
    expect(dated.days[0]!.sessions.map((s) => s.id)).toEqual(["s3"]);
    expect(dated.days.map((d) => dayMark(d, dated, "d1"))).toEqual(["done", "next", "planned"]);
    expect(defaultPick(datedBlock(block([current], 1), "i2"), "d2")).toEqual({ week: 1, index: 1 });
  });

  test("missed sessions show as not done; weeks without dated sessions keep their days", () => {
    const missed = datedWeek({ ...current, instances: [session("m", "d1", "2032-02-29", "missed")] }, null);
    expect(dayMark(missed.days[0]!, missed, null)).toBe("skipped");
    const plain = week(2, "future", ["planned", "planned"]);
    expect(datedWeek(plain, null)).toBe(plain);
  });

  test("when a card's session is", () => {
    const now = new Date(2032, 2, 1, 9);
    expect(cardWhen({ dayId: "d", name: "x", status: "planned", sessions: [], date: "2032-03-01", time: "18:00" }, now)).toBe("Hoy · 18:00");
    expect(cardWhen({ dayId: "d", name: "x", status: "planned", sessions: [], date: "2032-03-02", time: null }, now)).toBe("Mañana");
    expect(cardWhen({ dayId: "d", name: "x", status: "planned", sessions: [] }, now)).toBeNull();
  });
});
