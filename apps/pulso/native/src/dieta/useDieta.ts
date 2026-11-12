import type { DietTargetProposal, InputOf, MealEntry, PlanChange, PlanSlot, SavedDish } from "@/contract";
import { useCallback, useMemo } from "react";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { useOperation } from "@/data/queries";
import { haptics } from "@/ui/haptics";
import { useToast } from "@/ui/Toast";
import { addDays, dayKey, eatenAtFor, litres, SLOT_TITLES, type MealSlot } from "./model";
import { noteLogged } from "./session";

export type MealInput = Omit<InputOf<"add_meal_entry">, "date" | "eatenAt">;

/** Everything Dieta reads for a day and every write it makes, each with its toast and Deshacer (NutritionStore.swift). */
export function useDieta(date: string) {
  const today = dayKey();
  const toast = useToast();
  const { run, busy } = useAction();
  const day = useOperation("get_nutrition_day", { date });
  const history = useOperation("get_nutrition_history", { days: 7, to: date });
  const frequent = useOperation("list_frequent_foods", {});
  const snacks = useOperation("list_frequent_foods", { kind: "snack" });
  const horizon = useOperation("get_plan_horizon", { from: today });
  const review = useOperation("review_diet_week", {});

  const fail = useCallback((error: unknown) => toast.show({ message: describeError(error), tone: "error" }), [toast]);
  /** Runs a write; on failure shows why and resolves undefined. */
  const attempt = useCallback(
    async <T>(work: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await work();
      } catch (error) {
        fail(error);
        return undefined;
      }
    },
    [fail],
  );

  const undoRevision = useCallback(
    (id: string) =>
      attempt(async () => {
        const change = await run("undo_plan_revision", { id });
        toast.show({ message: change.summary, icon: "arrow.uturn.backward" });
      }),
    [attempt, run, toast],
  );
  const showChange = useCallback((change: PlanChange) => toast.show({ message: change.summary, undo: () => undoRevision(change.revision.id) }), [toast, undoRevision]);

  const when = useMemo(() => ({ date, eatenAt: eatenAtFor(date) }), [date]);

  return {
    date,
    today,
    isToday: date === today,
    day,
    history,
    frequent,
    snacks,
    horizon,
    review,
    busy,
    run,
    attempt,
    refetch: () => Promise.all([day.refetch(), history.refetch(), frequent.refetch(), horizon.refetch(), review.refetch()]),

    /** A food (manual, barcode, frequent, snack): POST nutrition/meals. */
    log: (input: MealInput) =>
      attempt(async () => {
        const { meal } = await run("add_meal_entry", { ...input, date, eatenAt: eatenAtFor(date) });
        noteLogged([meal.id]);
        haptics.success();
        return meal;
      }),
    logDish: (dish: SavedDish, scale: number, removed: number[], slot: MealSlot | null) =>
      attempt(async () => {
        const { meals } = await run("log_saved_dish", { id: dish.id, scale, overrides: removed.map((component) => ({ component, remove: true })), slot: slot ?? dish.slot ?? undefined, ...when, slotId: null });
        noteLogged(meals.map((m) => m.id));
        haptics.success();
        return meals;
      }),
    logNewDish: (name: string | undefined, components: MealInput[], slot: MealSlot, keep: boolean) =>
      attempt(async () => {
        const { meals } = await run("log_new_dish", { name, components, slot, ...when, slotId: null });
        noteLogged(meals.map((m) => m.id));
        const dishId = meals[0]?.dish?.id;
        if (keep && dishId) await run("create_saved_dish", { loggedDishId: dishId });
        haptics.success();
        return meals;
      }),
    /** «Cambiar la cantidad»: the whole entry scaled (macros, quantity, measure). */
    scale: (meal: MealEntry, factor: number) =>
      factor > 0 && factor !== 1
        ? attempt(() =>
            run("update_meal", {
              id: meal.id,
              name: meal.name,
              slot: meal.slot,
              quantity: Math.round(meal.quantity * factor * 10) / 10,
              unit: meal.unit,
              ...(meal.measure && { measure: { amount: Math.round(meal.measure.amount * factor * 100) / 100, unit: meal.measure.unit, ...(meal.measure.size != null && { size: meal.measure.size }) } }),
              kcal: Math.round(meal.kcal * factor),
              protein: meal.protein * factor,
              carbs: meal.carbs * factor,
              fat: meal.fat * factor,
              fiber: meal.fiber * factor,
              caffeineMg: meal.caffeineMg != null ? meal.caffeineMg * factor : null,
              alcoholG: meal.alcoholG != null ? meal.alcoholG * factor : null,
              eatenAt: meal.eatenAt,
              date: meal.date,
              barcode: meal.barcode,
            }),
          )
        : Promise.resolve(undefined),
    addToDish: (dishId: string, input: MealInput) => attempt(() => run("edit_logged_dish", { id: dishId, add: [input] })),
    saveDish: (dishId: string) => attempt(() => run("create_saved_dish", { loggedDishId: dishId })),
    /** One entry, with Deshacer that logs it again as it was. */
    remove: (meal: MealEntry) =>
      attempt(async () => {
        await run("delete_meal_entry", { id: meal.id });
        toast.show({
          message: `${meal.name} borrado`,
          icon: "trash",
          undo: meal.dish
            ? undefined
            : () =>
                run("add_meal_entry", {
                  name: meal.name,
                  slot: meal.slot,
                  quantity: meal.quantity,
                  unit: meal.unit,
                  kcal: meal.kcal,
                  protein: meal.protein,
                  carbs: meal.carbs,
                  fat: meal.fat,
                  fiber: meal.fiber,
                  caffeineMg: meal.caffeineMg,
                  alcoholG: meal.alcoholG,
                  eatenAt: meal.eatenAt,
                  date: meal.date,
                  barcode: meal.barcode,
                  source: meal.source === "barcode" ? "barcode" : "manual",
                  ...(meal.measure && { measure: { amount: meal.measure.amount, unit: meal.measure.unit, ...(meal.measure.size != null && { size: meal.measure.size }) } }),
                }),
        });
      }),
    removeMany: (ids: string[]) => attempt(async () => void (await Promise.all(ids.map((id) => run("delete_meal_entry", { id }))))),
    copyPrevious: () =>
      attempt(async () => {
        const { meals } = await run("copy_meals", { from: addDays(date, -1), to: date });
        toast.show({ message: meals.length ? `${meals.length} alimentos copiados` : "El día anterior está vacío" });
      }),

    // Plan
    eatSlot: (slot: PlanSlot) =>
      attempt(async () => {
        const out = await run("eat_planned_meal", { slotId: slot.id });
        const meals = "meals" in out ? out.meals : [out.meal];
        if (meals.length) {
          haptics.success();
          toast.show({ message: `${SLOT_TITLES[slot.slot]}: como en el plan`, undo: () => Promise.all(meals.map((m) => run("delete_meal_entry", { id: m.id }))) });
        }
      }),
    planOp: (input: { op: "skip" | "ate_out" | "no_time_to_cook" | "replace" | "prep_cooked"; date?: string; slotId?: string; slot?: MealSlot; entryIds?: string[]; prepId?: string; cooked?: boolean }) =>
      attempt(async () => {
        const result = (await run("run_plan_op", input)) as PlanChange;
        if (result?.revision) showChange(result);
        return result;
      }),
    undoRevision,

    /** The Coach's pending targets: Aceptar applies them, Descartar leaves the current ones. */
    resolveProposal: (proposal: DietTargetProposal, accept: boolean) =>
      attempt(async () => {
        await run("resolve_diet_targets_proposal", { id: proposal.id, accept });
        if (accept) haptics.success();
        toast.show({ message: accept ? `Objetivo nuevo: ${Math.round(proposal.kcal)} kcal` : "Propuesta descartada" });
      }),

    // Water
    addWater: (ml: number) =>
      attempt(async () => {
        const { entry } = await run("add_water_entry", { amountMl: ml, date, loggedAt: eatenAtFor(date) });
        haptics.tap();
        toast.show({ message: `+${litres(ml)} de agua`, icon: "drop.fill", undo: () => run("delete_water", { id: entry.id }) });
      }),
    removeWater: (id: string) => attempt(() => run("delete_water", { id })),
  };
}

export type Dieta = ReturnType<typeof useDieta>;
