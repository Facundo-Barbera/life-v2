// Local, fake data only. No system calendar, no OAuth, no connectors.
// Generated relative to the current week so the view is never empty.
import { startOfWeek } from "./date";

export type CalendarId = "personal" | "work" | "health" | "social";

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  calendar: CalendarId;
  allDay?: boolean;
  kind?: "event" | "focus";
  location?: string;
  people?: string[];
  video?: boolean;
};

export const CALENDARS: Record<CalendarId, { label: string; color: string }> = {
  personal: { label: "Personal", color: "var(--cal-personal)" },
  work: { label: "Trabajo", color: "var(--cal-work)" },
  health: { label: "Salud", color: "var(--cal-health)" },
  social: { label: "Social", color: "var(--cal-social)" },
};

type T = Omit<CalendarEvent, "id" | "start" | "end"> & {
  day: number | number[]; // offset from Monday of the week
  from: string; // "HH:MM"
  to: string;
};

const TEAM = ["Ana", "Leo", "Maya"];

// Repeat every week.
const WEEKLY: T[] = [
  { title: "Standup", day: [0, 1, 2, 3, 4], from: "09:30", to: "09:45", calendar: "work", video: true, people: TEAM },
  { title: "Correr", day: [0, 4], from: "07:00", to: "07:45", calendar: "health", location: "Parque" },
  { title: "Gimnasio", day: 2, from: "07:30", to: "08:30", calendar: "health" },
  { title: "Enfoque", day: 0, from: "10:30", to: "12:30", calendar: "work", kind: "focus" },
  { title: "Enfoque", day: 1, from: "10:00", to: "12:00", calendar: "work", kind: "focus" },
  { title: "Enfoque", day: 3, from: "14:00", to: "16:30", calendar: "work", kind: "focus" },
  { title: "Planear próxima semana", day: 4, from: "17:00", to: "17:30", calendar: "personal" },
];

// Only in the current week.
const THIS_WEEK: T[] = [
  { title: "Planeación semanal", day: 0, from: "08:45", to: "09:30", calendar: "work", people: ["Ana", "Leo"] },
  { title: "Diseño de onboarding", day: 0, from: "14:00", to: "15:00", calendar: "work", people: ["Ana", "Sam", "Theo"], video: true },
  { title: "Comida con Ana", day: 1, from: "14:00", to: "15:15", calendar: "social", location: "Centro", people: ["Ana"] },
  { title: "1:1 con Maya", day: 1, from: "15:30", to: "16:15", calendar: "work", video: true, people: ["Maya"] },
  { title: "Entrevista con usuario", day: 2, from: "11:00", to: "12:00", calendar: "work", video: true, people: ["Sam"] },
  { title: "Revisión de diseño", day: 2, from: "12:00", to: "13:00", calendar: "work", people: ["Ana", "Leo", "Sam", "Theo"] },
  { title: "Llamada con cliente", day: 2, from: "13:15", to: "14:00", calendar: "work", video: true },
  { title: "Leer", day: 2, from: "21:00", to: "22:00", calendar: "personal" },
  { title: "Dentista", day: 3, from: "17:00", to: "18:00", calendar: "health", location: "Clínica Valle" },
  { title: "Entregar declaración", day: 3, from: "00:00", to: "23:59", calendar: "personal", allDay: true },
  { title: "Retro", day: 4, from: "13:00", to: "14:00", calendar: "work", people: TEAM },
  { title: "Demo", day: 4, from: "15:00", to: "16:00", calendar: "work", video: true, people: ["Ana", "Theo"] },
  { title: "Pagar servicios", day: 4, from: "15:30", to: "16:00", calendar: "personal" },
  { title: "Cena con amigos", day: 4, from: "20:00", to: "22:00", calendar: "social", location: "Casa de Leo", people: ["Leo", "Sam"] },
  { title: "Fin de semana fuera", day: [5, 6], from: "00:00", to: "23:59", calendar: "personal", allDay: true },
  { title: "Mercado", day: 5, from: "10:00", to: "11:30", calendar: "personal" },
  { title: "Llamada familia", day: 6, from: "18:00", to: "19:00", calendar: "personal", video: true },
  // Nearby weeks
  { title: "Pagar renta", day: -3, from: "00:00", to: "23:59", calendar: "personal", allDay: true },
  { title: "Chequeo anual", day: -10, from: "09:00", to: "10:00", calendar: "health", location: "Hospital" },
  { title: "Cumpleaños de Leo", day: 9, from: "00:00", to: "23:59", calendar: "social", allDay: true },
  { title: "Taller de escritura", day: 8, from: "18:00", to: "20:00", calendar: "personal" },
  { title: "Viaje", day: 15, from: "08:00", to: "12:00", calendar: "personal" },
];

function at(monday: Date, day: number, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const x = new Date(monday);
  x.setDate(x.getDate() + day);
  x.setHours(h, m, 0, 0);
  return x;
}

export function getSampleEvents(now = new Date()): CalendarEvent[] {
  const monday = startOfWeek(now);
  const out: CalendarEvent[] = [];
  const push = (t: T, day: number, key: string) => {
    const { day: _d, from, to, ...rest } = t;
    out.push({ ...rest, id: key, start: at(monday, day, from), end: at(monday, day, to) });
  };
  for (let w = -8; w <= 8; w++) {
    WEEKLY.forEach((t, i) => [t.day].flat().forEach((d) => push(t, d + 7 * w, `w${i}-${w}-${d}`)));
  }
  THIS_WEEK.forEach((t, i) => [t.day].flat().forEach((d) => push(t, d, `o${i}-${d}`)));
  return out.sort((a, b) => +a.start - +b.start);
}
