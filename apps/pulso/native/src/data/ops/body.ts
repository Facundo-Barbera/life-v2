import type { BodyScan as ScanRow } from "@life/db";
import { localDate, timeOfDay, zonedInstant } from "@life/db/pulso";
import { BODY_METRICS, type BodyGoal, type BodyMetric, type BodyScan, type BodyScanInput, type BodyScanValues, type Segmental } from "@/contract";
import { hasComposition, round, VALUE_KEYS } from "../logic/body-fields";
import { project } from "../logic/body-projection";
import { bodyAnalysis } from "../logic/body-standards";
import { parseInBody } from "../logic/inbody";
import { parseInBodyCsv } from "../logic/inbody-csv";
import { iso, maybe, ms, n, nn, ok, one, P, rows } from "./db";
import type { Ctx, OpTable } from "./types";

// Cuerpo on Supabase. A weight on its own is a weigh-in (pulso.weigh_ins, with
// morning/evening as the web keeps them); anything with composition is a scan
// (pulso.body_scans: weight, % fat, every other InBody value in `metrics`,
// segments in `segmental`). Apple Health weights land as weigh-ins, its body
// fat in pulso.body_samples.

const seg = (v: unknown): Segmental | null => {
  const s = v as Partial<Segmental> | undefined;
  return s && s.rightArm != null && s.leftArm != null && s.trunk != null && s.rightLeg != null && s.leftLeg != null ? (s as Segmental) : null;
};

export function toScan(row: ScanRow): BodyScan {
  const m = (row.metrics ?? {}) as Record<string, number>;
  const values = Object.fromEntries(VALUE_KEYS.map((k) => [k, m[k] ?? null])) as BodyScanValues;
  values.weight = nn(row.weight_kg) ?? values.weight;
  values.percentBodyFat = values.percentBodyFat ?? nn(row.fat_pct);
  return {
    ...values,
    id: row.id,
    measuredAt: ms(row.scanned_at),
    source: row.source === "inbody" ? "inbody" : "manual",
    externalId: row.external_id,
    device: row.device,
    segmentalLean: seg(row.segmental?.lean),
    segmentalFat: seg(row.segmental?.fat),
    segmentalEcw: seg(row.segmental?.ecw),
    raw: null,
  };
}

/** Fills in what the sheet implies but did not say (fat kg ↔ fat %). */
function complete(s: Partial<BodyScanInput>): Partial<BodyScanInput> {
  const out = { ...s };
  if (out.bodyFatMass == null && out.weight != null && out.percentBodyFat != null) out.bodyFatMass = round((out.weight * out.percentBodyFat) / 100, 1);
  if (out.percentBodyFat == null && out.weight != null && out.bodyFatMass != null) out.percentBodyFat = round((out.bodyFatMass / out.weight) * 100, 1);
  return out;
}

function scanRow(ctx: Ctx, input: Partial<BodyScanInput>) {
  const s = complete(input);
  const metrics: Record<string, number> = {};
  for (const k of VALUE_KEYS) if (k !== "weight" && s[k] != null) metrics[k] = s[k]!;
  const segmental: ScanRow["segmental"] = {};
  if (s.segmentalLean) segmental.lean = s.segmentalLean;
  if (s.segmentalFat) segmental.fat = s.segmentalFat;
  if (s.segmentalEcw) segmental.ecw = s.segmentalEcw;
  return {
    user_id: ctx.userId,
    scanned_at: iso(s.measuredAt ?? Date.now()),
    weight_kg: s.weight ?? null,
    fat_pct: s.percentBodyFat ?? null,
    muscle_pct: s.weight && s.skeletalMuscleMass ? round((s.skeletalMuscleMass / s.weight) * 100, 2) : null,
    source: s.source ?? "manual",
    device: s.device ?? null,
    external_id: s.externalId ?? null,
    metrics,
    segmental,
  };
}

