/**
 * Body (Pulso's Cuerpo): InBody and manual scans, Apple Health weigh-ins,
 * goals and projections. Ported from `@pulso/contract` `body.ts` as zod with
 * the same type names. Masses kg, times epoch ms.
 *
 * Two kinds of operations: the Coach's tools (same names and answers as in
 * Pulso) and what the iPhone's Cuerpo called under `/api/mobile/body/*`.
 */
import { z } from "zod";
import { op } from "./operation";

/** Lean or fat mass per body segment, kg. */
export const Segmental = z.object({
  rightArm: z.number(),
  leftArm: z.number(),
  trunk: z.number(),
  rightLeg: z.number(),
  leftLeg: z.number(),
});
export type Segmental = z.infer<typeof Segmental>;

/** Every numeric measurement a scan can carry. All optional: a manual entry may have only weight. */
export const BodyScanValues = z.object({
  /** kg */
  weight: z.number().nullable(),
  /** Skeletal muscle mass, kg */
  skeletalMuscleMass: z.number().nullable(),
  /** kg */
  bodyFatMass: z.number().nullable(),
  /** Percent body fat, % */
  percentBodyFat: z.number().nullable(),
  /** kg/m² */
  bmi: z.number().nullable(),
  /** InBody visceral fat level, unitless (1–20) */
  visceralFatLevel: z.number().nullable(),
  /** Basal metabolic rate, kcal/day */
  bmr: z.number().nullable(),
  /** Total body water, L */
  totalBodyWater: z.number().nullable(),
  /** Extracellular water / total body water ratio (≈0.36–0.40) */
  ecwRatio: z.number().nullable(),
  /** InBody score, points (/100) */
  inbodyScore: z.number().nullable(),
  /** kg */
  softLeanMass: z.number().nullable(),
  /** kg */
  protein: z.number().nullable(),
  /** kg */
  mineral: z.number().nullable(),
  /** Bone mineral content, kg */
  boneMineralContent: z.number().nullable(),
  /** Body cell mass, kg */
  bodyCellMass: z.number().nullable(),
  /** Intracellular water, L */
  intracellularWater: z.number().nullable(),
  /** Extracellular water, L */
  extracellularWater: z.number().nullable(),
  /** Skeletal muscle index (arm + leg lean / height²), kg/m² */
  smi: z.number().nullable(),
  /** Waist / hip, unitless */
  waistHipRatio: z.number().nullable(),
  /** cm */
  waistCircumference: z.number().nullable(),
  /** cm² */
  visceralFatArea: z.number().nullable(),
  /** Whole-body phase angle, degrees */
  phaseAngle: z.number().nullable(),
});
export type BodyScanValues = z.infer<typeof BodyScanValues>;

/** One body-composition measurement. */
export const BodyScan = BodyScanValues.extend({
  id: z.string(),
  /** Epoch ms of the measurement (not of when it was saved). */
  measuredAt: z.number(),
  source: z.enum(["inbody", "manual"]),
  /** Dedupes re-imports: `inbody:<minute>` for InBody tests with a time, so QR and CSV of one test meet. */
  externalId: z.string().nullable(),
  /** InBody model, e.g. "270", "570". */
  device: z.string().nullable(),
  /** Lean mass per segment, kg */
  segmentalLean: Segmental.nullable(),
  /** Fat mass per segment, kg */
  segmentalFat: Segmental.nullable(),
  /** ECW ratio per segment, unitless */
  segmentalEcw: Segmental.nullable(),
  /** The original payload: QR text, or the CSV row as JSON (keeps columns without a field). */
  raw: z.string().nullable(),
});
export type BodyScan = z.infer<typeof BodyScan>;

export const BodyScanInput = BodyScan.omit({ id: true });
export type BodyScanInput = z.infer<typeof BodyScanInput>;

/** Result of `import_inbody_csv`. */
export const BodyImport = z.object({ imported: z.number(), skipped: z.array(z.object({ line: z.number(), reason: z.string() })) });
export type BodyImport = z.infer<typeof BodyImport>;

/** A single weight or body-fat reading from Apple Health. */
export const BodySample = z.object({
  /** HealthKit UUID */
  externalId: z.string().min(1).max(128),
  metric: z.enum(["weight", "percentBodyFat"]),
  /** kg or % */
  value: z.number().positive().max(400),
  measuredAt: z.number().positive(),
});
export type BodySample = z.infer<typeof BodySample>;

