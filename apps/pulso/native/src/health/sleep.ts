// Pure: last night's sleep from HealthKit's sleep-analysis samples. Kept apart
// from the native calls so it runs under `bun test`.

/** `HKCategoryValueSleepAnalysis` raw values. */
export const SLEEP = { inBed: 0, asleepUnspecified: 1, awake: 2, asleepCore: 3, asleepDeep: 4, asleepREM: 5 } as const;

export type SleepSample = { startDate: Date; endDate: Date; value: number };
export type Night = { asleepMinutes: number; deep: number; core: number; rem: number; awake: number };

/**
 * Minutes asleep by stage. Overlapping sources (the Watch and the iPhone both
 * logging) are merged per stage, so a minute counts once.
 */
export function summarizeNight(samples: readonly SleepSample[]): Night | null {
  const byStage = new Map<number, [number, number][]>();
  for (const s of samples) {
    const list = byStage.get(s.value) ?? [];
    list.push([s.startDate.getTime(), s.endDate.getTime()]);
    byStage.set(s.value, list);
  }
  const minutes = (value: number) => Math.round(mergedLength(byStage.get(value) ?? []) / 60_000);
  const deep = minutes(SLEEP.asleepDeep);
  const core = minutes(SLEEP.asleepCore);
  const rem = minutes(SLEEP.asleepREM);
  const unspecified = minutes(SLEEP.asleepUnspecified);
  const asleepMinutes = deep + core + rem + unspecified;
  if (asleepMinutes === 0) return null;
  return { asleepMinutes, deep, core, rem, awake: minutes(SLEEP.awake) };
}

function mergedLength(ranges: [number, number][]): number {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [start, end] of sorted) {
    if (!current || start > current[1]) {
      if (current) total += current[1] - current[0];
      current = [start, end];
    } else current[1] = Math.max(current[1], end);
  }
  if (current) total += current[1] - current[0];
  return total;
}

/** The night that ends today: from 18:00 yesterday. */
export function nightWindow(now = new Date()): { startDate: Date; endDate: Date } {
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  start.setHours(18, 0, 0, 0);
  return { startDate: start, endDate: now };
}
