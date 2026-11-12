// Local calendar days, as the engine keys them. Pure (the device's time zone via Date).

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` in the phone's time zone (Swift's `DayKey.string`). */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Calendar arithmetic, so a DST change never skips or repeats a day. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Local midnight of a `YYYY-MM-DD` key. */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** The daily metrics' night: the morning it ends on, sleep ending before 18:00 the evening before counts for the next day (Swift's `DayKey.night`). */
export function nightEndingAt(end: Date): string {
  return dayKey(new Date(end.getTime() + 6 * 3_600_000));
}

/** Minutes east of UTC at `date` (−180 for UTC−3), what the engine's sleep wants. */
export const tzOffsetMin = (date: Date): number => -date.getTimezoneOffset();

/**
 * The engine's sleep night (`sleep/metrics.ts` `nightOf`): 18:00 → 18:00 local,
 * named after the day you wake up, keyed by a segment's START. `sync_sleep`
 * replaces each (night, source) it receives, so a batch must hold whole nights.
 */
export function engineNight(start: Date): string {
  return new Date(start.getTime() + tzOffsetMin(start) * 60_000 + 6 * 3_600_000).toISOString().slice(0, 10);
}

/** The first instant of an engine night: 18:00 local the evening before (in that evening's offset, near enough). */
export function engineNightStart(night: string): Date {
  return new Date(dayStart(night).getTime() - 6 * 3_600_000);
}

export const daysBetween = (from: Date, to: Date): number => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