/** Metrics with a trend, projection and goal. */
export const BODY_METRICS = ["weight", "bodyFatMass", "skeletalMuscleMass", "percentBodyFat"] as const;
export const BodyMetric = z.enum(BODY_METRICS);
export type BodyMetric = z.infer<typeof BodyMetric>;

export const BodyGoal = z.object({ metric: BodyMetric, target: z.number(), setAt: z.number() });
export type BodyGoal = z.infer<typeof BodyGoal>;

export const ProjectionPoint = z.object({ at: z.number(), value: z.number(), low: z.number(), high: z.number() });
export type ProjectionPoint = z.infer<typeof ProjectionPoint>;

export const BodyProjection = z.object({
  metric: BodyMetric,
  unit: z.enum(["kg", "%"]),
  /** Daily medians the fit used, oldest first. */
  observed: z.array(z.object({ at: z.number(), value: z.number() })),
  /** Trend value at the last observation; null when there is not enough data to fit. */
  current: z.number().nullable(),
  slopePerWeek: z.number().nullable(),
  /** The fitted line from the first observation to 12 weeks out, with an 80% band. */
  band: z.array(ProjectionPoint),
  /** 4, 8 and 12 weeks after the last observation. */
  horizons: z.array(ProjectionPoint.extend({ weeks: z.number() })),
  goal: z.object({ target: z.number(), eta: z.number().nullable(), message: z.string() }).nullable(),
  /** Spanish, for the person: why there is no projection, or a one-line summary. */
  note: z.string(),
});
export type BodyProjection = z.infer<typeof BodyProjection>;

/** Where a value sits against its normal range, as InBody's sheet bands it. */
export const BodyBand = z.enum(["low", "normal", "high"]);
export type BodyBand = z.infer<typeof BodyBand>;

/** One horizontal bar of InBody's Muscle-Fat or Obesity analysis, laid out by the engine. */
export const BodyGauge = z.object({
  metric: z.enum(["weight", "skeletalMuscleMass", "bodyFatMass", "bmi", "percentBodyFat", "visceralFatLevel"]),
  /** Epoch ms of the scan the value is from */
  measuredAt: z.number(),
  /** In `unit` */
  value: z.number(),
  /** The scan before that measured it, in `unit` */
  previous: z.number().nullable(),
  unit: z.enum(["kg", "kg/m²", "%", "nivel"]),
  /** The normal range, in `unit` */
  normal: z.object({ low: z.number(), high: z.number() }),
  band: BodyBand,
  /** Value as % of the person's standard, for the bars InBody draws in % (weight, muscle, fat mass) */
  percent: z.number().nullable(),
  /** Positions along the bar, 0–1, so every client draws the same thing */
  at: z.object({ value: z.number(), previous: z.number().nullable(), low: z.number(), high: z.number() }),
  /** Evenly spaced labels, as printed on the sheet (% of standard, or the raw scale) */
  ticks: z.array(z.string()),
});
export type BodyGauge = z.infer<typeof BodyGauge>;

export type SegmentKey = keyof Segmental;

/** One segment's mass against the standard for it. */
export const SegmentValue = z.object({ kg: z.number(), percent: z.number().nullable(), band: BodyBand.nullable() });
export type SegmentValue = z.infer<typeof SegmentValue>;

const SegmentValues = z.object({ rightArm: SegmentValue, leftArm: SegmentValue, trunk: SegmentValue, rightLeg: SegmentValue, leftLeg: SegmentValue });

export const BodyAnalysis = z.object({
  /** What the standards were computed from; null when there is no height (profile, or weight ÷ BMI of a scan). */
  basis: z.object({ heightCm: z.number(), heightFrom: z.enum(["profile", "scan"]), sex: z.enum(["male", "female"]).nullable(), standardWeight: z.number() }).nullable(),
  /** Weight, skeletal muscle and fat mass vs the standard for the height, from the newest scan that has all three. */
  muscleFat: z.object({ measuredAt: z.number(), gauges: z.array(BodyGauge) }).nullable(),
  /** BMI and % fat (and the visceral level when measured), newest of each. */
  obesity: z.array(BodyGauge),
  /** From the newest scan with segmental values. `basis` "height" compares with the standard for the height, "weight" with the person's own weight. */
  segments: z
    .object({
      measuredAt: z.number(),
      basis: z.enum(["height", "weight"]),
      lean: SegmentValues.nullable(),
      fat: SegmentValues.nullable(),
      /** Spanish, short: "Brazos equilibrados", "Pierna izq. 4 % menos" */
      balance: z.array(z.object({ text: z.string(), even: z.boolean() })),
    })
    .nullable(),
});
export type BodyAnalysis = z.infer<typeof BodyAnalysis>;

