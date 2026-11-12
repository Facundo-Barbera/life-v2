import type {
  AdherenceDay,
  DayPart,
  DoseEvent,
  DoseMeal,
  DoseMoment,
  DoseSlot,
  DoseWindow,
  Medication,
  MedicationDay,
  MedicationKind,
  MedicationSchedule,
  ScheduleNudge,
  TrainingRule,
  TrainingSlot,
} from "@/contract";
import { DAY_PART_RANGES, DEFAULT_ANY_TIME_REMINDER } from "@/contract";
import type { SFSymbol } from "expo-symbols";

// Medicación's pure rules, ported from the SwiftUI app (Features/Medication):
// schedules in words, today's timeline, the editor's two questions, presets,
// history and the reminder plan. No React here: `bun test` covers it.
// Dates are local "YYYY-MM-DD", times "HH:MM" (shown as they are: 24 h).

// ── Dates ────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const clockOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parts = (key: string) => key.split("-").map(Number) as [number, number, number];
/** Midnight of a local day. */
export const parseKey = (key: string) => {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d);
};
export const addDays = (key: string, n: number) => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
/** Whole days from `a` to `b` (calendar days, DST-proof). */
export const daysBetween = (a: string, b: string) => {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
};
/** 1 = lunes … 7 = domingo. */
export const isoWeekday = (key: string) => {
  const day = parseKey(key).getDay();
  return day === 0 ? 7 : day;
};
/** The instant of "HH:MM" on a local day. */
export const instant = (date: string, time: string) => {
  const d = parseKey(date);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
};
export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const timeOf = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

export const WEEKDAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];
export const WEEKDAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Entre semana», «Fines de semana», «Lun, Mié, Vie». */
export function shortDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join() === "1,2,3,4,5") return "Entre semana";
  if (sorted.join() === "6,7") return "Fines de semana";
  return sorted.map((d) => cap(WEEKDAY_NAMES[d - 1]!.slice(0, 3))).join(", ");
}
export const longDay = (day: number) => WEEKDAY_NAMES[Math.max(1, Math.min(7, day)) - 1]!;

