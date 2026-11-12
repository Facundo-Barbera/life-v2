import type { BlockDiff, BlockDiffItem, ProgramWeek, SessionInstance, SetLog, TrainingBlock, TrainingSession, WeekDay } from "@/contract";

// Entreno's week and day selector: which week and day open by default, each
// day's mark in the pills, stepping across weeks, and what the hero offers for
// the chosen day. Pure, so it is tested without React.

/** A day's mark in the pills: hecho, a medias, hoy/siguiente (lime), pendiente, saltado. */
export type DayMark = "done" | "partial" | "next" | "planned" | "skipped";

/** A selected day: the week's number and the day's index in it. */
export type DayPick = { week: number; index: number };

/** What the hero offers for the chosen day. */
export type DayAction =
  /** EMPEZAR (for a later week too: «Empezar ya», it counts for the current week). */
  | "start"
  /** The current week is complete: «Empezar la semana N ya» first. */
  | "startWeek"
  /** It was done (or half done): what was lifted and «Ver sesión». */
  | "logged"
  /** A past week's day that wasn't done. */
  | "missed";

/**
 * A card's day: one dated session of the week (its template's `dayId`, with
 * `instanceId`, `date`, `time` and whether it is Siguiente), or, for a week
 * without dated sessions, the program day as before.
 */
export type CardDay = WeekDay & { instanceId?: string; date?: string; time?: string | null; next?: boolean; edited?: boolean };

const STATUS: Record<SessionInstance["status"], WeekDay["status"]> = { done: "done", planned: "planned", missed: "missed", skipped: "missed" };

/**
 * The week's cards by date: its dated sessions in order (a done one keeps its
 * day's «a medias» and its logged session), else its program days.
 */
export function datedWeek(week: ProgramWeek, nextInstanceId: string | null): ProgramWeek {
  const instances = (week.instances ?? []).filter((i) => i.templateDayId);
  if (!instances.length) return week;
  const days = instances.map((i): CardDay => {
    const own = week.days.find((d) => d.dayId === i.templateDayId);
    const sessions = own?.sessions.filter((s) => s.id === i.sessionId) ?? [];
    const status = i.status === "done" && own?.status === "partial" ? "partial" : STATUS[i.status];
    return { dayId: i.templateDayId!, name: i.name, status, sessions, instanceId: i.id, date: i.date, time: i.time, next: i.id === nextInstanceId, edited: i.edited };
  });
  return { ...week, days, done: days.filter((d) => d.status === "done" || d.status === "partial").length };
}

/** The block with every week's cards by date (`datedWeek`). */
export const datedBlock = (block: TrainingBlock, nextInstanceId: string | null): TrainingBlock => ({ ...block, weeks: block.weeks.map((w) => datedWeek(w, nextInstanceId)) });

export function dayMark(day: CardDay, week: ProgramWeek, nextDayId: string | null): DayMark {
  if (day.status === "done" || day.status === "partial") return day.status;
  if (day.status === "missed") return "skipped";
  if (week.state !== "current") return "planned";
  return (day.next ?? day.dayId === nextDayId) ? "next" : "planned";
}

const SHORT_DAY = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", timeZone: "UTC" });
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

/** «Hoy · 18:00», «Mañana», «jue 29 · 07:30»: when a card's dated session is; null for a program day. */
export function cardWhen(day: CardDay, now = new Date()): string | null {
  if (!day.date) return null;
  const today = localDate(now);
  const tomorrow = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const label = day.date === today ? "Hoy" : day.date === tomorrow ? "Mañana" : SHORT_DAY.format(new Date(`${day.date}T12:00:00Z`));
  return day.time ? `${label} · ${day.time}` : label;
}

/** The card's session is today's. */
export const isToday = (day: CardDay, now = new Date()) => day.date === localDate(now);

/**
 * The current week's next day; once the week is complete and the next one may
 * start, that week's first day; otherwise the current week's first day still
 * planned, or its last.
 */
export function defaultPick(block: TrainingBlock, nextDayId: string | null): DayPick {
  const week = block.weeks.find((w) => w.number === block.currentWeek) ?? block.weeks[0];
  if (!week) return { week: block.currentWeek, index: 0 };
  const marked = week.days.findIndex((d: CardDay) => d.next);
  const next = marked >= 0 ? marked : week.days.findIndex((d: CardDay) => d.next === undefined && d.dayId === nextDayId);
  if (next >= 0) return { week: week.number, index: next };
  const following = block.weeks.find((w) => w.number === week.number + 1);
  if (block.weekComplete && block.canStartNextWeek && following?.days.length) return { week: following.number, index: 0 };
  const planned = week.days.findIndex((d) => d.status === "planned");
  return { week: week.number, index: planned >= 0 ? planned : Math.max(0, week.days.length - 1) };
}

/** A pick that still exists in `block` (weeks and days can change under it). */
export function clampPick(block: TrainingBlock, pick: DayPick): DayPick | null {
  const week = block.weeks.find((w) => w.number === pick.week);
  if (!week?.days.length) return null;
  return { week: week.number, index: Math.min(Math.max(0, pick.index), week.days.length - 1) };
}

