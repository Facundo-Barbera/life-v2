import { expect, test } from "bun:test";
import { SLEEP, nightWindow, summarizeNight } from "./sleep";

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m);

test("sums stages and counts overlapping sources once", () => {
  const night = summarizeNight([
    { startDate: at(0), endDate: at(2), value: SLEEP.asleepCore },
    { startDate: at(1), endDate: at(3), value: SLEEP.asleepCore }, // a second source, overlapping
    { startDate: at(3), endDate: at(4), value: SLEEP.asleepDeep },
    { startDate: at(4), endDate: at(4, 30), value: SLEEP.asleepREM },
    { startDate: at(4, 30), endDate: at(4, 40), value: SLEEP.awake },
    { startDate: at(0), endDate: at(5), value: SLEEP.inBed },
  ]);
  expect(night).toEqual({ asleepMinutes: 270, core: 180, deep: 60, rem: 30, awake: 10 });
});

test("no asleep samples is no night", () => {
  expect(summarizeNight([{ startDate: at(0), endDate: at(1), value: SLEEP.inBed }])).toBeNull();
});

test("the night window starts at 18:00 the day before", () => {
  const { startDate } = nightWindow(at(9));
  expect([startDate.getDate(), startDate.getHours()]).toEqual([20, 18]);
});
