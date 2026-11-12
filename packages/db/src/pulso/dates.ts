// Local dates and times in the person's timezone (settings.timezone).
// Dates are "YYYY-MM-DD", times "HH:MM"; instants are ISO strings or Dates.

export const DEFAULT_TZ = "America/Mexico_City";
const DAY_MS = 86_400_000;

function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, min: +p.minute!, s: +p.second! };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local date of an instant. */
export function localDate(at: Date | string | number = new Date(), tz = DEFAULT_TZ): string {
  const p = parts(new Date(at), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** The local "HH:MM" of an instant. */
export function localTime(at: Date | string | number = new Date(), tz = DEFAULT_TZ): string {
  const p = parts(new Date(at), tz);
  return `${pad(p.h)}:${pad(p.min)}`;
}

/** Minutes since local midnight. */
export function localMinutes(at: Date | string | number = new Date(), tz = DEFAULT_TZ): number {
  const p = parts(new Date(at), tz);
  return p.h * 60 + p.min;
}

/** Offset of `tz` from UTC at `at`, in minutes (Mexico City: -360). */
export function tzOffsetMinutes(at: Date, tz = DEFAULT_TZ): number {
  const p = parts(at, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant of a local date and time ("HH:MM", default midnight). */
export function zonedInstant(date: string, time = "00:00", tz = DEFAULT_TZ): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const first = new Date(guess.getTime() - tzOffsetMinutes(guess, tz) * 60_000);
  // Second pass settles DST edges.
  return new Date(guess.getTime() - tzOffsetMinutes(first, tz) * 60_000);
}

/** `date` plus `days` (may be negative). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / DAY_MS);
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The Monday of the week holding `date`. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Morning before 14:00 local, evening from 17:00, otherwise unknown. */
export function timeOfDay(at: Date | string | number, tz = DEFAULT_TZ): "morning" | "evening" | "unknown" {
  const min = localMinutes(at, tz);
  if (min < 14 * 60) return "morning";
  if (min >= 17 * 60) return "evening";
  return "unknown";
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** "jueves 12 nov". */
export function fmtDay(date: string): string {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[isoWeekday(date) - 1]} ${d} ${MONTHS[m - 1]}`;
}

/** "12 nov". */
export function fmtShortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}`;
}

/** "7 h 25 min". */
export function fmtMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}
