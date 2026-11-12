import { describe, expect, test } from "bun:test";
import type { BodyScan, WeighIn } from "../types";
import { averageSwing, dailyWeights, scanRow, scanView, trendReadings } from "./body";
import { bodyAnalysis, fitTrend, project } from "./body-analysis";
import { blankScan, decodeDigits, inbodyId, parseDate, parseInBody, parseInBodyCsv } from "./body-parse";
import { zonedInstant } from "./dates";

const TZ = "America/Mexico_City";

function synthetic270(values: Record<string, [number, number, string]>, encodeBang = false): string {
  const parts: string[] = Array(39).fill("");
  parts[0] = "270-0000TEST0000";
  const segments: Record<number, string[]> = { 33: [..."0".repeat(119), ..."-0000-0000"], 34: [..."0".repeat(175)], 38: [..."0".repeat(146)] };
  for (const [part, offset, digits] of Object.values(values)) segments[part]!.splice(offset, digits.length, ...digits);
  for (const [part, chars] of Object.entries(segments)) parts[Number(part)] = chars.join("");
  const ibdata = parts.join("!");
  return `https://qrcode.inbody.com?IBData=${encodeBang ? ibdata.replaceAll("!", "%21") : ibdata}`;
}

const SAMPLE = synthetic270({
  date: [33, 9, "20250102083015"],
  protein: [33, 23, "0124"], mineral: [33, 35, "0421"], bfm: [33, 47, "0149"], tbw: [33, 59, "0460"],
  weight: [33, 75, "0784"], smm: [33, 91, "0362"], bmi: [33, 104, "0247"], pbf: [33, 108, "0190"],
  bmr: [34, 4, "1771"], whr: [34, 8, "0088"],
  leanRA: [38, 20, "0371"], leanLA: [38, 24, "0369"], leanTR: [38, 28, "0284"], leanRL: [38, 32, "0985"], leanLL: [38, 36, "0980"],
  fatRA: [38, 40, "0012"], fatLA: [38, 44, "0013"], fatTR: [38, 48, "0071"], fatRL: [38, 52, "0024"], fatLL: [38, 56, "0024"],
  smi: [38, 105, "0089"],
});

describe("InBody parsing", () => {
  test("InBody 270 IBData at its scales, time in the person's zone", () => {
    const r = parseInBody(SAMPLE, { tz: TZ });
    if (!r.ok) throw new Error(r.message);
    expect(r.scan).toMatchObject({
      source: "inbody", device: "270", weight: 78.4, skeletalMuscleMass: 36.2, bodyFatMass: 14.9, percentBodyFat: 19, bmi: 24.7, bmr: 1771,
      totalBodyWater: 46, protein: 12.4, mineral: 4.21, waistHipRatio: 0.88, smi: 8.9, visceralFatLevel: null,
      segmentalLean: { rightArm: 3.71, leftArm: 3.69, trunk: 28.4, rightLeg: 9.85, leftLeg: 9.8 },
      segmentalFat: { rightArm: 1.2, leftArm: 1.3, trunk: 7.1, rightLeg: 2.4, leftLeg: 2.4 },
    });
    expect(r.scan.measuredAt).toBe(zonedInstant("2025-01-02", "08:30", TZ).getTime() + 15_000);
    expect(r.scan.externalId).toBe(inbodyId(r.scan.measuredAt));
  });
  test("an encoded ! does not shift offsets", () => {
    const r = parseInBody(synthetic270({ weight: [33, 75, "0655"], pbf: [33, 108, "0221"] }, true));
    expect(r.ok && [r.scan.weight, r.scan.percentBodyFat]).toEqual([65.5, 22.1]);
  });
  test("unknown models and junk fail with a message", () => {
    expect(parseInBody("https://qrcode.inbody.com?IBData=570-XX!1!2").ok).toBe(false);
    expect(parseInBody("hola").ok).toBe(false);
    expect(decodeDigits("0a12", 1)).toBeNull();
  });
  test("named values and JSON", () => {
    const r = parseInBody('{"weight": "72,4", "smm": 33.1, "date": "2025-03-01 07:00"}', { tz: TZ });
    expect(r.ok && [r.scan.weight, r.scan.skeletalMuscleMass]).toEqual([72.4, 33.1]);
  });
  test("CSV export: Spanish headers, semicolons, decimal commas, skipped rows", () => {
    const csv = "Fecha;Equipo;Peso (kg);Masa Muscular Esquelética (kg);Porcentaje de Grasa Corporal (%)\n15/03/2025 09:10;270;85,2;34,0;25,9\n;270;80;30;20\n";
    const { scans, skipped } = parseInBodyCsv(csv, TZ);
    expect(scans[0]).toMatchObject({ weight: 85.2, skeletalMuscleMass: 34, percentBodyFat: 25.9, device: "270" });
    expect(scans[0]!.measuredAt).toBe(zonedInstant("2025-03-15", "09:10", TZ).getTime());
    expect(skipped).toEqual([{ line: 3, reason: "Sin fecha legible." }]);
  });
  test("parseDate rejects impossible dates", () => {
    expect(parseDate("20250231", TZ)).toBeNull();
  });
});

