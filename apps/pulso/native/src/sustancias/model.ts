import type { Substance, SubstanceAmount, SubstanceContext, SubstanceEntry, SubstanceOverview, SubstanceSummary } from "@/contract";
import type { SFSymbol } from "expo-symbols";
import { addDays, clockOf, dateKey, daysBetween, historyDayTitle } from "@/medicacion/model";

// Sustancias' pure rules, ported from the SwiftUI app (Features/Substances):
// how an entry and a summary read, the heatmap's levels, the log sheet's and
// the substance editor's drafts, the order of substances and the Face ID
// gate's one-shot grant. Neutral words on purpose: a private log, never a verdict.

/** The neutral symbol it shows under in Ajustes and as a substance's default. */
export const NEUTRAL_SYMBOL: SFSymbol = "circle.dashed";
export const CANNABIS = "cannabis";

export const AMOUNTS: SubstanceAmount[] = ["poco", "normal", "mucho"];
export const AMOUNT_LABEL: Record<SubstanceAmount, string> = { poco: "Poco", normal: "Normal", mucho: "Mucho" };
export const CONTEXTS: SubstanceContext[] = ["social", "solo", "dormir", "estres", "otro"];
export const CONTEXT_LABEL: Record<SubstanceContext, string> = { social: "Social", solo: "Solo", dormir: "Para dormir", estres: "Estrés", otro: "Otro" };

export const TIME_SYMBOL: Record<string, SFSymbol> = { manana: "sunrise", tarde: "sun.max", noche: "moon", madrugada: "moon.stars" };
export const CORRELATION_SYMBOL: Record<string, SFSymbol> = {
  sleep_minutes: "bed.double",
  sleep_score: "bed.double",
  hrv: "waveform.path.ecg",
  resting_hr: "heart",
  readiness: "gauge.with.dots.needle.67percent",
  late_eating: "fork.knife",
};

export const days = (n: number) => (n === 1 ? "día" : "días");
export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** A unit as a field label: «Tragos», but «mg» stays an abbreviation. */
export const unitLabel = (unit: string) => (unit.length <= 2 ? unit : capFirst(unit));
export const UNIT_SUGGESTIONS = ["sesiones", "mg", "ml", "unidades", "tragos"];
export const SYMBOL_SUGGESTIONS = ["🌿", "🍷", "🍺", "☕️", "🚬", "💊", "leaf", "wineglass", "cup.and.saucer", "pills", "smoke", "drop"];

const SINGULAR: Record<string, string> = { sesiones: "sesión", unidades: "unidad", tragos: "trago", veces: "vez", caladas: "calada", cigarrillos: "cigarrillo", bebidas: "bebida", dosis: "dosis" };
/** «2 tragos», «1 trago», «2,5 mg». */
export function quantityText(value: number, unit: string): string {
  const n = String(Math.round(value * 10) / 10).replace(".", ",");
  return `${n} ${value === 1 ? (SINGULAR[unit.toLowerCase()] ?? unit) : unit}`;
}
/** An SF Symbol for the forms Pulso knows; null for the person's own. */
export function formSymbol(form: string): SFSymbol | null {
  switch (form.toLowerCase()) {
    case "fumado":
      return "smoke";
    case "vapeado":
      return "cloud";
    case "comestible":
      return "fork.knife";
    case "bebido":
    case "bebida":
      return "cup.and.saucer";
    default:
      return null;
  }
}

/** How a substance's symbol draws: an emoji as text, else an SF Symbol name (the neutral one when empty or not a symbol name). */
export type Glyph = { kind: "emoji"; text: string } | { kind: "symbol"; name: SFSymbol };
const EMOJI = /\p{Extended_Pictographic}/u;
const SYMBOL_NAME = /^[a-z0-9]+(\.[a-z0-9]+)*$/;
export function glyph(symbol: string | null | undefined): Glyph {
  const text = symbol?.trim() ?? "";
  if (text && [...text].length <= 3 && EMOJI.test(text)) return { kind: "emoji", text };
  if (SYMBOL_NAME.test(text)) return { kind: "symbol", name: text as SFSymbol };
  return { kind: "symbol", name: NEUTRAL_SYMBOL };
}

