import type { Substance as SubstanceRow, SubstanceEntry as EntryRow } from "@life/db";
import { addDays, localDate, localTime, zonedInstant } from "@life/db/pulso";
import type { Substance, SubstanceEntry, SubstanceEntryInput, SubstanceOverview } from "@/contract";
import { computeReadiness } from "../logic/readiness";
import { buildSummary, LATE_HOUR, weekStart, WEEKS, type NightSignals } from "../logic/substance-summary";
import { listDaily, today } from "./daily";
import { maybe, ms, nn, ok, one, P, rows } from "./db";
import type { Ctx, OpTable } from "./types";

// Sustancias on Supabase (pulso.substances / substance_entries). Private: it
// reaches the shared calendar only when the person turns that on (web Ajustes).
// Cannabis and Alcohol are seeded per person; their ids are their slugs, as
// in the old app, so the phone's rules (THC for cannabis edibles) still apply.

const BUILTINS = [
  { slug: "cannabis", name: "Cannabis", unit: "sesiones", forms: ["fumado", "vapeado", "comestible", "otro"] },
  { slug: "alcohol", name: "Alcohol", unit: "tragos", forms: [] as string[] },
];

const idOf = (row: Pick<SubstanceRow, "id" | "slug">) => row.slug ?? row.id;

const toSubstance = (row: SubstanceRow): Substance => ({
  id: idOf(row),
  name: row.name,
  symbol: row.symbol,
  unit: row.unit,
  forms: row.forms,
  maxDaysPerWeek: row.max_days_per_week,
  archived: row.archived,
  position: row.position,
  builtin: row.builtin,
  createdAt: ms(row.created_at),
  updatedAt: ms(row.updated_at),
});

async function substanceRows(ctx: Ctx): Promise<SubstanceRow[]> {
  let list = rows(await P(ctx).from("substances").select("*"));
  const missing = BUILTINS.filter((b) => !list.some((s) => s.slug === b.slug));
  if (missing.length) {
    const next = list.reduce((m, s) => Math.max(m, s.position), -1);
    ok(
      await P(ctx)
        .from("substances")
        .upsert(
          missing.map((b, i) => ({ user_id: ctx.userId, slug: b.slug, name: b.name, unit: b.unit, forms: b.forms, builtin: true, position: next + 1 + i })),
          { onConflict: "user_id,slug", ignoreDuplicates: true },
        ),
    );
    list = rows(await P(ctx).from("substances").select("*"));
  }
  return list.sort((a, b) => Number(a.archived) - Number(b.archived) || a.position - b.position);
}

async function resolve(ctx: Ctx, id: string): Promise<SubstanceRow> {
  const found = (await substanceRows(ctx)).find((s) => s.slug === id || s.id === id || s.name.toLowerCase() === id.toLowerCase());
  if (!found) throw new Error("Esa sustancia ya no existe.");
  return found;
}

function toEntry(row: EntryRow, substances: SubstanceRow[], tz: string): SubstanceEntry {
  const s = substances.find((x) => x.id === row.substance_id);
  return {
    id: row.id,
    substanceId: s ? idOf(s) : row.substance_id,
    date: row.local_date,
    time: localTime(row.used_at, tz),
    form: row.form,
    amount: (["poco", "normal", "mucho"].includes(row.amount) ? row.amount : "normal") as SubstanceEntry["amount"],
    quantity: nn(row.count),
    thcMg: nn(row.thc_mg),
    context: (row.context as SubstanceEntry["context"]) ?? null,
    note: row.note,
    createdAt: ms(row.created_at),
    updatedAt: ms(row.updated_at),
  };
}

async function uses(ctx: Ctx, from: string, to: string, ids: string[], substances: SubstanceRow[]): Promise<SubstanceEntry[]> {
  if (!ids.length) return [];
  const list = rows(await P(ctx).from("substance_entries").select("*").in("substance_id", ids).gte("local_date", from).lte("local_date", to).order("used_at", { ascending: false }));
  return list.map((r) => toEntry(r, substances, ctx.tz));
}

