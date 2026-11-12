import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { fmtDay, getFrequentFoods, getNutritionDay, getNutritionHistory, getPlanRange, getSettings, listPlans, listRecipes, listSavedDishes, weekStart } from "@life/db/pulso";
import { TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { BudgetHero, DayNav, History, Meals, NextPlanned, Quick, WaterPanel } from "./_components/day";
import { PlanWeek } from "./_components/plan";
import { RecipeList } from "./_components/recipes";
import { AddMealSheet } from "./_components/sheets";

export const metadata = { title: "Dieta" };

const VIEWS = [
  { key: "hoy", label: "Día" },
  { key: "plan", label: "Plan" },
  { key: "recetas", label: "Recetas" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function Dieta({ searchParams }: { searchParams: Promise<{ fecha?: string; vista?: string; desde?: string }> }) {
  const params = await searchParams;
  const { client } = await requireMember();
  const view: View = VIEWS.some((v) => v.key === params.vista) ? (params.vista as View) : "hoy";
  const settings = await getSettings(client);
  const day = await getNutritionDay(client, params.fecha && DATE.test(params.fecha) ? params.fecha : undefined);

  const tabs = (
    <div className="seg" role="tablist">
      {VIEWS.map((v) => (
        <Link key={v.key} href={v.key === "hoy" ? (day.isToday ? "/dieta" : `/dieta?fecha=${day.date}`) : `/dieta?vista=${v.key}`} aria-current={view === v.key ? "page" : undefined}>
          {v.label}
        </Link>
      ))}
    </div>
  );

  if (view === "plan") {
    const from = params.desde && DATE.test(params.desde) ? params.desde : weekStart(day.today);
    const [range, plans] = await Promise.all([getPlanRange(client, from, 7), listPlans(client)]);
    return (
      <>
        <TopLine title="Dieta · Plan">
          {tabs}
        </TopLine>
        <PlanWeek plan={range.plan} plans={plans} days={range.days} recipes={range.recipes} from={from} today={day.today} budgetKcal={day.budget.kcal} />
      </>
    );
  }

  if (view === "recetas") {
    const recipes = await listRecipes(client);
    return (
      <>
        <TopLine title="Dieta · Recetas">{tabs}</TopLine>
        <RecipeList recipes={recipes} />
      </>
    );
  }

  const [frequent, dishes, history] = await Promise.all([getFrequentFoods(client), listSavedDishes(client), getNutritionHistory(client, day.today, 14)]);
  return (
    <>
      <TopLine title={`Dieta · ${fmtDay(day.date)}`}>
        {tabs}
        <Link href="/compras" className="btn ghost sm" title="Compras">
          <ShoppingCart size={14} />
        </Link>
      </TopLine>
      <div className="row between wrap">
        <DayNav day={day} />
        <AddMealSheet date={day.date} tz={day.timezone} />
      </div>
      <BudgetHero day={day} settings={settings} />
      <NextPlanned day={day} />
      <div className="cols-2" style={{ alignItems: "start" }}>
        <Meals day={day} />
        <div className="grid">
          <Quick day={day} frequent={frequent} dishes={dishes} />
          <WaterPanel day={day} />
          <History history={history} budget={day.budget.kcal} today={day.today} />
        </div>
      </div>
    </>
  );
}