/** «Hoy, 21:30», «Ayer, 21:30», «Hace 3 días». */
export function lastUseText(date: string, time: string, today: string): string {
  const n = daysBetween(date, today);
  if (n <= 0) return `Hoy, ${time}`;
  if (n === 1) return `Ayer, ${time}`;
  return `Hace ${n} días`;
}
/** The hero's caption: «Último registro: ayer, 21:30». */
export const lastUseCaption = (s: SubstanceSummary) => (s.lastUse ? `Último registro: ${lowerFirst(lastUseText(s.lastUse.date, s.lastUse.time, s.today))}` : null);

/** «Fumado · Normal»; the name first when entries of several substances mix, and the name alone for a missing form. */
export function entryTitle(e: Pick<SubstanceEntry, "form" | "amount">, substanceName: string, showingName: boolean): string {
  const out: string[] = [];
  if (showingName || !e.form) out.push(substanceName);
  if (e.form) out.push(capFirst(e.form));
  out.push(AMOUNT_LABEL[e.amount] ?? capFirst(e.amount));
  return out.join(" · ");
}
/** «Hoy · 21:30 · Social». */
export function entrySubtitle(e: Pick<SubstanceEntry, "date" | "time" | "context">, today: string): string {
  return [historyDayTitle(e.date, today), e.time, e.context ? CONTEXT_LABEL[e.context] : null].filter(Boolean).join(" · ");
}
/** «10 mg THC», «2 tragos», or nothing. */
export function entryDetail(e: Pick<SubstanceEntry, "thcMg" | "quantity">, unit: string): string | null {
  if (e.thcMg != null) return `${String(Math.round(e.thcMg * 10) / 10).replace(".", ",")} mg THC`;
  if (e.quantity != null) return quantityText(e.quantity, unit);
  return null;
}

/** Nothing ever logged for this substance (or any, for Todas). */
export const isEmpty = (o: SubstanceOverview) => !o.summary.lastUse && !o.entries.length;

/** A heatmap level's opacity: one calm tint, darker = more; never red or green. */
export function levelOpacity(level: number): number {
  if (level <= 0) return 0.1;
  if (level === 1) return 0.38;
  if (level === 2) return 0.65;
  return 0.95;
}

/** «Semana del 6 oct: 2 días», «Promedio 1,5 por semana», «Esta semana: 2». */
export function weeksReadout(s: SubstanceSummary, selected: { weekStart: string; days: number } | null): string {
  if (selected) {
    const [, m, d] = selected.weekStart.split("-").map(Number);
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
    return `Semana del ${d} ${months[(m ?? 1) - 1]}: ${selected.days} ${days(selected.days)}`;
  }
  if (s.avgDaysPerWeek != null) return `Promedio ${String(Math.round(s.avgDaysPerWeek * 10) / 10).replace(".", ",")} por semana`;
  return `Esta semana: ${s.daysThisWeek}`;
}

// ── The log sheet's draft ────────────────────────────────────────────────

export type UseDraft = {
  substanceId: string;
  date: string;
  time: string;
  form: string | null;
  amount: SubstanceAmount;
  quantity: number | null;
  thcMg: number | null;
  context: SubstanceContext | null;
  note: string;
};

/** The common case is one tap: now, this substance, its first form, Normal. */
export const newUse = (s: Substance, now: Date): UseDraft => ({
  substanceId: s.id,
  date: dateKey(now),
  time: clockOf(now),
  form: s.forms[0] ?? null,
  amount: "normal",
  quantity: null,
  thcMg: null,
  context: null,
  note: "",
});

export const useOf = (e: SubstanceEntry): UseDraft => ({
  substanceId: e.substanceId,
  date: e.date,
  time: e.time,
  form: e.form,
  amount: e.amount,
  quantity: e.quantity,
  thcMg: e.thcMg,
  context: e.context,
  note: e.note ?? "",
});

/** mg of THC only means something for cannabis edibles. */
export const showsThc = (d: UseDraft) => d.substanceId === CANNABIS && d.form === "comestible";

/** Moving to another substance keeps the form only if that one has it too. */
export const switchSubstance = (d: UseDraft, s: Substance): UseDraft => ({ ...d, substanceId: s.id, form: d.form && s.forms.includes(d.form) ? d.form : (s.forms[0] ?? null) });

