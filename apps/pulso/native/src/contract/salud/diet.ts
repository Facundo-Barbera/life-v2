// Pulso's `@pulso/contract` `diet.ts`: its types keep their Pulso names.
/**
 * The dated diet: the active plan laid out as concrete slots (date × meal),
 * recipes and prep batches that fill them, and the revisions every
 * local change leaves (each can be undone). See apps/engine/src/domains/salud/nutrition/DIET.md.
 *
 * Its answers (PlanSlot, DietDay, DietHorizon, Recipe, PrepBatch, PlanRevision,
 * Compensation, PlanChange…) are zod schemas in ./nutrition.ts, built on the
 * nutrition ones and used by its operations; only the input types stay here.
 */
import type { RecipeIngredient } from "./nutrition";

export type RecipeInput = {
  name: string;
  servings: number;
  prepMinutes: number;
  batch?: boolean;
  ingredients: RecipeIngredient[];
  steps?: string | null;
};

/** A plan change on the wire: `op` plus its fields (see the engine's plan-inputs.ts for each). */
export type PlanOpInput = { op: string } & Record<string, unknown>;
