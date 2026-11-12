import { describe, expect, test } from "bun:test";
import { addDays, isoWeekday, localDate, localTime, timeOfDay, weekStart, zonedInstant } from "./dates";

describe("dates", () => {
  test("local date and time in Mexico City", () => {
    const at = new Date("2026-11-13T03:30:00Z"); // 21:30 on the 12th in CDMX (UTC-6)
    expect(localDate(at, "America/Mexico_City")).toBe("2026-11-12");
    expect(localTime(at, "America/Mexico_City")).toBe("21:30");
    expect(timeOfDay(at, "America/Mexico_City")).toBe("evening");
  });
  test("zonedInstant round-trips", () => {
    const at = zonedInstant("2026-11-12", "07:15", "America/Mexico_City");
    expect(at.toISOString()).toBe("2026-11-12T13:15:00.000Z");
    expect(localTime(at, "America/Mexico_City")).toBe("07:15");
  });
  test("weeks start on Monday", () => {
    expect(isoWeekday("2026-11-12")).toBe(4);
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
