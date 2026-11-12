// Pure formatting for Hoy (tested): the mock's mono date line, local day keys,
// clock times, durations and the readiness words.

const DAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

const pad = (n: number) => String(n).padStart(2, "0");

/** «MIÉ 21 OCT» */
export const headerDate = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** Local «YYYY-MM-DD». */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local «HH:MM». */
export const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Minutes as «7:24» (sleep, a delta). */
export const hm = (minutes: number) => {
  const m = Math.round(Math.abs(minutes));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
};

/** The pill under the gauge, by readiness level, and the night version after 20:00. */
export function readinessWord(level: "high" | "medium" | "low" | "unknown", at: Date): string {
  const night = at.getHours() >= 20 || at.getHours() < 5;
  if (level === "unknown") return "SIN DATOS TODAVÍA";
  if (night) return "HORA DE BAJAR EL RITMO";
  return { high: "LISTO PARA EMPUJAR", medium: "RECUPERACIÓN NORMAL", low: "DÍA DE RECUPERAR" }[level];
}

/** «6 EJ · 18 SERIES · 55 MIN»: a program day's size; minutes from sets × (work + rest) plus cardio. */
export function dayMeta(exercises: { sets: number; restSeconds: number; kind: string; cardio?: { durationMinutes?: number | null } | null }[]): string {
  const strength = exercises.filter((e) => e.kind !== "cardio");
  const sets = strength.reduce((s, e) => s + e.sets, 0);
  const seconds = strength.reduce((s, e) => s + e.sets * (40 + e.restSeconds), 0) + exercises.reduce((s, e) => s + (e.cardio?.durationMinutes ?? 0) * 60, 0);
  const minutes = Math.max(5, Math.round(seconds / 60 / 5) * 5);
  return [`${exercises.length} EJ`, sets ? `${sets} SERIES` : null, `${minutes} MIN`].filter(Boolean).join(" · ");
}

/** Strip the brief's Markdown down to text with **bold** spans kept as segments. */
export function briefSegments(markdown: string): { text: string; bold: boolean }[] {
  const plain = markdown
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const out: { text: string; bold: boolean }[] = [];
  plain.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return;
    const bold = part.startsWith("**") && part.endsWith("**");
    out.push({ text: bold ? part.slice(2, -2) : part.replace(/[*_]/g, ""), bold });
  });
  return out;
}