/** Sleep, recovery and late eating for every night from `from` to `to` (wake dates). */
async function nightSignals(ctx: Ctx, from: string, to: string): Promise<NightSignals[]> {
  const [metrics, meals] = await Promise.all([
    listDaily(ctx, addDays(from, -28), to),
    P(ctx).from("meals").select("eaten_at, local_date").gte("local_date", addDays(from, -1)).lte("local_date", to),
  ]);
  const byDate = new Map(metrics.map((d) => [d.date, d]));
  const evenings = new Set<string>();
  const late = new Set<string>();
  for (const meal of rows(meals)) {
    const date = meal.local_date ?? localDate(meal.eaten_at, ctx.tz);
    evenings.add(date);
    const hour = Number(localTime(meal.eaten_at, ctx.tz).slice(0, 2));
    if (hour >= LATE_HOUR) late.add(addDays(date, 1));
    else if (hour < 4) late.add(date);
  }
  const out: NightSignals[] = [];
  for (let night = from; night <= to; night = addDays(night, 1)) {
    const day = byDate.get(night);
    out.push({
      night,
      sleepMinutes: day?.sleepMinutes ?? null,
      sleepScore: null,
      hrv: day?.hrv ?? null,
      restingHr: day?.restingHeartRate ?? null,
      readiness: day ? computeReadiness(night, day, metrics.filter((m) => m.date < night)).score : null,
      lateEating: late.has(night) ? true : evenings.has(addDays(night, -1)) ? false : null,
    });
  }
  return out;
}

async function overview(ctx: Ctx, which: string | undefined, date: string): Promise<SubstanceOverview> {
  const all = await substanceRows(ctx);
  const substances = all.map(toSubstance);
  const chosen = which === "all" ? null : (all.find((s) => idOf(s) === which || s.id === which) ?? all.find((s) => !s.archived) ?? null);
  const ids = chosen ? [chosen.id] : all.filter((s) => !s.archived).map((s) => s.id);
  const from = addDays(weekStart(date), -7 * (WEEKS - 1));
  const listFrom = addDays(date, -59) < from ? addDays(date, -59) : from;
  const [entries, first, last, nights, drinks] = await Promise.all([
    uses(ctx, listFrom, date, ids, all),
    ids.length ? P(ctx).from("substance_entries").select("local_date").in("substance_id", ids).order("local_date").limit(1).maybeSingle() : null,
    ids.length ? P(ctx).from("substance_entries").select("used_at, local_date").in("substance_id", ids).lte("local_date", date).order("used_at", { ascending: false }).limit(1).maybeSingle() : null,
    nightSignals(ctx, from, date),
    chosen?.slug === "alcohol" ? P(ctx).from("meals").select("local_date").gt("alcohol_g", 0).gte("local_date", from).lte("local_date", date) : null,
  ]);
  const lastRow = last ? maybe(last) : null;
  const summary = buildSummary({
    substanceId: chosen ? idOf(chosen) : null,
    today: date,
    entries: entries.filter((e) => e.date >= from),
    firstUse: first ? (maybe(first)?.local_date ?? null) : null,
    lastUse: lastRow ? { date: lastRow.local_date, time: localTime(lastRow.used_at, ctx.tz) } : null,
    maxDaysPerWeek: chosen?.max_days_per_week ?? null,
    nights,
    drinkDays: drinks ? new Set(rows(drinks).map((m) => m.local_date)).size : undefined,
  });
  return { substances, summary, entries: entries.filter((e) => e.date >= addDays(date, -59)) };
}

type EntryWrite = Partial<SubstanceEntryInput>;

