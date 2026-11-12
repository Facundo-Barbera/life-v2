/**
 * Suggestions to put a schedule on an as-needed medication that is really
 * taken on a rhythm (ported from the old engine's nudges.ts). Pure: reads meds
 * and logged events, never changes anything — the person decides.
 */
import { addDays, isoWeekday, localTime } from "../dates";
import { NO_SCHEDULE } from "./normalize";
import { DEFAULT_ANY_TIME_REMINDER, type DoseEvent, type FullSchedule, fromMinutes, type Med, toMinutes } from "./schedule";

export const NUDGE_LOOKBACK_DAYS = 35;
const DAILY_WINDOW = 10;
const DAILY_MIN_DAYS = 5;
const DAILY_SPREAD = 90;
const WEEKLY_MIN = 3;

export type ScheduleNudge = {
  medicationId: string;
  name: string;
  cadence: "daily" | "weekly";
  reason: "known" | "pattern";
  title: string;
  detail: string;
  schedule: FullSchedule;
  instructions: string | null;
};

type Known = { cadence: "daily" | "weekly"; time: string; anyTime?: boolean; instructions: string | null; detail: (time: string, day: number) => string };

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
const WEEKDAY = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const weekly = (time: string, day: number) => `Una vez por semana · los ${WEEKDAYS[day - 1]} a las ${time}`;

const KNOWN: { match: RegExp; unless?: RegExp; rule: Known }[] = [
  {
    match: /levotirox|eutirox|levothyrox|synthroid|tirosint|\btiroxina/i,
    rule: { cadence: "daily", time: "07:30", instructions: "en ayunas", detail: (time) => `En ayunas al despertar · ${time}` },
  },
  {
    match: /semaglut|ozempic|wegovy|tirzepat|mounjaro|zepbound|dulaglut|trulicity/i,
    unless: /rybelsus|comprimido|oral/i,
    rule: { cadence: "weekly", time: "10:00", anyTime: true, instructions: null, detail: (_, day) => `Semanal · ${WEEKDAY[day - 1]} · cualquier hora` },
  },
];

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const roundTo5 = (minutes: number) => Math.round(minutes / 5) * 5;

function usualWeekday(dates: string[]): number {
  const counts = new Map<number, number>();
  for (const d of dates) counts.set(isoWeekday(d), (counts.get(isoWeekday(d)) ?? 0) + 1);
  const latest = isoWeekday([...dates].sort().at(-1)!);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === latest ? -1 : b[0] === latest ? 1 : 0))[0]![0];
}

type Intake = { date: string; minutes: number };

function dailyPattern(intakes: Intake[], today: string): string | null {
  const recent = intakes.filter((i) => i.date > addDays(today, -DAILY_WINDOW));
  const firstPerDay = [...new Map(recent.map((i) => [i.date, i])).values()];
  if (firstPerDay.length < DAILY_MIN_DAYS) return null;
  const usual = median(firstPerDay.map((i) => i.minutes));
  if (firstPerDay.some((i) => Math.abs(i.minutes - usual) > DAILY_SPREAD)) return null;
  return fromMinutes(roundTo5(usual));
}

function weeklyPattern(intakes: Intake[]): { day: number; time: string } | null {
  const days = [...new Set(intakes.map((i) => i.date))].sort();
  if (days.length < WEEKLY_MIN) return null;
  for (let i = 1; i < days.length; i++) {
    const gap = (Date.parse(days[i]!) - Date.parse(days[i - 1]!)) / 86_400_000;
    if (gap < 6 || gap > 8) return null;
  }
  return { day: usualWeekday(days), time: fromMinutes(roundTo5(median(intakes.map((i) => i.minutes)))) };
}

const scheduleFor = (time: string, days: number[]): FullSchedule => ({ ...NO_SCHEDULE, times: [time], days });
const anyTimeOn = (days: number[]): FullSchedule => ({ ...NO_SCHEDULE, days, anyTime: true, reminder: DEFAULT_ANY_TIME_REMINDER });

/** One nudge per active as-needed medication that looks scheduled. */
export function scheduleNudges(meds: Med[], events: DoseEvent[], today: string, tz?: string): ScheduleNudge[] {
  const nudges: ScheduleNudge[] = [];
  for (const med of meds) {
    if (!med.active || !med.schedule.asNeeded) continue;
    const intakes: Intake[] = events
      .filter((e) => e.medicationId === med.id && e.status === "tomada" && e.takenAt !== null && e.date > addDays(today, -NUDGE_LOOKBACK_DAYS))
      .map((e) => ({ date: e.date, minutes: toMinutes(localTime(e.takenAt!, tz)) }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.minutes - b.minutes);
    const typical = intakes.length ? fromMinutes(roundTo5(median(intakes.map((i) => i.minutes)))) : null;
    const base = { medicationId: med.id, name: med.name };

    const known = KNOWN.find((k) => k.match.test(med.name) && !(k.unless && k.unless.test(`${med.name} ${med.form ?? ""} ${med.unit}`)))?.rule;
    if (known) {
      const time = typical ?? known.time;
      const day = intakes.length ? usualWeekday(intakes.map((i) => i.date)) : isoWeekday(today);
      nudges.push({
        ...base,
        cadence: known.cadence,
        reason: "known",
        title: `${med.name} ${known.cadence === "daily" ? "parece diaria" : "parece semanal"}. ¿Ponerle horario?`,
        detail: known.detail(time, day),
        schedule: known.anyTime ? anyTimeOn([day]) : scheduleFor(time, known.cadence === "weekly" ? [day] : []),
        instructions: med.instructions ? null : known.instructions,
      });
      continue;
    }

    const daily = dailyPattern(intakes, today);
    if (daily) {
      nudges.push({ ...base, cadence: "daily", reason: "pattern", title: `${med.name} parece diaria. ¿Ponerle horario?`, detail: `Todos los días a las ${daily}, como la vienes tomando`, schedule: scheduleFor(daily, []), instructions: null });
      continue;
    }
    const week = weeklyPattern(intakes);
    if (week) {
      nudges.push({ ...base, cadence: "weekly", reason: "pattern", title: `${med.name} parece semanal. ¿Ponerle horario?`, detail: weekly(week.time, week.day), schedule: scheduleFor(week.time, [week.day]), instructions: null });
    }
  }
  return nudges;
}