/** Not in the future: a time later than now today is clamped to now. */
export function clampToNow(d: UseDraft, now: Date): UseDraft {
  const today = dateKey(now);
  if (d.date > today) return { ...d, date: today, time: clockOf(now) };
  if (d.date === today && d.time > clockOf(now)) return { ...d, time: clockOf(now) };
  return d;
}

/** What record_substance_use / update_substance_use get: every field, null clears it. */
export function useInput(d: UseDraft) {
  const note = d.note.trim();
  return {
    substanceId: d.substanceId,
    date: d.date,
    time: d.time,
    form: d.form,
    amount: d.amount,
    quantity: d.quantity != null && d.quantity > 0 ? d.quantity : null,
    thcMg: showsThc(d) && d.thcMg != null && d.thcMg > 0 ? d.thcMg : null,
    context: d.context,
    note: note || null,
  };
}

/** The log sheet's choices: active substances, plus an archived one an old entry belongs to. */
export function choices(substances: Substance[], current: string): Substance[] {
  const active = substances.filter((s) => !s.archived);
  const own = substances.find((s) => s.id === current);
  return own?.archived ? [...active, own] : active;
}

// ── The substance editor's draft ─────────────────────────────────────────

export type Definition = { name: string; symbol: string; unit: string; forms: string[]; maxDaysPerWeek: number | null };
export const emptyDefinition = (): Definition => ({ name: "", symbol: "", unit: "", forms: [], maxDaysPerWeek: null });
export const definitionOf = (s: Substance): Definition => ({ name: s.name, symbol: s.symbol ?? "", unit: s.unit, forms: s.forms, maxDaysPerWeek: s.maxDaysPerWeek });
export const definitionValid = (d: Definition) => d.name.trim().length > 0;

/** Adds a form unless it's blank or already there (any case). */
export function addForm(forms: string[], form: string): string[] {
  const f = form.trim();
  if (!f || forms.some((x) => x.toLowerCase() === f.toLowerCase())) return forms;
  return [...forms, f];
}

/** Trimmed; forms deduped; an empty unit is left out so the engine keeps (or defaults) it; symbol and goal go as null to clear. */
export function definitionPatch(d: Definition) {
  const symbol = d.symbol.trim();
  const unit = d.unit.trim();
  const seen = new Set<string>();
  const forms = d.forms.map((f) => f.trim()).filter((f) => f && !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase()));
  return { name: d.name.trim(), symbol: symbol || null, ...(unit ? { unit } : {}), forms, maxDaysPerWeek: d.maxDaysPerWeek };
}

/** «Tragos · Fumado, Vapeado · Máx. 2 días/sem». */
export function substanceDetail(s: Substance): string {
  const out = [unitLabel(s.unit)];
  if (s.forms.length) out.push(s.forms.map(capFirst).join(", "));
  if (s.maxDaysPerWeek != null) out.push(`Máx. ${s.maxDaysPerWeek} ${days(s.maxDaysPerWeek)}/sem`);
  return out.join(" · ");
}

/** Active ones by position, then archived ones by position. */
export const sortSubstances = (list: Substance[]) => [...list].sort((a, b) => Number(a.archived) - Number(b.archived) || a.position - b.position);

/** The active ids with `id` moved one place up (-1) or down (+1); unchanged at an edge. */
export function moveId(ids: string[], id: string, by: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

// ── The Face ID gate ─────────────────────────────────────────────────────

/** How long a check made in Ajustes stays good for the screen it opens. */
export const GRANT_MS = 15_000;

/**
 * One-shot permission to open Sustancias: Ajustes grants it after a fresh check,
 * the screen consumes it on arrival. Anything else (a deep link, coming back to
 * a screen left open) finds none and asks again.
 */
export function createGate() {
  let grantedAt: number | null = null;
  return {
    grant(now = Date.now()) {
      grantedAt = now;
    },
    consume(now = Date.now()): boolean {
      const ok = grantedAt != null && now - grantedAt <= GRANT_MS;
      grantedAt = null;
      return ok;
    },
  };
}

export { addDays };