async function saveScan(ctx: Ctx, input: Partial<BodyScanInput>): Promise<BodyScan> {
  if (input.weight == null && !hasComposition({ ...Object.fromEntries(VALUE_KEYS.map((k) => [k, null])), ...input } as BodyScanValues))
    throw new Error("Un escaneo necesita el peso, o dos de: músculo, grasa en kg, % de grasa.");
  const row = scanRow(ctx, input);
  if (row.external_id) {
    const existing = maybe(await P(ctx).from("body_scans").select("id").eq("external_id", row.external_id).maybeSingle());
    if (existing) return toScan(one(await P(ctx).from("body_scans").update(row).eq("id", existing.id).select("*").single()));
  }
  return toScan(one(await P(ctx).from("body_scans").insert(row).select("*").single()));
}

async function addWeighIn(ctx: Ctx, kg: number, at: Date) {
  ok(await P(ctx).from("weigh_ins").insert({ user_id: ctx.userId, measured_at: at.toISOString(), weight_kg: round(kg, 2), time_of_day: timeOfDay(at, ctx.tz), source: "manual" }));
}

/** Every reading of a metric, scans + weigh-ins + Apple Health samples, oldest first. */
async function series(ctx: Ctx, metric: BodyMetric, scans: BodyScan[]): Promise<{ at: number; value: number }[]> {
  const fromScans = scans.filter((s) => s[metric] != null).map((s) => ({ at: s.measuredAt, value: s[metric]! }));
  let extra: { at: number; value: number }[] = [];
  if (metric === "weight") extra = rows(await P(ctx).from("weigh_ins").select("measured_at, weight_kg").order("measured_at")).map((w) => ({ at: ms(w.measured_at), value: n(w.weight_kg) }));
  if (metric === "percentBodyFat")
    extra = rows(await P(ctx).from("body_samples").select("measured_at, value").eq("metric", "percent_body_fat").order("measured_at")).map((w) => ({ at: ms(w.measured_at), value: n(w.value) }));
  return [...fromScans, ...extra].sort((a, b) => a.at - b.at);
}

async function listScans(ctx: Ctx, limit: number): Promise<BodyScan[]> {
  return rows(await P(ctx).from("body_scans").select("*").order("scanned_at", { ascending: false }).limit(limit)).map(toScan);
}

async function listGoals(ctx: Ctx): Promise<BodyGoal[]> {
  return rows(await P(ctx).from("body_goals").select("*").order("metric")).map((g) => ({ metric: g.metric, target: n(g.target), setAt: ms(g.set_at) }));
}

async function projection(ctx: Ctx, metric: BodyMetric, scans: BodyScan[], goals: BodyGoal[]) {
  return project(metric, await series(ctx, metric, scans), goals.find((g) => g.metric === metric));
}

async function profile(ctx: Ctx) {
  const s = maybe(await P(ctx).from("settings").select("height_cm, sex").maybeSingle());
  return { heightCm: nn(s?.height_cm), sex: s?.sex ?? null };
}