describe("projection", () => {
  test("Theil–Sen ignores one outlier", () => {
    const day = 86_400_000;
    const pts = Array.from({ length: 10 }, (_, i) => ({ at: i * day, value: 85 - i * 0.1 }));
    pts[4]!.value = 90;
    const t = fitTrend(pts)!;
    expect(t.slope).toBeCloseTo(-0.1, 5);
    const p = project("weight", pts, 80);
    expect(p.slopePerWeek).toBeCloseTo(-0.7, 2);
    expect(p.horizons.map((h) => h.weeks)).toEqual([4, 8, 12]);
    expect(p.goal?.eta).not.toBeNull();
  });
  test("too few points: a note, no trend", () => {
    expect(project("weight", [{ at: 0, value: 80 }]).current).toBeNull();
  });
});

const w = (iso: string, kg: number, tod: WeighIn["time_of_day"]) => ({ measured_at: iso, weight_kg: kg, time_of_day: tod });

describe("weigh-ins", () => {
  test("morning and evening stay apart, with the day's swing", () => {
    const days = dailyWeights(
      [w("2026-11-12T13:30:00Z", 80, "morning"), w("2026-11-13T03:00:00Z", 81.2, "evening"), w("2026-11-11T13:00:00Z", 80.4, "morning")],
      TZ, "2026-11-12", 3,
    );
    expect(days.map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(days[2]).toMatchObject({ morning: 80, evening: 81.2, swing: 1.2 });
    expect(days[1]).toMatchObject({ morning: 80.4, evening: null, swing: null });
    expect(averageSwing(days)).toBe(1.2);
  });
  test("the trend reads mornings once there are three of them", () => {
    const ins = [
      w("2026-11-10T13:00:00Z", 80, "morning"), w("2026-11-11T13:00:00Z", 80, "morning"), w("2026-11-12T13:00:00Z", 80, "morning"),
      w("2026-11-12T03:00:00Z", 82, "evening"),
    ];
    expect(trendReadings(ins).every((r) => r.value === 80)).toBe(true);
    expect(trendReadings(ins.slice(2))).toHaveLength(2);
  });
});

describe("scan rows", () => {
  test("round-trips through the row and completes fat kg/%", () => {
    const input = { ...blankScan("manual", Date.parse("2026-11-01T14:00:00Z")), weight: 80, percentBodyFat: 20, skeletalMuscleMass: 36, segmentalLean: { rightArm: 3.5, leftArm: 3.4, trunk: 27, rightLeg: 9, leftLeg: 9 } };
    const row = scanRow(input, "u");
    expect(row.metrics.bodyFatMass).toBe(16);
    expect(row.muscle_pct).toBe(45);
    const view = scanView({ ...row, id: "s", created_at: "", updated_at: "", source: "manual", external_id: null, device: null } as BodyScan);
    expect(view).toMatchObject({ weight: 80, bodyFatMass: 16, percentBodyFat: 20, segmentalLean: { trunk: 27 }, segmentalFat: null });
    const a = bodyAnalysis([view], { heightCm: 178, sex: "male" });
    expect(a.muscleFat?.gauges.map((g) => g.metric)).toEqual(["weight", "skeletalMuscleMass", "bodyFatMass"]);
    expect(a.segments?.lean?.trunk.band).toBeTruthy();
  });
  test("refuses a scan with nothing in it", () => {
    expect(() => scanRow({ ...blankScan("manual", 0), bmi: 22 }, "u")).toThrow();
  });
});