/** «a, b y c». */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** «jue 8 oct». */
export const shortDate = (key: string) => {
  const d = parseKey(key);
  return `${WEEKDAY_NAMES[isoWeekday(key) - 1]!.slice(0, 3)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};
/** «8 de octubre». */
export const dayMonth = (key: string) => {
  const d = parseKey(key);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
};
/** «Hoy», «Ayer», else «Lunes 29 sept». */
export function historyDayTitle(key: string, today: string): string {
  if (key === today) return "Hoy";
  if (key === addDays(today, -1)) return "Ayer";
  const d = parseKey(key);
  return `${cap(WEEKDAY_NAMES[isoWeekday(key) - 1]!)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

// ── Amounts and kinds ────────────────────────────────────────────────────

/** «2 000», «2,5». */
export const amount = (n: number) => {
  const [whole, frac] = String(Math.round(n * 100) / 100).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac ? `${grouped},${frac}` : grouped;
};
export const doseText = (m: { dose: number; unit: string }) => `${amount(m.dose)} ${m.unit}`;

export const KIND_LABEL: Record<MedicationKind, string> = { medicamento: "Medicamento", suplemento: "Suplemento" };
export const KIND_SYMBOL: Record<MedicationKind, SFSymbol> = { medicamento: "pills.fill", suplemento: "leaf.fill" };

/** Suggested units for the dose, per kind. */
export const UNITS: Record<MedicationKind, string[]> = {
  medicamento: ["comprimido", "cápsula", "mg", "ml", "gotas", "UI", "inhalación", "sobre"],
  suplemento: ["cápsula", "g", "cazo", "gomita", "comprimido", "mg", "UI", "ml"],
};
export const FORMS: Record<MedicationKind, string[]> = {
  medicamento: ["comprimido", "cápsula", "gotas", "jarabe", "polvo", "sobre", "inyección", "inhalador", "crema", "parche", "spray"],
  suplemento: ["polvo", "cápsula", "comprimido", "gomita", "líquido", "sobre", "barrita"],
};

// ── Moments, meals, parts of the day ─────────────────────────────────────

export const MEALS: DoseMeal[] = ["desayuno", "comida", "cena"];
export const MEAL_LABEL: Record<DoseMeal, string> = { desayuno: "Desayuno", comida: "Comida", cena: "Cena" };
export const MEAL_SYMBOL: Record<DoseMeal, SFSymbol> = { desayuno: "cup.and.saucer.fill", comida: "fork.knife", cena: "moon.haze.fill" };
/** «con el desayuno». */
export const mealPhrase = (m: DoseMeal) => `con ${m === "desayuno" ? "el" : "la"} ${m}`;

export const PARTS: DayPart[] = ["manana", "tarde", "noche"];
export const PART_LABEL: Record<DayPart, string> = { manana: "Mañana", tarde: "Tarde", noche: "Noche" };
export const PART_SYMBOL: Record<DayPart, SFSymbol> = { manana: "sun.max.fill", tarde: "sun.horizon.fill", noche: "moon.stars.fill" };
/** «en la mañana». */
export const partPhrase = (p: DayPart) => `en la ${PART_LABEL[p].toLowerCase()}`;
export const windowOf = (part: DayPart): DoseWindow => ({ part, ...DAY_PART_RANGES[part] });
/** «07:00–12:00». */
export const windowRange = (w: { start: string; end: string }) => `${w.start}–${w.end}`;

export const MOMENT_TITLE: Record<DoseMoment, string> = {
  hora: "A su hora",
  entreno: "Después de entrenar",
  desayuno: "Con el desayuno",
  comida: "Con la comida",
  cena: "Con la cena",
  dormir: "Antes de dormir",
  manana: "En la mañana",
  tarde: "En la tarde",
  noche: "En la noche",
  dia: "Hoy, cuando quieras",
};
export const MOMENT_SYMBOL: Record<DoseMoment, SFSymbol> = {
  hora: "clock",
  entreno: "figure.strengthtraining.traditional",
  desayuno: "cup.and.saucer.fill",
  comida: "fork.knife",
  cena: "moon.haze.fill",
  dormir: "bed.double.fill",
  manana: "sun.max.fill",
  tarde: "sun.horizon.fill",
  noche: "moon.stars.fill",
  dia: "calendar.badge.checkmark",
};
const MOMENTS = new Set<string>(Object.keys(MOMENT_TITLE));
/** A slot key: "HH:MM" for a fixed time, else the moment's name. */
export const momentOfKey = (key: string): DoseMoment => (MOMENTS.has(key) ? (key as DoseMoment) : "hora");
export const isFlexible = (m: DoseMoment) => m === "dia" || m === "manana" || m === "tarde" || m === "noche";

/** «programada 08:00», or the moment for a slot tied to one («después de entrenar»). */
export function scheduledLabel(key: string | null): string {
  if (!key) return "sin horario";
  const moment = momentOfKey(key);
  if (moment === "hora") return `programada ${key}`;
  if (moment === "dia") return "cualquier hora";
  return MOMENT_TITLE[moment].toLowerCase();
}

/** One line on a training slot: «Terminaste a las 19:05 · tómala antes de las 19:50». */
export function trainingStatus(t: TrainingSlot): string {
  switch (t.state) {
    case "trained":
      if (!t.workoutEnd) return "Después de entrenar";
      return t.until ? `Terminaste a las ${t.workoutEnd} · tómala antes de las ${t.until}` : `Terminaste a las ${t.workoutEnd}`;
    case "training":
      return "Entrenando…";
    case "planned":
      return t.plannedAt ? `Al terminar tu sesión de las ${t.plannedAt}` : "Al terminar tu sesión";
    case "rest":
      return t.fallback ? `Hoy descansas · ${t.fallback}` : "Hoy descansas";
  }
}

// ── Schedules in words ───────────────────────────────────────────────────

export const AS_NEEDED: MedicationSchedule = {
  asNeeded: true,
  times: [],
  days: [],
  interval: null,
  monthDay: null,
  training: null,
  meals: [],
  bedtime: false,
  windows: [],
  anyTime: false,
  reminder: null,
};
export const schedule = (over: Partial<MedicationSchedule>): MedicationSchedule => ({ ...AS_NEEDED, asNeeded: false, ...over });

/** «08:00 y 20:00 · con el desayuno · después de entrenar», «cualquier hora». */
export function scheduleSummary(s: MedicationSchedule): string {
  const out: string[] = [];
  if (s.times.length) out.push(listJoin(s.times));
  if (s.windows.length) out.push(listJoin(s.windows.map((w) => partPhrase(w.part))));
  if (s.meals.length) out.push(listJoin(s.meals.map(mealPhrase)));
  if (s.training) out.push(s.training.restDayTime ? `después de entrenar (sin entreno, ${s.training.restDayTime})` : "después de entrenar");
  if (s.bedtime) out.push("antes de dormir");
  if (s.anyTime) out.push("cualquier hora");
  return out.join(" · ");
}

/** Which days: «Semanal · jueves», «Lun, Mié», «Cada 3 días», «Cada 2 semanas · lunes», «Cada mes · día 5»; null for every day. */
export function frequencyLine(s: MedicationSchedule): string | null {
  const weekdays = s.days.length === 1 ? longDay(s.days[0]!) : shortDays(s.days);
  if (s.monthDay != null) return `Cada mes · día ${s.monthDay}`;
  if (s.interval) return s.interval.unit === "day" ? `Cada ${s.interval.every} días` : `Cada ${s.interval.every} semanas · ${weekdays}`;
  if (s.days.length === 1) return `Semanal · ${weekdays}`;
  return s.days.length ? weekdays : null;
}

/** Frequency and timing in one line: «Semanal · jueves · cualquier hora». */
export function scheduleLine(s: MedicationSchedule): string {
  const summary = scheduleSummary(s);
  return cap([frequencyLine(s), summary || null].filter(Boolean).join(" · "));
}

/** A scheduled med needs at least one slot. */
export const hasSlots = (s: MedicationSchedule) => s.times.length > 0 || s.meals.length > 0 || s.bedtime || s.training != null || s.windows.length > 0 || s.anyTime;

/** Whether the frequency falls on `date`, as the engine decides it. */
export function isDue(s: MedicationSchedule, date: string): boolean {
  const weekday = isoWeekday(date);
  if (s.monthDay != null) {
    const [y, m, d] = parts(date);
    const last = new Date(y, m, 0).getDate();
    return d === Math.min(s.monthDay, last);
  }
  if (s.interval) {
    const gap = daysBetween(s.interval.start, date);
    if (gap < 0) return false;
    if (s.interval.unit === "day") return gap % s.interval.every === 0;
    const startWeekday = isoWeekday(s.interval.start);
    const weeks = Math.floor((gap + startWeekday - 1) / 7);
    return weeks % s.interval.every === 0 && (s.days.length ? s.days : [startWeekday]).includes(weekday);
  }
  return s.days.length === 0 || s.days.includes(weekday);
}

/** More than one kind of slot, which the editor shows only one of. */
export const isMixed = (s: MedicationSchedule) =>
  !s.asNeeded && [s.times.length > 0, s.training != null, s.meals.length > 0, s.bedtime, s.windows.length > 0, s.anyTime].filter(Boolean).length > 1;

/** The whole schedule in one line, the editor's read-back: «Semanal · jueves · cuando quieras · aviso 19:00 si no la tomaste». */
export function readBack(s: MedicationSchedule): string {
  if (s.asNeeded) return "Cuando haga falta · sin horario ni avisos";
  const out = [frequencyLine(s) ?? "Cada día"];
  if (s.times.length) out.push(`a las ${listJoin(s.times)}`);
  if (s.windows.length) out.push(listJoin(s.windows.map((w) => `${partPhrase(w.part)}, ${windowRange(w)}`)));
  if (s.anyTime) {
    out.push("cuando quieras");
    if (s.reminder) out.push(`aviso ${s.reminder} si no la tomaste`);
  }
  if (s.training) {
    out.push(`después de entrenar, dentro de ${s.training.withinMinutes} min`);
    out.push(s.training.restDayTime ? `sin entreno, a las ${s.training.restDayTime}` : "sin entreno, no");
  }
  if (s.meals.length) out.push(listJoin(s.meals.map(mealPhrase)));
  if (s.bedtime) out.push("antes de dormir");
  return out.join(" · ");
}

// ── The editor's two questions ───────────────────────────────────────────

/** «¿Cada cuándo?» */
export type Frequency = "daily" | "someDays" | "everyN" | "monthly" | "asNeeded";
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Diario" },
  { value: "someDays", label: "Algunos días" },
  { value: "everyN", label: "Cada N semanas" },
  { value: "monthly", label: "Cada mes" },
  { value: "asNeeded", label: "Cuando haga falta" },
];

/** «¿Cuándo durante el día?» */
export type Timing = "fixed" | "window" | "anyTime" | "training" | "meal" | "bedtime" | "asNeeded";
export const TIMINGS: { value: Exclude<Timing, "asNeeded">; label: string; symbol: SFSymbol }[] = [
  { value: "fixed", label: "A una hora", symbol: "clock" },
  { value: "window", label: "En la mañana…", symbol: "sun.max" },
  { value: "anyTime", label: "Cualquier hora", symbol: "calendar.badge.checkmark" },
  { value: "training", label: "Después de entrenar", symbol: "figure.strengthtraining.traditional" },
  { value: "meal", label: "Con una comida", symbol: "fork.knife" },
  { value: "bedtime", label: "Antes de dormir", symbol: "bed.double.fill" },
];
export const TIMING_SYMBOL: Record<Timing, SFSymbol> = { ...Object.fromEntries(TIMINGS.map((t) => [t.value, t.symbol])), asNeeded: "hand.tap" } as Record<Timing, SFSymbol>;

export function frequencyOf(s: MedicationSchedule): Frequency {
  if (s.asNeeded) return "asNeeded";
  if (s.monthDay != null) return "monthly";
  if (s.interval) return "everyN";
  return s.days.length ? "someDays" : "daily";
}

/** The editor's view of it. A mixed schedule (from the Coach) shows its first part. */
export function timingOf(s: MedicationSchedule): Timing {
  if (s.asNeeded) return "asNeeded";
  if (s.anyTime) return "anyTime";
  if (s.windows.length) return "window";
  if (s.training) return "training";
  if (s.meals.length) return "meal";
  if (s.bedtime) return "bedtime";
  return "fixed";
}

export const DEFAULT_TRAINING: TrainingRule = { withinMinutes: 60, restDayTime: "09:00" };

/**
 * Switches the frequency, keeping the timing; the new one starts from `today`.
 * «Cuando haga falta» has no timing, so it drops it; coming back starts at 08:00.
 */
export function adoptFrequency(s: MedicationSchedule, f: Frequency, today: string): MedicationSchedule {
  if (f === frequencyOf(s)) return s;
  if (f === "asNeeded") return AS_NEEDED;
  const weekday = isoWeekday(today);
  const next: MedicationSchedule = { ...s, asNeeded: false, interval: f === "everyN" ? s.interval : null, monthDay: f === "monthly" ? s.monthDay : null };
  if (f === "daily") next.days = [];
  if (f === "someDays" && !next.days.length) next.days = [weekday];
  if (f === "everyN") {
    next.interval = { every: 2, unit: "week", start: today };
    if (!next.days.length) next.days = [weekday];
  }
  if (f === "monthly") {
    next.days = [];
    next.monthDay = Number(today.slice(8, 10)) || 1;
  }
  if (!hasSlots(next)) next.times = ["08:00"];
  return next;
}

/**
 * Switches to a timing, keeping the frequency and nothing of the other timings:
 * the new one starts with a sensible default (any time without a reminder). On
 * a mixed schedule, the chosen part keeps its settings.
 */
export function becomeTiming(s: MedicationSchedule, t: Timing): MedicationSchedule {
  if (t === timingOf(s) && !isMixed(s)) return s;
  if (t === "asNeeded") return AS_NEEDED;
  const base = schedule({ days: s.days, interval: s.interval, monthDay: s.monthDay });
  switch (t) {
    case "fixed":
      return { ...base, times: s.times.length ? s.times : ["08:00"] };
    case "window":
      return { ...base, windows: s.windows.length ? s.windows : [windowOf("manana")] };
    case "anyTime":
      return { ...base, anyTime: true, reminder: s.anyTime ? s.reminder : null };
    case "training":
      return { ...base, training: s.training ?? DEFAULT_TRAINING };
    case "meal":
      return { ...base, meals: s.meals.length ? s.meals : ["desayuno"] };
    case "bedtime":
      return { ...base, bedtime: true };
  }
}

/** Toggles a fixed time; at least one stays, in order. */
export function toggleTime(times: string[], time: string): string[] {
  if (times.includes(time)) return times.length > 1 ? times.filter((t) => t !== time) : times;
  return [...times, time].sort();
}
/** Toggles a part of the day; at least one stays, in day order. */
export function toggleWindow(windows: DoseWindow[], part: DayPart): DoseWindow[] {
  if (windows.some((w) => w.part === part)) return windows.length > 1 ? windows.filter((w) => w.part !== part) : windows;
  const all = [...windows, windowOf(part)];
  return PARTS.flatMap((p) => all.filter((w) => w.part === p).slice(0, 1));
}
/** Toggles a meal; at least one stays, in meal order. */
export function toggleMeal(meals: DoseMeal[], meal: DoseMeal): DoseMeal[] {
  if (meals.includes(meal)) return meals.length > 1 ? meals.filter((m) => m !== meal) : meals;
  return MEALS.filter((m) => meals.includes(m) || m === meal);
}
/** Toggles a weekday; none means every day (unless `emptyMeansEvery` is off, for «cada N semanas»). At least one stays. */
export function toggleDay(days: number[], day: number, emptyMeansEvery = true): number[] {
  const set = new Set(days.length ? days : [1, 2, 3, 4, 5, 6, 7]);
  if (set.has(day)) {
    if (set.size === 1) return days;
    set.delete(day);
  } else set.add(day);
  return set.size === 7 && emptyMeansEvery ? [] : [...set].sort((a, b) => a - b);
}
/** The fixed-time quick picks. */
export const TIME_PICKS: { label: string; time: string; symbol: SFSymbol }[] = [
  { label: "Mañana", time: "08:00", symbol: "sunrise" },
  { label: "Mediodía", time: "14:00", symbol: "sun.max" },
  { label: "Tarde", time: "18:00", symbol: "sun.haze" },
  { label: "Noche", time: "22:00", symbol: "moon.stars" },
];
export const TRAINING_WINDOWS = [30, 45, 60, 90, 120];
export const INSTRUCTION_PRESETS = ["Con comida", "En ayunas", "Antes de dormir", "Con agua"];
/** A fixed time's label by the hour: «Mañana», «Mediodía», «Tarde», «Noche». */
export function timeLabel(time: string): string {
  const h = Math.floor(minutesOf(time) / 60);
  if (h >= 5 && h < 12) return "Mañana";
  if (h >= 12 && h < 16) return "Mediodía";
  if (h >= 16 && h < 21) return "Tarde";
  return "Noche";
}

// ── The editor's draft ───────────────────────────────────────────────────

export type MedicationDraft = {
  name: string;
  kind: MedicationKind;
  dose: number | null;
  unit: string;
  form: string | null;
  instructions: string | null;
  schedule: MedicationSchedule;
  startDate: string;
  endDate: string | null;
  stock: number | null;
  lowStockThreshold: number | null;
  active: boolean;
  notes: string | null;
};

export function newDraft(kind: MedicationKind, today: string): MedicationDraft {
  return {
    name: "",
    kind,
    dose: 1,
    unit: UNITS[kind][0]!,
    form: null,
    instructions: null,
    schedule: schedule({ times: ["08:00"] }),
    startDate: today,
    endDate: null,
    stock: null,
    lowStockThreshold: null,
    active: true,
    notes: null,
  };
}

export function draftOf(m: Medication): MedicationDraft {
  const { name, kind, dose, unit, form, instructions, schedule, startDate, endDate, stock, lowStockThreshold, active, notes } = m;
  return { name, kind, dose, unit, form, instructions, schedule, startDate, endDate, stock, lowStockThreshold, active, notes };
}

/** A nudge's schedule on an existing med, starting today so past as-needed days don't count as missed. */
export const draftFromNudge = (m: Medication, n: ScheduleNudge, today: string): MedicationDraft => ({
  ...draftOf(m),
  schedule: n.schedule,
  instructions: m.instructions ?? n.instructions,
  startDate: today,
});

/** Switching kind swaps in a unit that fits it, unless the person typed their own. */
export function adoptKind(d: MedicationDraft, kind: MedicationKind): MedicationDraft {
  const suggested = UNITS[d.kind].includes(d.unit);
  const unit = !d.name || (suggested && !UNITS[kind].includes(d.unit)) ? UNITS[kind][0]! : d.unit;
  return { ...d, kind, unit };
}

export function draftValid(d: MedicationDraft): boolean {
  return (
    d.name.trim().length > 0 &&
    (d.dose ?? 0) > 0 &&
    d.unit.trim().length > 0 &&
    (d.schedule.asNeeded || (hasSlots(d.schedule) && d.schedule.windows.every((w) => w.start < w.end)))
  );
}

const blank = (s: string | null) => (s?.trim() ? s.trim() : null);

/** What create_medication / edit_medication get: every field, null clears it. */
export function draftInput(d: MedicationDraft) {
  return {
    name: d.name.trim(),
    kind: d.kind,
    dose: d.dose ?? 1,
    unit: d.unit.trim(),
    form: blank(d.form),
    instructions: blank(d.instructions),
    schedule: d.schedule,
    startDate: d.startDate,
    endDate: d.endDate,
    stock: d.stock,
    lowStockThreshold: d.stock == null ? null : d.lowStockThreshold,
    active: d.active,
    notes: blank(d.notes),
  };
}

/** Common supplements with the schedule they're usually taken on. */
export type Preset = { name: string; symbol: SFSymbol; dose: number; unit: string; form: string; schedule: MedicationSchedule };
export const PRESETS: Preset[] = [
  { name: "Creatina", symbol: "bolt.fill", dose: 5, unit: "g", form: "polvo", schedule: schedule({ training: { withinMinutes: 60, restDayTime: "09:00" } }) },
  { name: "Proteína whey", symbol: "dumbbell.fill", dose: 1, unit: "cazo", form: "polvo", schedule: schedule({ training: { withinMinutes: 60, restDayTime: null } }) },
  { name: "Vitamina D", symbol: "sun.max.fill", dose: 1000, unit: "UI", form: "cápsula", schedule: schedule({ meals: ["desayuno"] }) },
  { name: "Omega 3", symbol: "drop.fill", dose: 1, unit: "cápsula", form: "cápsula", schedule: schedule({ meals: ["comida"] }) },
  { name: "Magnesio", symbol: "moon.stars.fill", dose: 300, unit: "mg", form: "comprimido", schedule: schedule({ bedtime: true }) },
];

/** «Creatina: 5 g, después de entrenar; los días sin entreno, a las 09:00.» */
export function presetSummary(p: Preset): string {
  const s = p.schedule;
  const when = s.training
    ? `después de entrenar${s.training.restDayTime ? `; los días sin entreno, a las ${s.training.restDayTime}` : "; los días sin entreno, no"}`
    : s.meals.length
      ? listJoin(s.meals.map(mealPhrase))
      : s.bedtime
        ? "antes de dormir"
        : listJoin(s.times);
  return `${p.name}: ${amount(p.dose)} ${p.unit}, ${when}.`;
}

/** Fills the draft with a preset, keeping which days it was on. */
export function applyPreset(d: MedicationDraft, p: Preset): MedicationDraft {
  return {
    ...d,
    kind: "suplemento",
    name: p.name,
    dose: p.dose,
    unit: p.unit,
    form: p.form,
    instructions: null,
    schedule: { ...p.schedule, days: d.schedule.days, interval: d.schedule.interval, monthDay: d.schedule.monthDay },
  };
}

/** «2 medicamentos · 3 suplementos». */
export function cabinetLine(meds: Medication[]): string {
  const n = (k: MedicationKind) => meds.filter((m) => m.kind === k && m.active).length;
  const meds_ = n("medicamento");
  const sups = n("suplemento");
  return [meds_ ? `${meds_} ${meds_ === 1 ? "medicamento" : "medicamentos"}` : null, sups ? `${sups} ${sups === 1 ? "suplemento" : "suplementos"}` : null].filter(Boolean).join(" · ");
}

/** «1 comprimido · Diario · 08:00 · Con comida», what a row in «Lo que tomas» says. */
export function medicationSummary(m: Medication): string {
  const out = [doseText(m)];
  if (!m.active) out.push("En pausa");
  else if (m.schedule.asNeeded) out.push("Cuando haga falta");
  else out.push(scheduleLine(m.schedule));
  if (m.instructions) out.push(m.instructions);
  return out.join(" · ");
}

// ── Today's timeline (TodayItem) ─────────────────────────────────────────

/**
 * `ahora`: due within the last hour (or a workout's window is open); `atrasada`: longer ago;
 * `entreno`: waiting for a workout; `dia`: due today at any time; `noToca`: scheduled, not today;
 * `aDemanda`: as-needed.
 */
export type ItemState = "tomada" | "omitida" | "ahora" | "atrasada" | "pendiente" | "entreno" | "dia" | "aDemanda" | "noToca";

export type TodayItem = {
  id: string;
  medication: Medication;
  state: ItemState;
  /** "HH:MM" it sits at: when taken, else when due; null with no time today. */
  at: string | null;
  /** «A las 09:00», «Con la comida · 14:00», «Después de entrenar», «Cuando haga falta». */
  when: string;
  /** «Tomada a las 09:56», «Toca ahora», «Se pasó hace 2 h», «próxima: dom 4 oct»… */
  line: string;
  /** The slot to log against; null for as-needed, extra intakes and days off. */
  slot: DoseSlot | null;
  /** Intakes logged today outside a slot, newest first. */
  intakes: DoseEvent[];
};

const LEFT: ItemState[] = ["ahora", "atrasada", "pendiente", "entreno", "dia"];
export const isLeft = (i: TodayItem) => LEFT.includes(i.state);
export const isTaken = (i: TodayItem) => i.state === "tomada" || (i.state === "aDemanda" && i.intakes.length > 0);
export const isPending = (s: { status: string }) => s.status === "pendiente" || s.status === "pospuesta";
export const ANY_TIME_LINE = "Hoy toca · cuando quieras";
export const DUE_NOW_MINUTES = 60;
const clockMs = (ms: number) => clockOf(new Date(ms));

/** «35 min», «1 h 20 min», «3 h». */
export function gap(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0 || minutes >= 180) return `${Math.round(minutes / 60)} h`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function slotWhen(s: DoseSlot): string {
  switch (s.moment) {
    case "hora":
      return `A las ${s.slot}`;
    case "dia":
      return "Cualquier hora";
    case "manana":
    case "tarde":
    case "noche":
      return s.window ? `${MOMENT_TITLE[s.moment]} · ${windowRange(s.window)}` : MOMENT_TITLE[s.moment];
    case "entreno":
      return s.training?.state === "rest" ? (s.time ? `Hoy descansas · ${s.time}` : "Hoy descansas") : MOMENT_TITLE.entreno;
    default:
      return s.time ? `${MOMENT_TITLE[s.moment]} · ${s.time}` : MOMENT_TITLE[s.moment];
  }
}

function slotStatus(s: DoseSlot, now: string): [ItemState, string] {
  if (s.status === "tomada") return ["tomada", s.takenAt ? `Tomada a las ${clockMs(s.takenAt)}` : "Tomada"];
  if (s.status === "omitida") return ["omitida", "Omitida"];
  const postponed = s.status === "pospuesta";
  if (s.moment === "dia") return ["dia", postponed ? "Pospuesta · hoy, cuando quieras" : ANY_TIME_LINE];
  if (s.window) {
    if (now < s.window.start) return ["pendiente", postponed ? "Pospuesta" : `Desde las ${s.window.start}`];
    return now <= s.window.end ? ["ahora", `Cuando quieras hasta las ${s.window.end}`] : ["atrasada", `Era ${MOMENT_TITLE[s.moment].toLowerCase()} · aún estás a tiempo hoy`];
  }
  if (!s.time) return ["entreno", s.training ? trainingStatus(s.training) : "Esperando el entreno"];
  if (s.training?.state === "trained" && s.training.until) return [now <= s.training.until ? "ahora" : "atrasada", trainingStatus(s.training)];
  if (s.time > now) return ["pendiente", postponed ? "Pospuesta" : `En ${gap(minutesOf(s.time) - minutesOf(now))}`];
  const late = minutesOf(now) - minutesOf(s.time);
  return late <= DUE_NOW_MINUTES ? ["ahora", "Toca ahora"] : ["atrasada", `Se pasó hace ${gap(late)}`];
}

/** When a med is due, read on a day it isn't: «Jueves · cualquier hora», «Cada 3 días · 08:00». */
function offWhen(s: MedicationSchedule): string {
  const weekly = s.days.length === 1 && !s.interval && s.monthDay == null;
  const frequency = weekly ? longDay(s.days[0]!) : frequencyLine(s);
  const summary = scheduleSummary(s);
  return cap([frequency, summary || null].filter(Boolean).join(" · "));
}

/** Why not today: «hoy es descanso», «próxima: mañana», «próxima: jue 8 oct», «empieza el 8 de octubre». */
function offLine(m: Medication, date: string): string {
  if (m.startDate > date) return `empieza el ${dayMonth(m.startDate)}`;
  if (!isDue(m.schedule, date)) {
    // Monthly and every-N schedules can be weeks away; a year covers every frequency.
    for (let i = 1; i <= 366; i++) {
      const day = addDays(date, i);
      if (m.endDate && day > m.endDate) break;
      if (isDue(m.schedule, day)) return i === 1 ? "próxima: mañana" : `próxima: ${shortDate(day)}`;
    }
    return "hoy no toca";
  }
  if (m.schedule.training && m.schedule.training.restDayTime == null) return "hoy es descanso";
  return "hoy no toca";
}

/** «ayer», «el domingo» (within the week), «el 12 de septiembre». */
function lastLabel(last: string, today: string): string {
  const ago = daysBetween(last, today);
  if (ago === 1) return "ayer";
  if (ago < 7) return `el ${longDay(isoWeekday(last))}`;
  return `el ${dayMonth(last)}`;
}

/**
 * Today, in order: timed items by the clock (taken ones when taken), then what
 * waits for a workout or is due any time, the as-needed meds not taken yet and
 * what isn't due today. `history` is the logged doses, newest first.
 */
export function todayItems(medications: Medication[], day: MedicationDay | null | undefined, history: DoseEvent[], now: Date): TodayItem[] {
  const date = dateKey(now);
  const time = clockOf(now);
  const slots = day?.date === date ? day.slots : [];
  const slotted = new Set(slots.map((s) => `${s.medicationId}|${s.slot}`));
  // Taken today but not on one of today's slots: as-needed intakes, or extras.
  const loose = history
    .filter((e) => e.date === date && e.status === "tomada" && (!e.scheduledTime || !slotted.has(`${e.medicationId}|${e.scheduledTime}`)))
    .sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0));

  const items: TodayItem[] = [];
  for (const med of medications) {
    if (!med.active) continue;
    const intakes = loose.filter((e) => e.medicationId === med.id);
    const at = intakes[0]?.takenAt ? clockMs(intakes[0].takenAt) : null;
    if (med.schedule.asNeeded) {
      let line: string;
      if (at) line = intakes.length === 1 ? `Tomada a las ${at}` : `${intakes.length} hoy · última a las ${at}`;
      else {
        const last = history.find((e) => e.medicationId === med.id && e.status === "tomada")?.date;
        line = last ? `Última ${lastLabel(last, date)}` : "Ninguna hoy";
      }
      items.push({ id: med.id, medication: med, state: "aDemanda", at, when: "Cuando haga falta", line, slot: null, intakes });
      continue;
    }
    const own = slots.filter((s) => s.medicationId === med.id);
    for (const slot of own) {
      const [state, line] = slotStatus(slot, time);
      items.push({ id: `${slot.medicationId}|${slot.date}|${slot.slot}`, medication: med, state, at: slot.takenAt ? clockMs(slot.takenAt) : slot.time, when: slotWhen(slot), line, slot, intakes: [] });
    }
    for (const intake of intakes) {
      const t = clockMs(intake.takenAt ?? 0);
      items.push({ id: intake.id, medication: med, state: "tomada", at: t, when: "Fuera de horario", line: `Tomada a las ${t}`, slot: null, intakes: [intake] });
    }
    if (!own.length && !intakes.length && !(med.endDate && date > med.endDate))
      items.push({ id: med.id, medication: med, state: "noToca", at: null, when: offWhen(med.schedule), line: offLine(med, date), slot: null, intakes: [] });
  }
  const rank = (i: TodayItem) => (i.state === "aDemanda" ? (i.at == null ? 2 : 0) : i.state === "entreno" || i.state === "dia" ? 1 : i.state === "noToca" ? 3 : 0);
  return items.sort((a, b) => rank(a) - rank(b) || (a.at ?? "99").localeCompare(b.at ?? "99") || a.medication.name.localeCompare(b.medication.name));
}

