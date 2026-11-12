export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((+x - +yearStart) / 86_400_000 + 1) / 7);
}

export function hoursOf(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const fmt = {
  time: new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", hour12: false }),
  weekday: new Intl.DateTimeFormat("es", { weekday: "short" }),
  weekdayLong: new Intl.DateTimeFormat("es", { weekday: "long" }),
  monthShort: new Intl.DateTimeFormat("es", { month: "short" }),
  monthYear: new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }),
  long: new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }),
};

export const wd = (d: Date) => cap(fmt.weekday.format(d).replace(".", ""));
export const mon = (d: Date) => fmt.monthShort.format(d).replace(".", "");

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Minutes from midnight → "HH:MM" (wraps past 24h). */
export const toHHMM = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`;
};

/** Lenient "HH:MM" parser: accepts "9", "930", "09:30", "9.30", "21h". Returns null if invalid. */
export const parseTime = (s: string): number | null => {
  const t = s.trim().toLowerCase().replace(/h$/, "");
  let h: number, m: number;
  const sep = t.match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (sep) [h, m] = [Number(sep[1]), Number(sep[2])];
  else if (/^\d{1,2}$/.test(t)) [h, m] = [Number(t), 0];
  else if (/^\d{3,4}$/.test(t)) [h, m] = [Number(t.slice(0, -2)), Number(t.slice(-2))];
  else return null;
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

export const minOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const atMinute = (day: Date, m: number) => {
  const x = startOfDay(day);
  x.setMinutes(m);
  return x;
};
