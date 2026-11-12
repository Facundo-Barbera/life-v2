// Local, fake data only. No system calendar, no OAuth, no connectors.
// Events are generated relative to the current week so the view is never empty.

export type CalendarId = "personal" | "work" | "health" | "social";

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  calendar: CalendarId;
  allDay?: boolean;
  location?: string;
};

export const CALENDARS: Record<CalendarId, { label: string; color: string }> = {
  personal: { label: "Personal", color: "var(--cal-personal)" },
  work: { label: "Trabajo", color: "var(--cal-work)" },
  health: { label: "Salud", color: "var(--cal-health)" },
  social: { label: "Social", color: "var(--cal-social)" },
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function at(base: Date, dayOffset: number, h: number, m = 0): Date {
  const x = new Date(base);
  x.setDate(x.getDate() + dayOffset);
  x.setHours(h, m, 0, 0);
  return x;
}

type Template = {
  title: string;
  day: number; // offset from Monday of the current week (can be negative / > 6)
  from: [number, number?];
  to: [number, number?];
  calendar: CalendarId;
  allDay?: boolean;
  location?: string;
};

const TEMPLATES: Template[] = [
  { title: "Correr", day: 0, from: [7], to: [8], calendar: "health", location: "Parque" },
  { title: "Planeación semanal", day: 0, from: [9], to: [10], calendar: "work" },
  { title: "Deep work", day: 0, from: [10, 30], to: [13], calendar: "work" },
  { title: "Comida con Ana", day: 1, from: [14], to: [15, 30], calendar: "social", location: "Centro" },
  { title: "1:1", day: 1, from: [11], to: [11, 30], calendar: "work" },
  { title: "Gimnasio", day: 2, from: [7, 30], to: [8, 30], calendar: "health" },
  { title: "Revisión de diseño", day: 2, from: [12], to: [13], calendar: "work" },
  { title: "Leer", day: 2, from: [21], to: [22], calendar: "personal" },
  { title: "Dentista", day: 3, from: [16], to: [17], calendar: "health", location: "Clínica" },
  { title: "Deep work", day: 3, from: [9], to: [12], calendar: "work" },
  { title: "Correr", day: 4, from: [7], to: [8], calendar: "health" },
  { title: "Demo", day: 4, from: [15], to: [16], calendar: "work" },
  { title: "Cena", day: 4, from: [20], to: [22], calendar: "social" },
  { title: "Mercado", day: 5, from: [10], to: [11, 30], calendar: "personal" },
  { title: "Fin de semana fuera", day: 5, from: [0], to: [23, 59], calendar: "personal", allDay: true },
  { title: "Llamada familia", day: 6, from: [18], to: [19], calendar: "personal" },
  { title: "Pagar renta", day: -3, from: [0], to: [23, 59], calendar: "personal", allDay: true },
  { title: "Cumpleaños de Leo", day: 9, from: [0], to: [23, 59], calendar: "social", allDay: true },
  { title: "Planeación semanal", day: 7, from: [9], to: [10], calendar: "work" },
  { title: "Planeación semanal", day: -7, from: [9], to: [10], calendar: "work" },
  { title: "Viaje", day: 15, from: [8], to: [12], calendar: "personal" },
  { title: "Chequeo anual", day: -10, from: [9], to: [10], calendar: "health" },
];

export function getSampleEvents(now = new Date()): CalendarEvent[] {
  const monday = startOfWeek(now);
  return TEMPLATES.map((t, i) => ({
    id: `evt-${i}`,
    title: t.title,
    start: at(monday, t.day, t.from[0], t.from[1] ?? 0),
    end: at(monday, t.day, t.to[0], t.to[1] ?? 0),
    calendar: t.calendar,
    allDay: t.allDay,
    location: t.location,
  }));
}

export { startOfWeek };
