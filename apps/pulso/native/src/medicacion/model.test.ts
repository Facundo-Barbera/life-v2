import { describe, expect, test } from "bun:test";
import type { DoseEvent, DoseSlot, Medication, MedicationDay } from "@/contract";
import {
  AS_NEEDED,
  adoptFrequency,
  adoptKind,
  amount,
  applyPreset,
  becomeTiming,
  draftInput,
  draftValid,
  frequencyLine,
  gap,
  heatmapColumns,
  heroText,
  historyByDay,
  historyDayTitle,
  isDue,
  isMixed,
  newDraft,
  planReminders,
  PRESETS,
  presetSummary,
  readBack,
  reminderBody,
  reminderId,
  schedule,
  scheduledLabel,
  scheduleLine,
  shortDays,
  staleReminders,
  timingOf,
  toggleDay,
  toggleMeal,
  toggleTime,
  toggleWindow,
  todayItems,
  usual,
  windowOf,
} from "./model";

const med = (over: Partial<Medication>): Medication => ({
  id: "m",
  name: "Magnesio",
  kind: "suplemento",
  dose: 1,
  unit: "cápsula",
  form: null,
  instructions: null,
  schedule: schedule({ times: ["08:00"] }),
  startDate: "2026-09-01",
  endDate: null,
  stock: null,
  lowStockThreshold: null,
  lowStock: false,
  active: true,
  notes: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const slot = (over: Partial<DoseSlot>): DoseSlot => ({
  medicationId: "m",
  name: "Magnesio",
  kind: "suplemento",
  dose: 1,
  unit: "cápsula",
  instructions: null,
  date: "2026-10-02",
  slot: "08:00",
  moment: "hora",
  time: "08:00",
  training: null,
  window: null,
  remindAt: "08:00",
  status: "pendiente",
  eventId: null,
  takenAt: null,
  ...over,
});

const event = (over: Partial<DoseEvent>): DoseEvent => ({ id: "e", medicationId: "m", date: "2026-10-02", scheduledTime: null, status: "tomada", takenAt: null, loggedAt: 0, ...over });
const at = (date: string, time: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y!, m! - 1, d!, h, mi);
};
const day = (slots: DoseSlot[]): MedicationDay => ({ date: "2026-10-02", slots, asNeeded: [], next: null });

describe("words", () => {
  test("amounts group thousands and use a decimal comma", () => {
    expect(amount(2000)).toBe("2 000");
    expect(amount(2.5)).toBe("2,5");
    expect(amount(1)).toBe("1");
  });
  test("weekdays", () => {
    expect(shortDays([1, 2, 3, 4, 5])).toBe("Entre semana");
    expect(shortDays([7, 6])).toBe("Fines de semana");
    expect(shortDays([5, 1, 3])).toBe("Lun, Mié, Vie");
  });
  test("frequency and line", () => {
    expect(frequencyLine(schedule({ days: [4], anyTime: true }))).toBe("Semanal · jueves");
    expect(frequencyLine(schedule({ interval: { every: 3, unit: "day", start: "2026-10-01" } }))).toBe("Cada 3 días");
    expect(frequencyLine(schedule({ monthDay: 5 }))).toBe("Cada mes · día 5");
    expect(frequencyLine(schedule({}))).toBeNull();
    expect(scheduleLine(schedule({ days: [4], anyTime: true }))).toBe("Semanal · jueves · cualquier hora");
    expect(scheduleLine(schedule({ times: ["08:00", "20:00"], meals: ["desayuno"] }))).toBe("08:00 y 20:00 · con el desayuno");
  });
  test("read-back", () => {
    expect(readBack(AS_NEEDED)).toBe("Cuando haga falta · sin horario ni avisos");
    expect(readBack(schedule({ days: [4], anyTime: true, reminder: "19:00" }))).toBe("Semanal · jueves · cuando quieras · aviso 19:00 si no la tomaste");
    expect(readBack(schedule({ training: { withinMinutes: 60, restDayTime: null } }))).toBe("Cada día · después de entrenar, dentro de 60 min · sin entreno, no");
  });
  test("scheduled labels", () => {
    expect(scheduledLabel("08:00")).toBe("programada 08:00");
    expect(scheduledLabel("entreno")).toBe("después de entrenar");
    expect(scheduledLabel("dia")).toBe("cualquier hora");
    expect(scheduledLabel(null)).toBe("sin horario");
  });
  test("gaps and day titles", () => {
    expect(gap(35)).toBe("35 min");
    expect(gap(80)).toBe("1 h 20 min");
    expect(gap(200)).toBe("3 h");
    expect(historyDayTitle("2026-10-02", "2026-10-02")).toBe("Hoy");
    expect(historyDayTitle("2026-10-01", "2026-10-02")).toBe("Ayer");
    expect(historyDayTitle("2026-09-29", "2026-10-02")).toBe("Martes 29 sept");
  });
});

describe("isDue", () => {
  test("weekdays and every day", () => {
    expect(isDue(schedule({}), "2026-10-02")).toBe(true);
    expect(isDue(schedule({ days: [5] }), "2026-10-02")).toBe(true); // a Friday
    expect(isDue(schedule({ days: [4] }), "2026-10-02")).toBe(false);
  });
  test("every N days from the start", () => {
    const s = schedule({ interval: { every: 3, unit: "day", start: "2026-10-01" } });
    expect(isDue(s, "2026-10-01")).toBe(true);
    expect(isDue(s, "2026-10-02")).toBe(false);
    expect(isDue(s, "2026-10-04")).toBe(true);
    expect(isDue(s, "2026-09-28")).toBe(false);
  });
  test("every 2 weeks on Sunday, counting the start's week", () => {
    const s = schedule({ days: [7], interval: { every: 2, unit: "week", start: "2026-10-01" } }); // a Thursday
    expect(isDue(s, "2026-10-04")).toBe(true);
    expect(isDue(s, "2026-10-11")).toBe(false);
    expect(isDue(s, "2026-10-18")).toBe(true);
  });
  test("a month day past the month's end is its last day", () => {
    const s = schedule({ monthDay: 31 });
    expect(isDue(s, "2026-02-28")).toBe(true);
    expect(isDue(s, "2026-03-30")).toBe(false);
    expect(isDue(s, "2026-03-31")).toBe(true);
  });
});

describe("editor", () => {
  test("adopting a frequency keeps the timing and seeds the new one", () => {
    const s = schedule({ meals: ["comida"] });
    const weekly = adoptFrequency(s, "someDays", "2026-10-02");
    expect(weekly.days).toEqual([5]);
    expect(weekly.meals).toEqual(["comida"]);
    const monthly = adoptFrequency(weekly, "monthly", "2026-10-02");
    expect(monthly.monthDay).toBe(2);
    expect(monthly.days).toEqual([]);
    expect(adoptFrequency(s, "asNeeded", "2026-10-02")).toEqual(AS_NEEDED);
    expect(adoptFrequency(AS_NEEDED, "daily", "2026-10-02").times).toEqual(["08:00"]);
    expect(adoptFrequency(s, "everyN", "2026-10-02").interval).toEqual({ every: 2, unit: "week", start: "2026-10-02" });
  });
  test("becoming a timing drops the others but keeps the days", () => {
    const s = schedule({ days: [1, 3], times: ["09:00"] });
    const t = becomeTiming(s, "training");
    expect(t.training).toEqual({ withinMinutes: 60, restDayTime: "09:00" });
    expect(t.times).toEqual([]);
    expect(t.days).toEqual([1, 3]);
    expect(timingOf(t)).toBe("training");
    expect(becomeTiming(t, "anyTime").reminder).toBeNull();
    expect(becomeTiming(s, "window").windows).toEqual([windowOf("manana")]);
  });
  test("a mixed schedule is one the editor shows only part of", () => {
    expect(isMixed(schedule({ times: ["08:00"], bedtime: true }))).toBe(true);
    expect(isMixed(schedule({ times: ["08:00", "20:00"] }))).toBe(false);
  });
  test("toggles keep at least one and stay in order", () => {
    expect(toggleTime(["08:00"], "08:00")).toEqual(["08:00"]);
    expect(toggleTime(["14:00"], "08:00")).toEqual(["08:00", "14:00"]);
    expect(toggleWindow([windowOf("noche")], "manana").map((w) => w.part)).toEqual(["manana", "noche"]);
    expect(toggleMeal(["cena"], "desayuno")).toEqual(["desayuno", "cena"]);
    expect(toggleDay([], 3)).toEqual([1, 2, 4, 5, 6, 7]);
    expect(toggleDay([1, 2, 3, 4, 5, 6], 7)).toEqual([]);
    expect(toggleDay([1, 2, 3, 4, 5, 6], 7, false)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(toggleDay([2], 2)).toEqual([2]);
  });
  test("drafts", () => {
    const d = newDraft("suplemento", "2026-10-02");
    expect(d.unit).toBe("cápsula");
    expect(draftValid(d)).toBe(false);
    expect(draftValid({ ...d, name: "Zinc" })).toBe(true);
    expect(draftValid({ ...d, name: "Zinc", schedule: schedule({ windows: [{ part: "manana", start: "12:00", end: "07:00" }] }) })).toBe(false);
    expect(adoptKind(d, "medicamento").unit).toBe("comprimido");
    expect(adoptKind({ ...d, name: "x", unit: "sobres" }, "medicamento").unit).toBe("sobres");
    const input = draftInput({ ...d, name: " Zinc ", notes: "  ", stock: null, lowStockThreshold: 7 });
    expect(input.name).toBe("Zinc");
    expect(input.notes).toBeNull();
    expect(input.lowStockThreshold).toBeNull();
  });
  test("presets", () => {
    const creatine = PRESETS[0]!;
    expect(presetSummary(creatine)).toBe("Creatina: 5 g, después de entrenar; los días sin entreno, a las 09:00.");
    const d = applyPreset({ ...newDraft("suplemento", "2026-10-02"), schedule: schedule({ days: [1], times: ["08:00"] }) }, creatine);
    expect(d.schedule.training).not.toBeNull();
    expect(d.schedule.days).toEqual([1]);
    expect(d.schedule.times).toEqual([]);
  });
});

describe("today", () => {
  const now = at("2026-10-02", "10:30");
  test("a timed slot is due now, late, or ahead", () => {
    const m = med({ schedule: schedule({ times: ["10:00", "08:00", "12:00"] }) });
    const items = todayItems([m], day([slot({ slot: "08:00", time: "08:00" }), slot({ slot: "10:00", time: "10:00" }), slot({ slot: "12:00", time: "12:00" })]), [], now);
    expect(items.map((i) => [i.at, i.state, i.line])).toEqual([
      ["08:00", "atrasada", "Se pasó hace 2 h 30 min"],
      ["10:00", "ahora", "Toca ahora"],
      ["12:00", "pendiente", "En 1 h 30 min"],
    ]);
  });
  test("taken, windows, any time and training", () => {
    const m = med({ schedule: schedule({ anyTime: true }) });
    const takenAt = at("2026-10-02", "09:56").getTime();
    const items = todayItems(
      [m],
      day([
        slot({ slot: "dia", moment: "dia", time: null }),
        slot({ slot: "manana", moment: "manana", time: "07:00", window: windowOf("manana") }),
        slot({ slot: "entreno", moment: "entreno", time: null, training: { state: "planned", plannedAt: "18:00", workoutEnd: null, until: null, fallback: "20:00" } }),
        slot({ slot: "09:00", time: "09:00", status: "tomada", takenAt }),
      ]),
      [],
      now,
    );
    const by = Object.fromEntries(items.map((i) => [i.slot!.slot, i]));
    expect(by["09:00"]!.line).toBe("Tomada a las 09:56");
    expect(by.manana!.state).toBe("ahora");
    expect(by.manana!.line).toBe("Cuando quieras hasta las 12:00");
    expect(by.dia!.state).toBe("dia");
    expect(by.entreno!.state).toBe("entreno");
    expect(by.entreno!.line).toBe("Al terminar tu sesión de las 18:00");
    // Timed first, then what waits for training or the day.
    expect(["entreno", "dia"]).toContain(items.at(-1)!.state);
  });
  test("as-needed and days off", () => {
    const levo = med({ id: "levo", name: "Levotiroxina", schedule: AS_NEEDED });
    const sema = med({ id: "sema", name: "Semaglutida", schedule: schedule({ days: [4], anyTime: true }) });
    const history = [event({ medicationId: "levo", date: "2026-10-01" })];
    const items = todayItems([levo, sema], day([]), history, now);
    expect(items.find((i) => i.id === "levo")!.line).toBe("Última ayer");
    const off = items.find((i) => i.id === "sema")!;
    expect(off.state).toBe("noToca");
    expect(off.when).toBe("Jueves · cualquier hora");
    expect(off.line).toBe("próxima: jue 8 oct");
  });
  test("an intake outside a slot is its own taken row", () => {
    const m = med({ schedule: schedule({ times: ["08:00"] }) });
    const items = todayItems([m], day([slot({})]), [event({ id: "x", takenAt: at("2026-10-02", "09:00").getTime() })], now);
    expect(items.some((i) => i.id === "x" && i.when === "Fuera de horario")).toBe(true);
  });
  test("usual as-needed meds and the hero", () => {
    const levo = med({ id: "levo", name: "Levotiroxina", schedule: AS_NEEDED });
    const history = [1, 2, 3, 4].map((n) => event({ id: `e${n}`, medicationId: "levo", date: `2026-09-${30 - n}` }));
    const items = todayItems([levo], day([]), history, now);
    const names = usual(items, [], history, now);
    expect(names).toEqual(["Levotiroxina"]);
    const hero = heroText(items, names);
    expect(hero.headline).toBe("Nada programado");
    expect(hero.usualLine).toBe("Levotiroxina cuando la tomes");
    expect(hero.free).toBe(true);
  });
  test("the hero counts what's left", () => {
    const m = med({ schedule: schedule({ times: ["08:00", "12:00"] }) });
    const items = todayItems([m], day([slot({ status: "tomada", takenAt: at("2026-10-02", "08:05").getTime() }), slot({ slot: "12:00", time: "12:00" })]), [], now);
    const hero = heroText(items, []);
    expect(hero.left).toBe(1);
    expect(hero.progress).toBe(0.5);
    expect(hero.headline).toBe("Te falta: Magnesio");
    expect(hero.takenLine).toBe("Tomado hoy: Magnesio 08:05");
  });
});

describe("history and heatmap", () => {
  test("by day, newest first", () => {
    const groups = historyByDay([event({ id: "a", date: "2026-10-01", takenAt: 1 }), event({ id: "b", date: "2026-10-02", takenAt: 2 }), event({ id: "c", date: "2026-10-02", takenAt: 3 })]);
    expect(groups.map((g) => [g.date, g.doses.map((d) => d.id)])).toEqual([
      ["2026-10-02", ["c", "b"]],
      ["2026-10-01", ["a"]],
    ]);
  });
  test("heatmap columns start on Monday", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((date) => ({ date }));
    const cols = heatmapColumns(days);
    expect(cols.length).toBe(2);
    expect(cols[0]!.slice(0, 4)).toEqual([null, null, null, { date: "2026-10-01" }]); // a Thursday
    expect(cols[1]![0]).toEqual({ date: "2026-10-05" });
    expect(cols[1]!.length).toBe(7);
  });
});

describe("reminders", () => {
  const now = at("2026-10-02", "10:30").getTime();
  test("timed slots fire at their time, flexible ones at remindAt, waiting ones at the fallback", () => {
    const plan = planReminders(
      [
        slot({ slot: "08:00", time: "08:00" }),
        slot({ slot: "12:00", time: "12:00", instructions: "con agua" }),
        slot({ slot: "dia", moment: "dia", time: null, remindAt: "19:00" }),
        slot({ slot: "manana", moment: "manana", time: "07:00", remindAt: "07:00", window: windowOf("manana") }),
        slot({ slot: "entreno", moment: "entreno", time: null, training: { state: "planned", plannedAt: "18:00", workoutEnd: null, until: null, fallback: "20:00" } }),
        slot({ slot: "13:00", time: "13:00", status: "tomada" }),
      ],
      now,
    );
    expect(plan.map((r) => [r.slot, new Date(r.fireAt).getHours()])).toEqual([
      ["12:00", 12],
      ["dia", 19],
      ["entreno", 20],
    ]);
    expect(plan[0]!.body).toBe("1 cápsula · con agua");
    expect(plan[2]!.title).toBe("Toma tu magnesio");
  });
  test("a finished workout catches up once, within its window", () => {
    const trained = slot({ slot: "entreno", moment: "entreno", time: "10:00", training: { state: "trained", workoutEnd: "10:00", until: "11:00", plannedAt: null, fallback: null } });
    const plan = planReminders([trained], now);
    expect(plan[0]!.catchUp).toBe(true);
    expect(plan[0]!.fireAt - now).toBe(5_000);
    expect(planReminders([trained], now, new Set(["m|2026-10-02|entreno"]))).toEqual([]);
    expect(reminderBody(trained)).toBe("1 cápsula · antes de las 11:00");
  });
  test("stale requests: every plain one, snoozes only once handled", () => {
    const open = slot({ slot: "12:00", time: "12:00", status: "pospuesta" });
    const base = reminderId(open);
    const done = reminderId(slot({ slot: "08:00" }));
    expect(staleReminders([base, `${base}.snooze`, `${done}.snooze`, `${done}.catchup`, "pulso.training.rest"], [open])).toEqual([base, `${done}.snooze`, `${done}.catchup`]);
  });
});