export const bodyOps: OpTable = {
  async list_body_scans(ctx, { limit }) {
    // QuickLog reads the newest weight from here: weigh-ins count as scans with only a weight.
    const [scans, weighIns] = await Promise.all([
      listScans(ctx, limit),
      P(ctx).from("weigh_ins").select("*").order("measured_at", { ascending: false }).limit(limit),
    ]);
    const fromWeighIns = rows(weighIns).map(
      (w): BodyScan => ({
        ...(Object.fromEntries(VALUE_KEYS.map((k) => [k, null])) as BodyScanValues),
        weight: n(w.weight_kg),
        id: w.id,
        measuredAt: ms(w.measured_at),
        source: "manual",
        externalId: w.external_id,
        device: null,
        segmentalLean: null,
        segmentalFat: null,
        segmentalEcw: null,
        raw: null,
      }),
    );
    return [...scans, ...fromWeighIns].sort((a, b) => b.measuredAt - a.measuredAt).slice(0, limit);
  },
  async add_body_scan(ctx, input) {
    const at = !input.date ? new Date() : /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? zonedInstant(input.date, "08:00", ctx.tz) : new Date(input.date);
    const { date: _d, ...values } = input;
    const composition = Object.entries(values).some(([k, v]) => k !== "weight" && v != null);
    if (!composition) {
      if (input.weight == null) throw new Error("Anota al menos el peso.");
      await addWeighIn(ctx, input.weight, at);
      return { weight: input.weight, measuredAt: at.getTime(), date: localDate(at, ctx.tz) };
    }
    return saveScan(ctx, { ...values, measuredAt: at.getTime(), source: "manual" });
  },
  async body_projection(ctx, { metric, target }) {
    const [scans, goals] = await Promise.all([listScans(ctx, 200), listGoals(ctx)]);
    const goal = target !== undefined ? { metric, target, setAt: Date.now() } : goals.find((g) => g.metric === metric);
    return project(metric, await series(ctx, metric, scans), goal);
  },
  async set_body_goal(ctx, { metric, target }) {
    return (await bodyOps.save_body_goal!(ctx, { metric, target })).goal;
  },
  async get_body_dashboard(ctx) {
    const [scans, goals, who] = await Promise.all([listScans(ctx, 200), listGoals(ctx), profile(ctx)]);
    const projections = await Promise.all(BODY_METRICS.map((m) => projection(ctx, m, scans, goals)));
    return { scans, goals, projections, analysis: bodyAnalysis(scans, who) };
  },
  async save_body_goal(ctx, { metric, target }) {
    let goal: BodyGoal | null = null;
    if (target === null) ok(await P(ctx).from("body_goals").delete().eq("metric", metric));
    else {
      const setAt = new Date();
      ok(await P(ctx).from("body_goals").upsert({ user_id: ctx.userId, metric, target, set_at: setAt.toISOString() }, { onConflict: "user_id,metric" }));
      goal = { metric, target, setAt: setAt.getTime() };
      // The weight goal is also the goal that decides the day's budget.
      if (metric === "weight") ok(await P(ctx).from("settings").update({ goal_weight_kg: target }).eq("user_id", ctx.userId));
    }
    if (metric === "weight" && target === null) ok(await P(ctx).from("settings").update({ goal_weight_kg: null }).eq("user_id", ctx.userId));
    const scans = await listScans(ctx, 200);
    return { goal, projection: await projection(ctx, metric, scans, goal ? [goal] : []) };
  },
  async import_inbody_csv(ctx, { csv }) {
    const { scans, skipped } = parseInBodyCsv(csv);
    if (!scans.length) throw new Error("No encontré mediciones en ese CSV. ¿Es una exportación de InBody?");
    for (const s of scans) await saveScan(ctx, s);
    return { imported: scans.length, skipped };
  },
  async read_inbody_qr(_ctx, { payload }) {
    const result = parseInBody(payload);
    if (!result.ok) throw new Error(result.message);
    return result;
  },
  async sync_body_samples(ctx, { samples }) {
    const weights = samples.filter((s) => s.metric === "weight");
    const fats = samples.filter((s) => s.metric === "percentBodyFat");
    if (weights.length)
      ok(
        await P(ctx)
          .from("weigh_ins")
          .upsert(
            weights.map((s) => ({ user_id: ctx.userId, external_id: s.externalId, measured_at: iso(s.measuredAt), weight_kg: round(s.value, 2), time_of_day: timeOfDay(s.measuredAt, ctx.tz), source: "healthkit" as const })),
            { onConflict: "user_id,external_id" },
          ),
      );
    if (fats.length)
      ok(
        await P(ctx)
          .from("body_samples")
          .upsert(fats.map((s) => ({ user_id: ctx.userId, external_id: s.externalId, metric: "percent_body_fat" as const, value: s.value, measured_at: iso(s.measuredAt) })), { onConflict: "user_id,external_id" }),
      );
    return { written: samples.length };
  },
  async save_body_scan(ctx, input) {
    return { scan: await saveScan(ctx, input) };
  },
  async delete_body_scan(ctx, { id }) {
    ok(await P(ctx).from("body_scans").delete().eq("id", id));
    // A weight-only entry shown among scans is a weigh-in.
    ok(await P(ctx).from("weigh_ins").delete().eq("id", id));
    return { deleted: id };
  },
};