/** As-needed meds taken most days and not yet today: the engine's daily suggestions, plus any taken on 4 of the last 7 days. */
export const USUAL_DAYS = 4;
export function usual(items: TodayItem[], nudges: ScheduleNudge[], history: DoseEvent[], now: Date): string[] {
  const today = dateKey(now);
  const weekAgo = addDays(today, -7);
  const suggested = new Set(nudges.filter((n) => n.cadence === "daily").map((n) => n.medicationId));
  return items
    .filter((i) => {
      if (i.state !== "aDemanda" || i.intakes.length) return false;
      if (suggested.has(i.medication.id)) return true;
      const days = new Set(history.filter((e) => e.medicationId === i.medication.id && e.status === "tomada" && e.date >= weekAgo && e.date < today).map((e) => e.date));
      return days.size >= USUAL_DAYS;
    })
    .map((i) => i.medication.name);
}

/** The hero's words: what's left, done, or nothing due. */
export function heroText(items: TodayItem[], usualNames: string[]) {
  const left = items.filter(isLeft);
  const slots = items.filter((i) => i.slot);
  const taken = items
    .flatMap((i) => (i.state === "tomada" ? [{ name: i.medication.name, at: i.at ?? "" }] : i.state === "aDemanda" ? i.intakes.map((e) => ({ name: i.medication.name, at: e.takenAt ? clockMs(e.takenAt) : "" })) : []))
    .sort((a, b) => a.at.localeCompare(b.at));
  const free = !slots.length && !taken.length;
  const done = !left.length && !free;
  const settled = slots.filter((i) => i.state === "tomada" || i.state === "omitida").length;
  const progress = slots.length ? settled / slots.length : taken.length ? 1 : 0;
  const names = [...new Set(left.map((i) => i.medication.name))];
  const headline = left.length ? `Te falta: ${listJoin(names)}` : done ? "Todo listo por hoy" : usualNames.length ? "Nada programado" : "Nada pendiente hoy";
  const usualLine = usualNames.length ? `${listJoin(usualNames)} cuando ${usualNames.length === 1 ? "la" : "las"} tomes` : null;
  const takenLine = taken.length ? `Tomado hoy: ${taken.map((t) => `${t.name} ${t.at}`).join(" · ")}` : null;
  const late = left.some((i) => i.state === "atrasada");
  return { left: left.length, free, done, progress, headline, usualLine, takenLine, late };
}

