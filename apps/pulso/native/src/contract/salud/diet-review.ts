import { z } from "zod";
import { NutritionTargets } from "./nutrition";
import { op } from "./operation";

/**
 * The weekly diet check-in (MacroFactor-style): logging first, then the weight
 * trend, the expenditure it implies and, every 2–4 weeks, a proposed change of
 * targets that waits for the person's yes. See the engine's nutrition/checkin.ts.
 */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const DIET_REVIEW_ACTIONS = ["log_more", "weigh_more", "wait", "keep", "adjust", "protein_first"] as const;
export const DietReviewAction = z.enum(DIET_REVIEW_ACTIONS);
export type DietReviewAction = z.infer<typeof DietReviewAction>;

export const ExpenditureConfidence = z.enum(["none", "low", "medium", "high"]);
export type ExpenditureConfidence = z.infer<typeof ExpenditureConfidence>;

export const DietTargetsValues = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), fiber: z.number() });
export type DietTargetsValues = z.infer<typeof DietTargetsValues>;

export const DietTargetProposal = DietTargetsValues.extend({
  id: z.string(),
  status: z.enum(["pending", "accepted", "discarded"]),
  /** The targets when it was proposed; null if none were set. */
  previous: DietTargetsValues.nullable(),
  /** Why, in Spanish, as the person reads it. */
  reason: z.string(),
  createdAt: z.number(),
  resolvedAt: z.number().nullable(),
});
export type DietTargetProposal = z.infer<typeof DietTargetProposal>;

export const DietWeekReview = z.object({
  /** The review's day; intake counts the `window` days before it, weight up to it. */
  date: z.string(),
  window: z.object({ from: z.string(), to: z.string(), days: z.number() }),
  logging: z.object({
    /** Days with food logged near a full day's intake. */
    complete: z.number(),
    /** Days with something logged but too little to be a whole day. */
    partial: z.number(),
    empty: z.number(),
    /** Complete days among the last 7. */
    lastWeekComplete: z.number(),
    /** ≥5/7 last week and ≥15 of the window: enough to estimate and to adjust. */
    reliable: z.boolean(),
    /** kcal under which a logged day counts as partial. */
    partialBelowKcal: z.number(),
    note: z.string(),
  }),
  weight: z.object({
    /** Days with a weigh-in in the window. */
    weighIns: z.number(),
    latest: z.object({ date: z.string(), kg: z.number() }).nullable(),
    /** Smoothed weight (EWMA, gap-aware) at the latest weigh-in. */
    trendKg: z.number().nullable(),
    /** kg per week, negative = losing. */
    ratePerWeekKg: z.number().nullable(),
    /** % of body weight per week, negative = losing. */
    ratePercentPerWeek: z.number().nullable(),
    /** The loss rate aimed for, % per week. */
    targetLossPercent: z.object({ min: z.number(), max: z.number() }),
    status: z.enum(["unknown", "gaining", "slow", "inRange", "fast"]),
    note: z.string(),
  }),
  intake: z.object({ meanKcal: z.number().nullable(), meanProtein: z.number().nullable() }),
  expenditure: z.object({
    /** kcal/day: mean intake − change in stored energy (7700 kcal per kg of trend). */
    kcal: z.number().nullable(),
    /** ~80 % range. */
    low: z.number().nullable(),
    high: z.number().nullable(),
    confidence: ExpenditureConfidence,
    note: z.string(),
  }),
  protein: z.object({
    /** The day's minimum (protein zone), g. */
    minimum: z.number().nullable(),
    meanG: z.number().nullable(),
    daysMet: z.number(),
    daysCounted: z.number(),
    /** Mean g per kg of fat-free mass (latest InBody), when known. */
    perKgLean: z.number().nullable(),
  }),
  /** Fat vs lean mass lost between the last two InBody scans ≥14 days apart. */
  composition: z
    .object({ from: z.string(), to: z.string(), weightChange: z.number(), fatChange: z.number(), leanChange: z.number(), fatPerLean: z.number().nullable(), note: z.string() })
    .nullable(),
  glp1: z.object({ active: z.boolean(), medication: z.string().nullable() }),
  /** The current kcal target and the floor any proposal respects. */
  calories: z.object({ target: z.number().nullable(), floor: z.number(), lastChange: z.string().nullable() }),
  decision: z.object({
    action: DietReviewAction,
    /** Spanish, for the person. */
    reason: z.string(),
    /** With `wait`: the first day a change makes sense. */
    nextDecisionOn: z.string().nullable(),
  }),
  /** With `adjust`: the targets to propose (propose_diet_targets), protein kept. */
  suggestion: DietTargetsValues.extend({ deltaKcal: z.number(), reason: z.string() }).nullable(),
  pending: DietTargetProposal.nullable(),
  /** Spanish lines to show as they are (GLP-1, doctor). */
  notes: z.array(z.string()),
});
export type DietWeekReview = z.infer<typeof DietWeekReview>;

const grams = z.number().min(0).max(2000);

export const dietReviewOperations = {
  review_diet_week: op({
    name: "review_diet_week",
    description:
      "The weekly diet check-in, in the order to read it: logging completeness (complete/partial/empty days over ~3 weeks; unreliable logging means the job is to log, not to eat less), the weight trend (gap-tolerant, works with 2–3 weigh-ins a week) and its rate in % per week against a 0.5–1 % loss target, the estimated real expenditure (mean intake − change in stored energy) with an ~80 % range and confidence, protein adherence, fat vs lean mass between InBody scans, GLP-1 context, and a decision: log_more, weigh_more, wait (targets changed < 14 days ago), keep, protein_first, or adjust with a `suggestion` (kcal moved toward ~0.75 %/week, ≤300 kcal per step, never under `calories.floor`; protein kept). Also any `pending` proposal. It changes nothing: to offer the suggestion, propose_diet_targets.",
    access: "read",
    method: "GET",
    path: "/nutrition/review_week",
    input: z.object({ date: dateString.describe("The review's day; default today").optional() }),
    output: DietWeekReview,
  }),
  propose_diet_targets: op({
    name: "propose_diet_targets",
    description:
      "Leave new daily targets PENDING for the person to accept or discard on Dieta (it never changes the targets itself; a pending one is replaced). Use review_diet_week's suggestion unless the person asked otherwise; `reason` is the Spanish line they read (rate, expenditure, what changes). Returns { proposal }.",
    access: "write",
    method: "POST",
    path: "/nutrition/target_proposals",
    input: z.object({
      kcal: z.number().min(800).max(6000),
      protein: grams.describe("g"),
      carbs: grams.describe("g"),
      fat: grams.describe("g"),
      fiber: grams.describe("g; default 14 per 1000 kcal").optional(),
      reason: z.string().min(1).max(500).describe("In Spanish, for the person"),
    }),
    output: z.object({ proposal: DietTargetProposal }),
    event: "nutrition.propose_diet_targets",
  }),
  resolve_diet_targets_proposal: op({
    name: "resolve_diet_targets_proposal",
    description:
      "The person's answer to a pending targets proposal: accept (the targets become the proposal's; custom zones of nutrients that keep their value stay) or discard. Only on the person's word. Returns { proposal, targets } (targets null when discarded).",
    access: "write",
    method: "POST",
    path: "/nutrition/target_proposals/{id}/resolve",
    input: z.object({ id: z.string(), accept: z.boolean() }),
    output: z.object({ proposal: DietTargetProposal, targets: NutritionTargets.nullable() }),
    event: "nutrition.resolve_diet_targets_proposal",
  }),
};