const InBodyRead = z.object({ ok: z.literal(true), scan: BodyScanInput });

/** What the QR parser returns to the phone before anything is saved. */
export const InBodyParse = z.discriminatedUnion("ok", [
  InBodyRead,
  z.object({ ok: z.literal(false), code: z.enum(["unknown_inbody_format", "unmapped_ibdata"]), message: z.string(), payloadId: z.string() }),
]);
export type InBodyParse = z.infer<typeof InBodyParse>;

/** What the iPhone's Cuerpo draws (Pulso's `GET /api/mobile/body`): scans newest first without raw payloads, goals, the four projections and the InBody-style analysis. */
export const BodyDashboard = z.object({ scans: z.array(BodyScan), goals: z.array(BodyGoal), projections: z.array(BodyProjection), analysis: BodyAnalysis });
export type BodyDashboard = z.infer<typeof BodyDashboard>;

/**
 * Pulso's body operations: its Coach tools at `/api/v1/salud/body/<operation>` (the engine runs those tools
 * for them, `salud/api/tools.ts`), then the iPhone's routes at Pulso's paths.
 */
export const bodyOperations = {
  list_body_scans: op({
    name: "list_body_scans",
    description: "Body-composition scans (InBody and manual), newest first. measuredAt epoch ms. Units: weight, skeletalMuscleMass, bodyFatMass, softLeanMass, protein, mineral kg; percentBodyFat %; bmi kg/m²; bmr kcal/day; totalBodyWater, ICW, ECW litres; ecwRatio, waistHipRatio unitless; visceralFatLevel InBody level; inbodyScore points; segmental kg (segment ECW is a ratio). null = not measured. Apple Health weigh-ins are not here (body_projection uses them).",
    access: "read",
    method: "GET",
    path: "/body/list_body_scans",
    input: z.object({ limit: z.int().min(1).max(200).default(20) }),
    output: z.unknown(),
  }),
  add_body_scan: op({
    name: "add_body_scan",
    description: "Save a body measurement they tell you (an InBody sheet, a scale): at least weight, or two of skeletalMuscleMass / bodyFatMass / percentBodyFat. Units: masses kg, percentBodyFat %, bmr kcal/day, totalBodyWater litres. Missing body-fat kg or % is derived. Confirm the numbers with the person first.",
    access: "write",
    method: "POST",
    path: "/body/add_body_scan",
    input: z.object({ date: z.string().describe("Local YYYY-MM-DD or ISO date-time; default now.").optional(), weight: z.number().optional(), skeletalMuscleMass: z.number().optional(), bodyFatMass: z.number().optional(), percentBodyFat: z.number().optional(), bmi: z.number().optional(), visceralFatLevel: z.number().optional(), bmr: z.number().optional(), totalBodyWater: z.number().optional(), ecwRatio: z.number().optional(), inbodyScore: z.number().optional(), waistHipRatio: z.number().optional() }),
    output: z.unknown(),
  }),
  body_projection: op({
    name: "body_projection",
    description: "Trend and projection for one metric from scans plus Apple Health: current trend value, slopePerWeek, values with an 80 % band at 4, 8 and 12 weeks, and the goal ETA with a Spanish sentence. target asks 'when would I reach X' without saving it (default the saved goal). current null with too little data (3+ days over 7+).",
    access: "read",
    method: "GET",
    path: "/body/body_projection",
    input: z.object({ metric: z.enum(["weight","bodyFatMass","skeletalMuscleMass","percentBodyFat"]).describe("weight (kg), bodyFatMass (kg), skeletalMuscleMass (kg) or percentBodyFat (%)"), target: z.number().gt(0).describe("The metric's unit.").optional() }),
    output: z.unknown(),
  }),
  set_body_goal: op({
    name: "set_body_goal",
    description: "Save the goal for one metric (null clears it); one per metric, its ETA shows in Cuerpo and body_projection.",
    access: "write",
    method: "POST",
    path: "/body/set_body_goal",
    input: z.object({ metric: z.enum(["weight","bodyFatMass","skeletalMuscleMass","percentBodyFat"]).describe("weight (kg), bodyFatMass (kg), skeletalMuscleMass (kg) or percentBodyFat (%)"), target: z.number().gt(0).nullable() }),
    output: z.unknown(),
  }),

  // ── What the iPhone's Cuerpo calls (Pulso's /api/mobile/body/*) ──
  get_body_dashboard: op({
    name: "get_body_dashboard",
    description:
      "The phone's Cuerpo, in full: up to 200 scans newest first (raw payloads left out), the saved goals, the trend and projection of weight, bodyFatMass, skeletalMuscleMass and percentBodyFat (scans plus Apple Health), and the InBody-style analysis against the standard for the person's height and sex. For a model, list_body_scans and body_projection are shorter.",
    access: "read",
    method: "GET",
    path: "/body",
    input: z.object({}),
    output: BodyDashboard,
  }),
  save_body_goal: op({
    name: "save_body_goal",
    description: "Sets one metric's goal (target null clears it) and answers it with that metric's full projection, as the phone's goal sheet wants. Same goal as set_body_goal.",
    access: "write",
    method: "PUT",
    path: "/body/goals",
    input: z.object({ metric: BodyMetric, target: z.number().positive().max(400).nullable() }),
    output: z.object({ goal: BodyGoal.nullable(), projection: BodyProjection }),
    event: "body_goal.updated",
  }),
  import_inbody_csv: op({
    name: "import_inbody_csv",
    description: "Imports an InBody / LookinBody CSV export (the file's text in `csv`). Rows dedupe by test time, so importing the same file twice is harmless. Returns how many scans were saved and the rows skipped, with why. 422 when the file has no scans.",
    access: "write",
    method: "POST",
    path: "/body/import",
    input: z.object({ csv: z.string().max(5_000_000).refine((s) => s.trim().length > 0, "expected a CSV body") }),
    output: BodyImport,
    event: "body_scans.imported",
  }),
  read_inbody_qr: op({
    name: "read_inbody_qr",
    description:
      "Reads an InBody result sheet's QR text into a scan WITHOUT saving it: the phone shows it for confirmation, then saves it with save_body_scan. An unreadable payload is kept for a later parser and answered 422 (unknown_inbody_format or unmapped_ibdata).",
    access: "write",
    method: "POST",
    path: "/body/inbody",
    input: z.object({ payload: z.string().max(8000).refine((s) => s.trim().length > 0, "expected { payload: string }") }),
    output: InBodyRead,
  }),
  sync_body_samples: op({
    name: "sync_body_samples",
    description: "The iPhone's Apple Health sync of weigh-ins and body-fat readings (weight kg, percentBodyFat %), upserted by HealthKit UUID. Returns how many were written. Not for logging by hand.",
    access: "write",
    method: "POST",
    path: "/body/samples",
    input: z.object({ samples: z.array(BodySample).max(5000) }),
    output: z.object({ written: z.number() }),
    event: "body_samples.synced",
  }),
  save_body_scan: op({
    name: "save_body_scan",
    description:
      "Saves one full scan as the phone sends it (a manual entry, or a QR read the person confirmed): any BodyScan field; needs weight, or two of skeletalMuscleMass / bodyFatMass / percentBodyFat. The same externalId replaces the earlier scan. For a model, add_body_scan is simpler.",
    access: "write",
    method: "POST",
    path: "/body/scans",
    input: BodyScanInput.partial(),
    output: z.object({ scan: BodyScan }),
    event: "body_scan.saved",
  }),
  delete_body_scan: op({
    name: "delete_body_scan",
    description: "Deletes one scan by id. Returns the id.",
    access: "write",
    method: "DELETE",
    path: "/body/scans/{id}",
    input: z.object({ id: z.string() }),
    output: z.object({ deleted: z.string() }),
    event: "body_scan.deleted",
  }),
};
