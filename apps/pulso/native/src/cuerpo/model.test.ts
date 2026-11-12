import { expect, test } from "bun:test";
import type { BodyScan } from "@/contract";
import { ago, carried, composition, delta, ecwBand, evolution, gaugeGood, olderWith, pairBalance, segmentScans, signed, splitHistory, trendDomain, waterProteinMineralFat } from "./model";

const scan = (over: Partial<BodyScan>) => ({ id: "s", measuredAt: 0, source: "manual", ...over }) as BodyScan;

test("deltas and their verdict", () => {
  expect(delta(80, 81, true)).toEqual({ value: -1, good: true, arrow: "down" });
  expect(delta(35, 34, false)?.good).toBe(true);
  expect(delta(80.02, 80, true)?.good).toBeNull();
  expect(delta(null, 80, true)).toBeNull();
  expect(signed(1.24)).toBe("+1,2");
  expect(signed(-0.5)).toBe("−0,5");
  expect(signed(0.01)).toBe("±0");
});

test("history compares with the next older scan that has the metric", () => {
  const scans = [scan({ weight: 80 }), scan({ bodyFatMass: 15 }), scan({ weight: 82 })];
  expect(olderWith(scans, 0, "weight")).toBe(82);
  expect(olderWith(scans, 0, "skeletalMuscleMass")).toBeNull();
});

test("composition and evolution", () => {
  expect(composition(scan({ weight: 80, bodyFatMass: 15, skeletalMuscleMass: 35 })).map((x) => x.kg)).toEqual([35, 15, 30]);
  const ev = evolution([scan({ id: "b", measuredAt: 2, weight: 79, skeletalMuscleMass: 36, bodyFatMass: 14 }), scan({ id: "a", measuredAt: 1, weight: 80, skeletalMuscleMass: 35, bodyFatMass: 15 })]);
  expect(ev.map((p) => p.id)).toEqual(["a", "b"]);
  expect(ev[1]).toMatchObject({ weight: -1, muscle: 1, fat: -1 });
});

test("domain and gauges", () => {
  expect(trendDomain([80, 80])).toEqual([79.5, 80.5]);
  expect(gaugeGood({ metric: "skeletalMuscleMass", band: "high" })).toBe(true);
  expect(gaugeGood({ metric: "bodyFatMass", band: "high" })).toBe(false);
  expect(gaugeGood({ metric: "bmi", band: "low" })).toBeNull();
});

test("composition carries forward past a plain weigh-in", () => {
  const scans = [scan({ measuredAt: 3, weight: 79 }), scan({ measuredAt: 2, percentBodyFat: 18.3, source: "inbody" }), scan({ measuredAt: 1, percentBodyFat: 19 })];
  expect(carried(scans, "percentBodyFat")).toEqual({ value: 18.3, at: 2, previous: 19, fresh: false });
  expect(carried(scans, "weight")).toMatchObject({ value: 79, fresh: true, previous: null });
  expect(carried(scans, "inbodyScore")).toBeNull();
});

test("relative age in calendar days", () => {
  const now = new Date(2026, 9, 21, 9).getTime();
  expect(ago(new Date(2026, 9, 21, 7).getTime(), now)).toBe("hoy");
  expect(ago(new Date(2026, 9, 20, 23).getTime(), now)).toBe("ayer");
  expect(ago(new Date(2026, 9, 18).getTime(), now)).toBe("hace 3 días");
  expect(ago(new Date(2026, 8, 30).getTime(), now)).toBe("hace 3 sem");
  expect(ago(new Date(2026, 5, 1).getTime(), now)).toBe("hace 4 meses");
});

test("history splits full scans from weigh-ins", () => {
  const scans = [scan({ id: "w", weight: 79 }), scan({ id: "i", source: "inbody", weight: 80 }), scan({ id: "m", weight: 81, percentBodyFat: 18 })];
  const h = splitHistory(scans);
  expect(h.full.map((s) => s.id)).toEqual(["i", "m"]);
  expect(h.weighIns.map((s) => s.id)).toEqual(["w"]);
});

test("segments: the source scan, the one before, the balance and ECW bands", () => {
  const seg = { rightArm: 4, leftArm: 3.8, trunk: 28, rightLeg: 10, leftLeg: 9.9 };
  const scans = [scan({ id: "a", measuredAt: 5 }), scan({ id: "b", measuredAt: 4, segmentalLean: seg }), scan({ id: "c", measuredAt: 3 }), scan({ id: "d", measuredAt: 2, segmentalLean: seg })];
  const r = segmentScans(scans, 4, "segmentalLean");
  expect([r.current?.id, r.previous?.id]).toEqual(["b", "d"]);
  expect(segmentScans(scans, 4, "segmentalFat").current).toBeNull();
  expect(pairBalance(4, 3.85)).toMatchObject({ even: true, stronger: "right" });
  expect(pairBalance(4, 3.6).even).toBe(false);
  expect(ecwBand(0.395)).toBe("high");
  expect(ecwBand(0.378)).toBe("normal");
  expect(waterProteinMineralFat(scan({ totalBodyWater: 48, protein: 13, mineral: 4.5, bodyFatMass: 14 }))?.map((x) => x.kg)).toEqual([48, 13, 4.5, 14]);
  expect(waterProteinMineralFat(scan({ totalBodyWater: 48 }))).toBeNull();
});