/** The day before (-1) or after (1) `pick`, crossing into the neighbouring week; null at the block's ends. */
export function stepPick(block: TrainingBlock, pick: DayPick, dir: 1 | -1): DayPick | null {
  const i = block.weeks.findIndex((w) => w.number === pick.week);
  const week = block.weeks[i];
  if (!week) return null;
  const index = pick.index + dir;
  if (index >= 0 && index < week.days.length) return { week: week.number, index };
  for (let j = i + dir; j >= 0 && j < block.weeks.length; j += dir) {
    const w = block.weeks[j]!;
    if (w.days.length) return { week: w.number, index: dir > 0 ? 0 : w.days.length - 1 };
  }
  return null;
}

/**
 * A card in Entreno's scroll (and its pill): one per day of the week, plus an
 * edge card at each end that leads into the neighbouring week (its day next to
 * this week's), so scrolling past the last day reaches «Semana N ›».
 */
export type WeekCard = { key: string; pick: DayPick; /** -1: the previous week's card, 1: the next week's. */ edge?: 1 | -1 };

export function weekCards(block: TrainingBlock, weekNumber: number): WeekCard[] {
  const week = block.weeks.find((w) => w.number === weekNumber);
  if (!week?.days.length) return [];
  const days: WeekCard[] = week.days.map((_, index) => ({ key: `${week.number}:${index}`, pick: { week: week.number, index } }));
  const prev = stepPick(block, days[0]!.pick, -1);
  const next = stepPick(block, days.at(-1)!.pick, 1);
  return [
    ...(prev ? [{ key: `edge:${prev.week}:${prev.index}`, pick: prev, edge: -1 as const }] : []),
    ...days,
    ...(next ? [{ key: `edge:${next.week}:${next.index}`, pick: next, edge: 1 as const }] : []),
  ];
}

/** The same day index in another week (the closest one it has). */
export function pickInWeek(block: TrainingBlock, from: DayPick, week: number): DayPick | null {
  return clampPick(block, { week, index: from.index });
}

/**
 * The selection resets to the default when this changes: a session logged,
 * a week started. Otherwise a background refresh keeps what the person chose.
 */
export const selectionKey = (block: TrainingBlock, nextDayId: string | null, nextInstanceId: string | null = null) =>
  `${block.programId}:${block.currentWeek}:${nextInstanceId ?? nextDayId ?? "-"}:${block.weekComplete ? 1 : 0}`;

export function dayAction(block: TrainingBlock, week: ProgramWeek, mark: DayMark): DayAction {
  if (mark === "done" || mark === "partial") return "logged";
  if (mark === "skipped" || week.state === "past") return "missed";
  if (week.state === "future" && block.weekComplete && block.canStartNextWeek && week.number === block.currentWeek + 1) return "startWeek";
  return "start";
}

/** «Repetir» exists for a day done in the current week (as the old week list offered). */
export const canRepeat = (week: ProgramWeek, mark: DayMark) => week.state === "current" && mark === "done";

/** Days done or half done over all of the block's days, 0–1. */
export function blockProgress(block: TrainingBlock): number {
  const total = block.weeks.reduce((n, w) => n + w.days.length, 0);
  const done = block.weeks.reduce((n, w) => n + w.days.filter((d) => d.status === "done" || d.status === "partial").length, 0);
  return total ? done / total : 0;
}

/** kg × reps over every segment of every set. */
export const sessionVolume = (s: Pick<TrainingSession, "sets">) =>
  s.sets.reduce((n, x) => n + (x.segments?.length ? x.segments : [x]).reduce((m, seg) => m + seg.weightKg * seg.reps, 0), 0);

export type TopSet = { exerciseId: string; weightKg: number; reps: number; sets: number };

/** Per exercise, in the order first done: its heaviest set (most reps on a tie) and how many sets. */
export function topSets(sets: SetLog[]): TopSet[] {
  const out = new Map<string, TopSet>();
  for (const s of sets) {
    const top = out.get(s.exerciseId);
    if (!top) out.set(s.exerciseId, { exerciseId: s.exerciseId, weightKg: s.weightKg, reps: s.reps, sets: 1 });
    else {
      top.sets += 1;
      if (s.weightKg > top.weightKg || (s.weightKg === top.weightKg && s.reps > top.reps)) Object.assign(top, { weightKg: s.weightKg, reps: s.reps });
    }
  }
  return [...out.values()];
}

// ── The block's plan ─────────────────────────────────────────────────────────

/** «Semana 3 de 6» for the week chosen, and whether it is a deload. */
export function weekLabel(block: Pick<TrainingBlock, "weeks">, week: Pick<ProgramWeek, "number" | "deload">): { title: string; deload: boolean } {
  return { title: `Semana ${week.number} de ${block.weeks.length}`, deload: week.deload };
}

/** What the week changes, one line each; the notes' sentence when there is nothing else. */
export function weekLines(week: Pick<ProgramWeek, "changes" | "note">): string[] {
  return week.changes?.length ? week.changes : week.note ? [week.note] : [];
}

/** A proposal's diff as the card shows it: the sections with something in them, changes first. */
export function diffSections(diff: BlockDiff): { title: string; tone: "accent" | "muted" | "negative"; items: BlockDiffItem[] }[] {
  const sections = [
    { title: "Cambia", tone: "accent" as const, items: diff.change },
    { title: "Entra", tone: "accent" as const, items: diff.add },
    { title: "Sale", tone: "negative" as const, items: diff.remove },
    { title: "Se queda", tone: "muted" as const, items: diff.keep },
  ];
  return sections.filter((s) => s.items.length > 0);
}
