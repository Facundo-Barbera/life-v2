// Pulso's `@pulso/contract` `substances.ts` (its types keep their Pulso names, now as zod schemas so the phone's operations are typed), then its operations.
import { z } from "zod";
import { op } from "./operation";

/**
 * Sustancias: a private, non-judgmental log of when the person uses something
 * (Cannabis and Alcohol come built in; they can add their own), to see how
 * often. Dates are local "YYYY-MM-DD" and times "HH:MM", as the phone sends them.
 *
 * Privacy: hidden from external MCP clients unless granted the sensitive
 * scope, never in the Coach's briefs, and on the web shown only where the
 * person turned it on (on by default on the Mac).
 */

/** Ids of the substances Pulso seeds. Custom ones get a random id. */
export const BUILTIN_SUBSTANCES = ["cannabis", "alcohol"] as const;

/** A substance the person tracks. Archived ones are hidden from pickers but keep their history. */
export const Substance = z.object({
  id: z.string(),
  name: z.string(),
  /** An emoji or an SF Symbol name; null = the default symbol. */
  symbol: z.string().nullable(),
  /** What `quantity` counts: sesiones, mg, ml, unidades, tragos… */
  unit: z.string(),
  /** How it can be taken, in order (e.g. fumado, vapeado, comestible); empty = no form. */
  forms: z.array(z.string()),
  /** The person's own limit, e.g. 2 = "máximo 2 días por semana". Null = no goal. */
  maxDaysPerWeek: z.number().nullable(),
  archived: z.boolean(),
  /** Order in pickers, 0 first. */
  position: z.number(),
  /** Seeded by Pulso (Cannabis, Alcohol). It can be edited or archived like any other. */
  builtin: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Substance = z.infer<typeof Substance>;

// The engine's store trims, dedupes forms and applies the defaults; these say what it accepts.
const label = (max: number) => z.string().trim().min(1).max(max);
const substanceFields = {
  name: label(40),
  symbol: z.string().trim().max(40).nullable(),
  unit: label(20),
  forms: z.array(label(24)).max(8),
  maxDaysPerWeek: z.int().min(0).max(7).nullable(),
};

/** POST body for a new substance. Unit defaults to "veces". */
export const SubstanceInput = z.object({
  name: substanceFields.name,
  symbol: substanceFields.symbol.optional(),
  unit: substanceFields.unit.optional(),
  forms: substanceFields.forms.optional(),
  maxDaysPerWeek: substanceFields.maxDaysPerWeek.optional(),
});
export type SubstanceInput = z.infer<typeof SubstanceInput>;
/** PATCH body: any field; `archived: true` hides it, false brings it back. */
export const SubstancePatch = z.object({ ...substanceFields, archived: z.boolean() }).partial();
export type SubstancePatch = z.infer<typeof SubstancePatch>;
/** PUT body: every active substance id in the new order. */
export const SubstanceOrder = z.object({ ids: z.array(z.string()).max(200) });
export type SubstanceOrder = z.infer<typeof SubstanceOrder>;

export const SubstanceAmount = z.enum(["poco", "normal", "mucho"]);
export type SubstanceAmount = z.infer<typeof SubstanceAmount>;
export const SubstanceContext = z.enum(["social", "solo", "dormir", "estres", "otro"]);
export type SubstanceContext = z.infer<typeof SubstanceContext>;

export const SubstanceEntry = z.object({
  id: z.string(),
  substanceId: z.string(),
  date: z.string(),
  time: z.string(),
  /** One of the substance's forms, or null. */
  form: z.string().nullable(),
  amount: SubstanceAmount,
  /** How much, in the substance's unit, when the person counts it. */
  quantity: z.number().nullable(),
  /** mg of THC, for cannabis edibles. */
  thcMg: z.number().nullable(),
  context: SubstanceContext.nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SubstanceEntry = z.infer<typeof SubstanceEntry>;

const LOCAL_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * POST body. `substanceId` defaults to the first active substance; date/time
 * default to now on the engine's clock; amount to normal; form to the
 * substance's first one.
 */
export const SubstanceEntryInput = z.object({
  substanceId: z.string().min(1).optional(),
  date: z.string().regex(LOCAL_DATE, "expected YYYY-MM-DD").optional(),
  time: z.string().regex(LOCAL_TIME, "expected HH:MM (24h)").optional(),
  form: z.string().trim().max(24).nullable().optional(),
  amount: SubstanceAmount.optional(),
  quantity: z.number().positive().max(100_000).nullable().optional(),
  thcMg: z.number().positive().max(2000).nullable().optional(),
  context: SubstanceContext.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type SubstanceEntryInput = z.infer<typeof SubstanceEntryInput>;
export const SubstanceEntryPatch = SubstanceEntryInput.partial();
export type SubstanceEntryPatch = z.infer<typeof SubstanceEntryPatch>;

/** One day of the 8-week heatmap. `level` is the largest amount that day, 0 = none. */
export const SubstanceDay = z.object({ date: z.string(), uses: z.number(), level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) });
export type SubstanceDay = z.infer<typeof SubstanceDay>;

/** One ISO week (Monday start). */
export const SubstanceWeek = z.object({ weekStart: z.string(), days: z.number() });
export type SubstanceWeek = z.infer<typeof SubstanceWeek>;

export const SubstanceTimeBucket = z.object({ key: z.enum(["manana", "tarde", "noche", "madrugada"]), label: z.string(), uses: z.number() });
export type SubstanceTimeBucket = z.infer<typeof SubstanceTimeBucket>;

/** A soft comparison between nights (or next days) with and without use. Neutral wording, always with sample sizes. */
export const SubstanceCorrelation = z.object({
  key: z.enum(["sleep_minutes", "sleep_score", "hrv", "resting_hr", "readiness", "late_eating"]),
  label: z.string(),
  unit: z.string(),
  withUse: z.number().nullable(),
  withoutUse: z.number().nullable(),
  /** withUse − withoutUse; null when either side is missing. */
  diff: z.number().nullable(),
  nWith: z.number(),
  nWithout: z.number(),
  /** At least MIN_SAMPLE on each side. */
  enough: z.boolean(),
  /** Spanish one-liner when `enough`, e.g. "En noches con consumo dormiste 22 min menos en promedio (6 con · 20 sin)". */
  text: z.string().nullable(),
});
export type SubstanceCorrelation = z.infer<typeof SubstanceCorrelation>;

export const SubstanceSummary = z.object({
  /** The substance summarized; null = Todas (every active substance together). */
  substanceId: z.string().nullable(),
  /** The day the summary is computed for. */
  today: z.string(),
  /** From the Monday 7 weeks ago through today (50–56 days), oldest first: a weeks × weekdays grid. */
  days: z.array(SubstanceDay),
  /** Last 8 ISO weeks, oldest first; the last one is this week so far. */
  weeks: z.array(SubstanceWeek),
  /** Mean days with use per full week, over the full weeks before this one since the first logged use; null before a full week. */
  avgDaysPerWeek: z.number().nullable(),
  daysThisWeek: z.number(),
  /** Days in a row without use, ending today (today counts when there was none). Null when nothing was ever logged. */
  daysWithout: z.number().nullable(),
  /** Longest run of days without use inside `days` (counted from the first logged use). */
  longestWithout: z.number(),
  lastUse: z.object({ date: z.string(), time: z.string() }).nullable(),
  timeOfDay: z.array(SubstanceTimeBucket),
  byForm: z.array(z.object({ form: z.string(), uses: z.number() })),
  byContext: z.array(z.object({ context: SubstanceContext, uses: z.number() })),
  /** Todas: uses per substance in the window. Empty for a single substance. */
  bySubstance: z.array(z.object({ substanceId: z.string(), uses: z.number() })),
  /** The substance's own goal; null for Todas or when it has none. */
  goal: z.object({ maxDaysPerWeek: z.number(), daysThisWeek: z.number(), within: z.boolean() }).nullable(),
  correlations: z.array(SubstanceCorrelation),
  /** Alcohol only: days in the window with alcoholic drinks logged as meals in Dieta (alcohol_g > 0). */
  drinkDays: z.number().optional(),
});
export type SubstanceSummary = z.infer<typeof SubstanceSummary>;

/**
 * GET /api/mobile/substances?substance=<id|all> and the web page: every
 * substance (archived last), the summary for the one asked (default the first
 * active; `all` = Todas) and its last 60 days of entries, newest first.
 */
export const SubstanceOverview = z.object({
  substances: z.array(Substance),
  summary: SubstanceSummary,
  entries: z.array(SubstanceEntry),
});
export type SubstanceOverview = z.infer<typeof SubstanceOverview>;

/** Pulso's substances operations (its Coach tools), at `/api/v1/salud/substances/<operation>`; the engine runs those tools for them (`salud/api/tools.ts`). */
export const substanceToolOperations = {
  list_substances: op({
    name: "list_substances",
    description: "Tracked substances (Cannabis and Alcohol built in): id, name, unit (what quantity counts), forms, their weekly goal (maxDaysPerWeek), archived. Private log (harm reduction): neutral and factual, never lecture or push them to quit; raise it only when they do or it bears on what they asked. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "read",
    sensitive: true,
    method: "GET",
    path: "/substances/list_substances",
    input: z.object({}),
    output: z.unknown(),
  }),
  log_substance_use: op({
    name: "log_substance_use",
    description: "Record one use they tell you about (\"anoche fumé\"). An untracked substance: ask whether to create it (create_substance), don't guess. date 'YYYY-MM-DD' and time 'HH:MM' local, both omitted = now. form: one of its forms (default the first). quantity in its unit, when they count. context dormir = para dormir. Alcohol for the diet still goes to log_meal; this only records the occasion. Private log (harm reduction): neutral and factual, never lecture or push them to quit; raise it only when they do or it bears on what they asked. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "write",
    sensitive: true,
    method: "POST",
    path: "/substances/log_substance_use",
    input: z.object({ substance: z.string().min(1).describe("Name or id (list_substances).").default("Cannabis"), date: z.string().optional(), time: z.string().optional(), form: z.string().optional(), amount: z.enum(["poco","normal","mucho"]).default("normal"), quantity: z.number().gt(0).optional(), thcMg: z.number().gt(0).optional(), context: z.enum(["social","solo","dormir","estres","otro"]).optional(), note: z.string().optional() }),
    output: z.unknown(),
  }),
  list_substance_use: op({
    name: "list_substance_use",
    description: "Logged uses between local dates (default the last 30 days), newest first: id, substanceId, date, time, form, amount, quantity, thcMg, context, note. Private log (harm reduction): neutral and factual, never lecture or push them to quit; raise it only when they do or it bears on what they asked. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "read",
    sensitive: true,
    method: "GET",
    path: "/substances/list_substance_use",
    input: z.object({ from: z.string().describe("YYYY-MM-DD").optional(), to: z.string().describe("YYYY-MM-DD").optional(), substance: z.string().min(1).describe("Default all.").optional() }),
    output: z.unknown(),
  }),
  substance_summary: op({
    name: "substance_summary",
    description: "How often and when over the last 8 weeks, for one substance or all together: daily heatmap, days per week, daysWithout and the longest run, time of day, forms, contexts, their weekly goal, and comparisons of nights with and without use (sleep minutes and score, next-morning HRV and resting HR, next-day readiness, eating after 22:00) with sample sizes: cite only enough=true ones, as averages from their data, not causes. A night with use = a use from noon to 05:59. Alcohol's drinkDays counts days with alcoholic drinks logged as meals. Private log (harm reduction): neutral and factual, never lecture or push them to quit; raise it only when they do or it bears on what they asked. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "read",
    sensitive: true,
    method: "GET",
    path: "/substances/substance_summary",
    input: z.object({ substance: z.string().min(1).describe("Default all active ones together.").optional() }),
    output: z.unknown(),
  }),
  delete_substance_use: op({
    name: "delete_substance_use",
    description: "Delete one logged use by id (list_substance_use). Private log (harm reduction): neutral and factual, never lecture or push them to quit; raise it only when they do or it bears on what they asked. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "write",
    sensitive: true,
    method: "POST",
    path: "/substances/delete_substance_use",
    input: z.object({ id: z.string() }),
    output: z.unknown(),
  }),
  create_substance: op({
    name: "create_substance",
    description: "Add a substance to track, ONLY when the person asks. unit for quantity (sesiones, mg, tragos…; default veces); forms in order (fumado, vapeado); symbol an emoji. Private log (harm reduction): neutral and factual, never lecture or push them to quit; raise it only when they do or it bears on what they asked. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "write",
    sensitive: true,
    method: "POST",
    path: "/substances/create_substance",
    input: z.object({ name: z.string().min(1).max(40), unit: z.string().min(1).max(20).optional(), forms: z.array(z.string().min(1).max(24)).max(8).optional(), symbol: z.string().max(40).optional() }),
    output: z.unknown(),
  }),
  set_substance_goal: op({
    name: "set_substance_goal",
    description: "Set their own weekly limit for a substance (\"máximo 2 días por semana\") ONLY when they ask; never propose one. null removes it. Private log (harm reduction): neutral and factual, never lecture or push them to quit; raise it only when they do or it bears on what they asked. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.",
    access: "write",
    sensitive: true,
    method: "POST",
    path: "/substances/set_substance_goal",
    input: z.object({ substance: z.string().min(1).describe("Name or id (list_substances).").default("Cannabis"), maxDaysPerWeek: z.int().min(0).max(7).nullable() }),
    output: z.unknown(),
  }),
};

/** Said in each phone operation, as the Coach tools say it. */
const PRIVATE =
  "Private log (harm reduction): neutral and factual, never lecture or push them to quit. This is the person's private health data: use it only for what they asked, and do not copy it elsewhere.";

/** Pulso's substances operations: its Coach tools, then what the iPhone's Sustancias calls (Pulso's /api/mobile/substances/*). */
export const substanceOperations = {
  ...substanceToolOperations,
  get_substance_overview: op({
    name: "get_substance_overview",
    description: `The phone's Sustancias screen: every substance (archived last), the 8-week summary of one (default the first active one; substance "all" = every active one together) and its uses of the last 60 days, newest first. date is the phone's local day (YYYY-MM-DD), default today on the Mac. For a model, substance_summary and list_substance_use are shorter. ${PRIVATE}`,
    access: "read",
    sensitive: true,
    method: "GET",
    path: "/substances",
    input: z.object({ substance: z.string().optional().describe('A substance id, or "all".'), date: z.string().optional().describe("YYYY-MM-DD, the phone's local day.") }),
    output: SubstanceOverview,
  }),
  record_substance_use: op({
    name: "record_substance_use",
    description: `Record one use from the phone, by substance id: substanceId defaults to the first active substance, date and time to now on the Mac, amount to normal, form to the substance's first one. Returns the use. From a conversation, log_substance_use takes a name. ${PRIVATE}`,
    access: "write",
    sensitive: true,
    method: "POST",
    path: "/substances",
    input: SubstanceEntryInput,
    output: SubstanceEntry,
    event: "substance_use.logged",
  }),
  update_substance_use: op({
    name: "update_substance_use",
    description: `Edit one logged use (any of its fields); moving it to another substance picks that one's default form unless form is given. Returns the use. ${PRIVATE}`,
    access: "write",
    sensitive: true,
    method: "PATCH",
    path: "/substances/{id}",
    input: SubstanceEntryPatch.extend({ id: z.string() }),
    output: SubstanceEntry,
    event: "substance_use.updated",
  }),
  remove_substance_use: op({
    name: "remove_substance_use",
    description: `Delete one logged use by id; answers { deleted: id }. ${PRIVATE}`,
    access: "write",
    sensitive: true,
    method: "DELETE",
    path: "/substances/{id}",
    input: z.object({ id: z.string() }),
    output: z.object({ deleted: z.string() }),
    event: "substance_use.deleted",
  }),
  list_substance_types: op({
    name: "list_substance_types",
    description: `Every tracked substance, in full: the active ones by position, then the archived ones. ${PRIVATE}`,
    access: "read",
    sensitive: true,
    method: "GET",
    path: "/substances/types",
    input: z.object({}),
    output: z.object({ substances: z.array(Substance) }),
  }),
  add_substance_type: op({
    name: "add_substance_type",
    description: `Add a substance to track from the phone, ONLY when the person asks: name, unit for quantity (default veces), forms in order, symbol (an emoji or SF Symbol), their own weekly limit. Returns it, last among the active ones. ${PRIVATE}`,
    access: "write",
    sensitive: true,
    method: "POST",
    path: "/substances/types",
    input: SubstanceInput,
    output: Substance,
    event: "substance.created",
  }),
  update_substance: op({
    name: "update_substance",
    description: `Edit a substance (name, symbol, unit, forms, maxDaysPerWeek), or archive it (archived true) or bring it back (false, last among the active ones). Nothing is ever deleted: archiving keeps its history. Returns it. ${PRIVATE}`,
    access: "write",
    sensitive: true,
    method: "PATCH",
    path: "/substances/types/{id}",
    input: SubstancePatch.extend({ id: z.string() }),
    output: Substance,
    event: "substance.updated",
  }),
  reorder_substances: op({
    name: "reorder_substances",
    description: `The pickers' order: ids lists every active substance once, first to last. Returns every substance (list_substance_types). ${PRIVATE}`,
    access: "write",
    sensitive: true,
    method: "PUT",
    path: "/substances/types/order",
    input: SubstanceOrder,
    output: z.object({ substances: z.array(Substance) }),
    event: "substance.reordered",
  }),
};
