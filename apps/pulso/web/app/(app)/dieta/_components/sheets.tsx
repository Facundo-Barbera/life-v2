"use client";
// Client wrappers so server pages can open a sheet whose form closes it on success.
import { Pencil, Plus } from "lucide-react";
import type { DietPlan, Meal, MealSlot, PlanSlot, PulsoSettings, Recipe, SavedDish } from "@life/db";
import { Sheet } from "@/components/client";
import { DishForm, MealForm, PlanForm, RecipeForm, SlotForm, TargetsForm } from "./forms";

export function AddMealSheet({ date, tz, slot, label = "Registrar", className = "btn accent" }: { date: string; tz: string; slot?: MealSlot | null; label?: string; className?: string }) {
  return (
    <Sheet trigger={<><Plus size={15} /> {label}</>} title="Registrar comida" triggerClassName={className}>
      {(close) => <MealForm date={date} tz={tz} defaultSlot={slot} onDone={close} />}
    </Sheet>
  );
}

export function EditMealSheet({ meal, tz }: { meal: Meal; tz: string }) {
  return (
    <Sheet trigger={<Pencil size={13} />} title="Editar comida" triggerClassName="btn ghost sm icon-only">
      {(close) => <MealForm date={meal.local_date ?? ""} meal={meal} tz={tz} onDone={close} />}
    </Sheet>
  );
}

export function DishSheet({ dish, label }: { dish?: SavedDish; label?: string }) {
  return (
    <Sheet trigger={dish ? <Pencil size={13} /> : <><Plus size={14} /> {label ?? "Platillo"}</>} title={dish ? "Editar platillo" : "Nuevo platillo"} triggerClassName={dish ? "btn ghost sm icon-only" : "btn sm"}>
      {(close) => <DishForm dish={dish} onDone={close} />}
    </Sheet>
  );
}

export function RecipeSheet({ recipe, label }: { recipe?: Recipe; label?: string }) {
  return (
    <Sheet trigger={recipe ? <><Pencil size={13} /> Editar</> : <><Plus size={14} /> {label ?? "Receta"}</>} title={recipe ? "Editar receta" : "Nueva receta"} triggerClassName={recipe ? "btn sm" : "btn accent sm"}>
      {(close) => <RecipeForm recipe={recipe} onDone={close} />}
    </Sheet>
  );
}

export function TargetsSheet({ s, computedKcal }: { s: PulsoSettings; computedKcal: number }) {
  return (
    <Sheet trigger="Objetivos" title="Objetivos de nutrición" triggerClassName="btn ghost sm">
      {(close) => <TargetsForm s={s} computedKcal={computedKcal} onDone={close} />}
    </Sheet>
  );
}

export function SlotSheet({ slot, recipes }: { slot: PlanSlot; recipes: Recipe[] }) {
  return (
    <Sheet trigger={<Pencil size={13} />} title="Editar comida del plan" triggerClassName="btn ghost sm icon-only">
      {(close) => <SlotForm slot={slot} recipes={recipes} onDone={close} />}
    </Sheet>
  );
}

export function PlanSheet({ plan, recipes, today, label }: { plan?: DietPlan; recipes: Recipe[]; today: string; label?: string }) {
  return (
    <Sheet trigger={plan ? <><Pencil size={13} /> Editar</> : <><Plus size={14} /> {label ?? "Nuevo plan"}</>} title={plan ? "Editar plan" : "Nuevo plan"} triggerClassName={plan ? "btn sm" : "btn accent sm"}>
      {(close) => <PlanForm plan={plan} recipes={recipes} today={today} onDone={close} />}
    </Sheet>
  );
}