async function entryRow(ctx: Ctx, input: EntryWrite, base?: { substance: SubstanceRow; date: string; time: string }) {
  const substance = input.substanceId ? await resolve(ctx, input.substanceId) : (base?.substance ?? (await substanceRows(ctx)).find((s) => !s.archived));
  if (!substance) throw new Error("Primero agrega una sustancia.");
  const date = input.date ?? base?.date ?? today(ctx);
  const time = input.time ?? base?.time ?? localTime(new Date(), ctx.tz);
  const form = input.form === undefined ? (base ? undefined : (substance.forms[0] ?? null)) : input.form && substance.forms.includes(input.form) ? input.form : input.form || null;
  const row: Partial<EntryRow> = { substance_id: substance.id, local_date: date, used_at: zonedInstant(date, time, ctx.tz).toISOString() };
  if (form !== undefined) row.form = form;
  if (input.amount !== undefined || !base) row.amount = input.amount ?? "normal";
  if (input.quantity !== undefined) row.count = input.quantity;
  if (input.thcMg !== undefined) row.thc_mg = input.thcMg;
  if (input.context !== undefined) row.context = input.context;
  if (input.note !== undefined) row.note = input.note?.trim() || null;
  return row;
}

const cleanForms = (forms: string[] | undefined) => [...new Set((forms ?? []).map((f) => f.trim().toLowerCase()).filter(Boolean))];

export const substanceOps: OpTable = {
  async get_substance_overview(ctx, { substance, date }) {
    return overview(ctx, substance, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today(ctx));
  },
  async record_substance_use(ctx, input) {
    const row = await entryRow(ctx, input);
    const saved = one(await P(ctx).from("substance_entries").insert({ ...row, user_id: ctx.userId } as EntryRow).select("*").single());
    return toEntry(saved, await substanceRows(ctx), ctx.tz);
  },
  async update_substance_use(ctx, { id, ...patch }) {
    const before = one(await P(ctx).from("substance_entries").select("*").eq("id", id).single(), "Ese registro");
    const all = await substanceRows(ctx);
    const substance = all.find((s) => s.id === before.substance_id)!;
    const row = await entryRow(ctx, patch, { substance, date: before.local_date, time: localTime(before.used_at, ctx.tz) });
    const saved = one(await P(ctx).from("substance_entries").update(row).eq("id", id).select("*").single());
    return toEntry(saved, all, ctx.tz);
  },
  async remove_substance_use(ctx, { id }) {
    ok(await P(ctx).from("substance_entries").delete().eq("id", id));
    return { deleted: id };
  },
  async list_substance_types(ctx) {
    return { substances: (await substanceRows(ctx)).map(toSubstance) };
  },
  async add_substance_type(ctx, input) {
    const all = await substanceRows(ctx);
    if (all.some((s) => s.name.toLowerCase() === input.name.trim().toLowerCase())) throw new Error("Ya tienes una sustancia con ese nombre.");
    const row = one(
      await P(ctx)
        .from("substances")
        .insert({
          user_id: ctx.userId,
          name: input.name.trim(),
          symbol: input.symbol?.trim() || null,
          unit: input.unit?.trim() || "veces",
          forms: cleanForms(input.forms),
          max_days_per_week: input.maxDaysPerWeek ?? null,
          position: all.reduce((m, s) => Math.max(m, s.position), -1) + 1,
        })
        .select("*")
        .single(),
    );
    return toSubstance(row);
  },
  async update_substance(ctx, { id, ...patch }) {
    const s = await resolve(ctx, id);
    const update: Partial<SubstanceRow> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.symbol !== undefined) update.symbol = patch.symbol?.trim() || null;
    if (patch.unit !== undefined) update.unit = patch.unit.trim();
    if (patch.forms !== undefined) update.forms = cleanForms(patch.forms);
    if (patch.maxDaysPerWeek !== undefined) update.max_days_per_week = patch.maxDaysPerWeek;
    if (patch.archived !== undefined) update.archived = patch.archived;
    return toSubstance(one(await P(ctx).from("substances").update(update).eq("id", s.id).select("*").single()));
  },
  async reorder_substances(ctx, { ids }) {
    const all = await substanceRows(ctx);
    for (const [i, id] of ids.entries()) {
      const s = all.find((x) => idOf(x) === id || x.id === id);
      if (s && s.position !== i) ok(await P(ctx).from("substances").update({ position: i }).eq("id", s.id));
    }
    return { substances: (await substanceRows(ctx)).map(toSubstance) };
  },
};