// ── Adherence and history ────────────────────────────────────────────────

export const HEATMAP_MIN_DAYS = 7;
export const rateText = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)} %`);
export const dayRate = (d: AdherenceDay) => (d.due > 0 ? d.taken / d.due : null);

/** The 30-day series as week columns of 7 weekday rows (lunes first); days outside are null. */
export function heatmapColumns<T extends { date: string }>(days: T[]): (T | null)[][] {
  if (!days.length) return [];
  const lead = isoWeekday(days[0]!.date) - 1;
  const cells: (T | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const cols: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
  return cols;
}

export const HISTORY_DAYS = 60;
/** The log by day, newest first; each day's doses newest first. */
export function historyByDay(doses: DoseEvent[]): { date: string; doses: DoseEvent[] }[] {
  const byDate = new Map<string, DoseEvent[]>();
  for (const d of sortHistory(doses)) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);
  return [...byDate.keys()].sort((a, b) => b.localeCompare(a)).map((date) => ({ date, doses: byDate.get(date)! }));
}
/** Newest first: by takenAt, then date, then slot. */
export const sortHistory = (doses: DoseEvent[]) =>
  [...doses].sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0) || b.date.localeCompare(a.date) || (b.scheduledTime ?? "").localeCompare(a.scheduledTime ?? ""));

export const STATUS_LABEL: Record<string, string> = { tomada: "Tomada", omitida: "Omitida", pospuesta: "Pospuesta", pendiente: "Pendiente" };

// ── Reminders (MedicationNotifications.plan) ─────────────────────────────

export const REMINDER_PREFIX = "pulso.medication.";
export const MAX_PENDING = 56;
export const CATCH_UP_DELAY_MS = 5_000;
export const SNOOZE_MINUTES = 15;

export type Reminder = {
  id: string;
  medicationId: string;
  date: string;
  /** The slot key it logs under. */
  slot: string;
  title: string;
  body: string;
  fireAt: number;
  /** A workout already ended and the dose is still pending: it fires right away, once. */
  catchUp: boolean;
};

/** `DoseSlot`'s identity: medication, date and slot key. */
export const slotId = (s: { medicationId: string; date: string; slot: string }) => `${s.medicationId}|${s.date}|${s.slot}`;
export const reminderId = (s: { medicationId: string; date: string; slot: string }) => `${REMINDER_PREFIX}${s.medicationId}.${s.date}.${s.slot}`;

/** «Toma tu creatina» after training; the med's name otherwise. */
export const reminderTitle = (s: DoseSlot) => (s.moment === "entreno" ? `Toma tu ${s.name.toLowerCase()}` : s.name);

export function reminderBody(s: DoseSlot): string {
  const out = [doseText(s)];
  if (s.moment === "entreno") {
    if (s.training?.state === "trained" && s.training.until) out.push(`antes de las ${s.training.until}`);
    else if (!s.time) out.push("hoy sin entreno");
  } else if (s.moment === "dia") out.push("hoy, cuando puedas");
  else if (s.moment !== "hora") out.push(MOMENT_TITLE[s.moment].toLowerCase());
  if (s.instructions) out.push(s.instructions);
  return out.join(" · ");
}

/**
 * Reminders from the engine's resolved slots, soonest first, capped to what iOS keeps.
 * - A slot with a time fires then.
 * - An any-time or day-part slot fires at its `remindAt`, or not at all without one.
 * - A slot waiting for a workout fires at its rest-day `fallback`; a workout replans it.
 * - A workout that already ended with the dose pending fires in a few seconds while still
 *   within its window, unless it already did (`nudged` holds slot ids).
 */
export function planReminders(slots: DoseSlot[], now: number, nudged: ReadonlySet<string> = new Set()): Reminder[] {
  const out: Reminder[] = [];
  for (const s of slots) {
    if (s.status !== "pendiente") continue;
    let fireAt: number | null = null;
    let catchUp = false;
    if (isFlexible(s.moment)) {
      const at = s.remindAt ? instant(s.date, s.remindAt).getTime() : null;
      if (at && at > now) fireAt = at;
    } else if (s.time) {
      const at = instant(s.date, s.time).getTime();
      if (at > now) fireAt = at;
      else if (s.training?.state === "trained" && s.training.until && !nudged.has(slotId(s)) && instant(s.date, s.training.until).getTime() > now) {
        fireAt = now + CATCH_UP_DELAY_MS;
        catchUp = true;
      }
    } else if (s.training?.fallback) {
      const at = instant(s.date, s.training.fallback).getTime();
      if (at > now) fireAt = at;
    }
    if (fireAt == null) continue;
    out.push({ id: reminderId(s), medicationId: s.medicationId, date: s.date, slot: s.slot, title: reminderTitle(s), body: reminderBody(s), fireAt, catchUp });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt).slice(0, MAX_PENDING);
}

/**
 * Which of the phone's scheduled requests to cancel before scheduling `planned`:
 * every plain dose reminder of ours; a snooze or a catch-up (short timers) only
 * once its dose is no longer pending in `slots`.
 */
export function staleReminders(scheduled: string[], slots: DoseSlot[]): string[] {
  const open = new Set(slots.filter(isPending).map(reminderId));
  return scheduled.filter((id) => {
    if (!id.startsWith(REMINDER_PREFIX)) return false;
    const base = id.replace(/\.(snooze|catchup)$/, "");
    return base === id || !open.has(base);
  });
}

export { DEFAULT_ANY_TIME_REMINDER };
