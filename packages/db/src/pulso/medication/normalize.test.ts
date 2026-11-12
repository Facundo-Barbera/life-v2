import { expect, test } from "bun:test";
import { normalizeSchedule, readSchedule } from "./normalize";
import { isDueOn, resolveSlots } from "./schedule";
import { readBack, scheduleLine, unitFor } from "./wording";

const THU = "2034-06-01"; // a Thursday

test("as-needed drops everything else; a scheduled one needs a when", () => {
  expect(normalizeSchedule({ asNeeded: true, times: ["08:00"] }, THU)).toMatchObject({ asNeeded: true, times: [] });
  expect(() => normalizeSchedule({ days: [1] }, THU)).toThrow(/Elige cuándo/);
  expect(() => normalizeSchedule({ times: ["8:00"] }, THU)).toThrow(/HH:MM/);
});

test("one frequency is kept, with defaults filled", () => {
  // all 7 days = every day
  expect(normalizeSchedule({ times: ["08:00", "08:00", "07:00"], days: [1, 2, 3, 4, 5, 6, 7] }, THU)).toMatchObject({ times: ["07:00", "08:00"], days: [] });
  // weeks without days fall on the start's weekday
  expect(normalizeSchedule({ anyTime: true, interval: { every: 2, unit: "week" } }, THU)).toMatchObject({ days: [4], interval: { every: 2, unit: "week", start: THU }, reminder: "19:00" });
  // every 1 day is every day
  expect(normalizeSchedule({ times: ["09:00"], interval: { every: 1, unit: "day" } }, THU).interval).toBeNull();
  // month day wins over an interval
  expect(normalizeSchedule({ times: ["09:00"], monthDay: 31, interval: { every: 3, unit: "day" } }, THU)).toMatchObject({ monthDay: 31, interval: null });
  // any-time reminder off with null
  expect(normalizeSchedule({ anyTime: true, reminder: null }, THU).reminder).toBeNull();
});

test("windows get their default ranges and may not repeat", () => {
  const s = normalizeSchedule({ windows: [{ part: "noche" }, { part: "manana", start: "06:30" }] }, THU);
  expect(s.windows).toEqual([{ part: "manana", start: "06:30", end: "12:00" }, { part: "noche", start: "19:00", end: "23:00" }]);
  expect(() => normalizeSchedule({ windows: [{ part: "tarde" }, { part: "tarde" }] }, THU)).toThrow(/una vez/);
  expect(() => normalizeSchedule({ windows: [{ part: "tarde", start: "18:00", end: "13:00" }] }, THU)).toThrow(/antes de terminar/);
});

test("frequencies fall on the right days", () => {
  const every3 = normalizeSchedule({ times: ["09:00"], interval: { every: 3, unit: "day" } }, THU);
  expect([0, 1, 2, 3, 6].map((d) => isDueOn(every3, `2034-06-0${1 + d}`))).toEqual([true, false, false, true, true]);
  const monthly = normalizeSchedule({ anyTime: true, monthDay: 31 }, THU);
  expect(isDueOn(monthly, "2034-06-30")).toBe(true);
  expect(isDueOn(monthly, "2034-07-30")).toBe(false);
  expect(isDueOn(monthly, "2034-07-31")).toBe(true);
});

test("older stored schedules read with newer parts off", () => {
  const s = readSchedule({ asNeeded: false, times: ["08:00"], days: [] });
  expect(s).toMatchObject({ windows: [], anyTime: false, interval: null, monthDay: null, training: null, meals: [], bedtime: false });
  const med = { schedule: s, startDate: THU, endDate: null, active: true };
  expect(resolveSlots(med, THU).map((x) => x.slot)).toEqual(["08:00"]);
});

test("schedules in words", () => {
  expect(scheduleLine(normalizeSchedule({ times: ["08:00", "20:00"], days: [1, 3, 5] }, THU))).toBe("L X V · 08:00 y 20:00");
  expect(scheduleLine(normalizeSchedule({ anyTime: true, days: [4] }, THU))).toBe("Semanal · jueves · cualquier hora");
  expect(readBack(normalizeSchedule({ training: { restDayTime: "09:00" } }, THU))).toBe("Cada día · después de entrenar, dentro de 60 min · sin entreno, a las 09:00");
  expect(unitFor(1, "cápsulas")).toBe("cápsula");
  expect(unitFor(2, "cápsula")).toBe("cápsulas");
});
