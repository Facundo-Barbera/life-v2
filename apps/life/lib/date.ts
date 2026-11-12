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
