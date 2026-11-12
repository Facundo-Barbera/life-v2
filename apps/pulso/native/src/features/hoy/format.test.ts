import { describe, expect, test } from "bun:test";
import { briefSegments, dayMeta, headerDate, hm, localDate, readinessWord } from "./format";

describe("hoy format", () => {
  test("the mono date line and local keys", () => {
    const d = new Date(2026, 9, 21, 7, 5);
    expect(headerDate(d)).toBe("MIÉ 21 OCT");
    expect(localDate(d)).toBe("2026-10-21");
  });
  test("sleep minutes as h:mm", () => {
    expect(hm(444)).toBe("7:24");
    expect(hm(-31)).toBe("0:31");
  });
  test("the readiness pill turns to winding down at night", () => {
    expect(readinessWord("high", new Date(2026, 9, 21, 7))).toBe("LISTO PARA EMPUJAR");
    expect(readinessWord("high", new Date(2026, 9, 21, 21))).toBe("HORA DE BAJAR EL RITMO");
    expect(readinessWord("unknown", new Date(2026, 9, 21, 21))).toBe("SIN DATOS TODAVÍA");
  });
  test("a program day's size", () => {
    const ex = Array.from({ length: 6 }, () => ({ sets: 3, restSeconds: 120, kind: "strength" }));
    expect(dayMeta(ex)).toBe("6 EJ · 18 SERIES · 50 MIN");
    expect(dayMeta([{ sets: 1, restSeconds: 0, kind: "cardio", cardio: { durationMinutes: 20 } }])).toBe("1 EJ · 20 MIN");
  });
  test("brief markdown keeps bold spans", () => {
    expect(briefSegments("- Recuperado. **sube a 42.5 kg**.")).toEqual([
      { text: "Recuperado. ", bold: false },
      { text: "sube a 42.5 kg", bold: true },
      { text: ".", bold: false },
    ]);
  });
});
