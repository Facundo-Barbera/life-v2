// Recorded sleep, one session per night. The shape mirrors HealthKit's
// HKCategoryTypeIdentifierSleepAnalysis samples (awake / REM / core / deep),
// grouped by night, so a future HealthKit sync can fill it as-is.
import { addDays, startOfDay } from "./date";

export type SleepStage = "awake" | "rem" | "core" | "deep";
export type SleepSample = { start: Date; end: Date; stage: SleepStage };
export type SleepSession = {
  id: string;
  start: Date; // in bed / first sample
  end: Date; // last sample
  source: "sample" | "healthkit";
  samples: SleepSample[];
};

export const STAGES: Record<SleepStage, { label: string; color: string; lane: number }> = {
  awake: { label: "Despierto", color: "var(--sleep-awake)", lane: 0 },
  rem: { label: "REM", color: "var(--sleep-rem)", lane: 1 },
  core: { label: "Núcleo", color: "var(--sleep-core)", lane: 2 },
  deep: { label: "Profundo", color: "var(--sleep-deep)", lane: 3 },
};

const minutes = (a: Date, b: Date) => (+b - +a) / 60_000;

export const asleepMinutes = (s: SleepSession) =>
  s.samples.filter((x) => x.stage !== "awake").reduce((t, x) => t + minutes(x.start, x.end), 0);

export const stageTotals = (s: SleepSession) => {
  const out: Record<SleepStage, number> = { awake: 0, rem: 0, core: 0, deep: 0 };
  for (const x of s.samples) out[x.stage] += minutes(x.start, x.end);
  return out;
};

function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Fake but plausible nights (deterministic per date), only those already finished. */
export function getSampleSleep(now: Date, nights = 60): SleepSession[] {
  const out: SleepSession[] = [];
  const today = startOfDay(now);
  for (let i = nights; i >= 1; i--) {
    const evening = addDays(today, -i);
    const r = rng(evening.getFullYear() * 10_000 + (evening.getMonth() + 1) * 100 + evening.getDate());
    r();
    const weekendNight = evening.getDay() === 5 || evening.getDay() === 6;
    const bed = (weekendNight ? 23 * 60 + 50 : 23 * 60 + 5) + Math.round((r() - 0.5) * 80);
    const dur = Math.round((weekendNight ? 480 : 425) + (r() - 0.5) * 100);
    const start = new Date(evening);
    start.setMinutes(bed);
    const end = new Date(+start + dur * 60_000);
    if (end > now) continue;
    out.push({ id: `sleep-${evening.toDateString()}`, start, end, source: "sample", samples: stages(start, end, r) });
  }
  return out;
}

function stages(start: Date, end: Date, r: () => number): SleepSample[] {
  const s: SleepSample[] = [];
  let t = +start;
  const push = (stage: SleepStage, min: number) => {
    if (t >= +end) return;
    const e = Math.min(+end, t + min * 60_000);
    s.push({ start: new Date(t), end: new Date(e), stage });
    t = e;
  };
  push("awake", 6 + r() * 12); // falling asleep
  for (let cycle = 0; t < +end; cycle++) {
    const early = cycle < 2;
    push("core", 22 + r() * 20);
    push("deep", early ? 22 + r() * 20 : 4 + r() * 10);
    push("core", 8 + r() * 10);
    push("rem", early ? 8 + r() * 8 : 18 + r() * 16);
    if (r() < 0.35) push("awake", 2 + r() * 6);
  }
  return s;
}

export type SleepPiece = {
  session: SleepSession;
  from: number; // minutes into the day
  to: number;
  hasStart: boolean;
  hasEnd: boolean;
  samples: { from: number; to: number; stage: SleepStage }[];
};

/** Clip each session to one calendar day (a night spans two). */
export function sleepForDay(sessions: SleepSession[], day: Date): SleepPiece[] {
  const d0 = +startOfDay(day);
  const d1 = +addDays(startOfDay(day), 1);
  const m = (t: number) => (t - d0) / 60_000;
  return sessions
    .filter((s) => +s.end > d0 && +s.start < d1)
    .map((s) => ({
      session: s,
      from: m(Math.max(+s.start, d0)),
      to: m(Math.min(+s.end, d1)),
      hasStart: +s.start >= d0,
      hasEnd: +s.end <= d1,
      samples: s.samples
        .filter((x) => +x.end > d0 && +x.start < d1)
        .map((x) => ({ from: m(Math.max(+x.start, d0)), to: m(Math.min(+x.end, d1)), stage: x.stage })),
    }));
}
