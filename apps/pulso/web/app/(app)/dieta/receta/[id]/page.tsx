import { Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getRecipe, itemTotals, recipePerServing } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { fmt, Panel, Stat, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { deleteRecipeAction } from "../../actions";
import { RecipeSheet } from "../../_components/sheets";

export const metadata = { title: "Receta" };

export default async function Receta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireMember();
  const recipe = await getRecipe(client, id).catch(() => null);
  if (!recipe) notFound();
  const per = recipePerServing(recipe);
  const total = itemTotals(recipe.ingredients);
  return (
    <>
      <TopLine title={`Receta · ${recipe.name}`} back="/dieta?vista=recetas" backLabel="Recetas">
        <RecipeSheet recipe={recipe} />
        <ActionButton action={deleteRecipeAction} fields={{ id: recipe.id }} className="btn ghost sm icon-only" confirm="¿Borrar esta receta?" title="Borrar">
          <Trash2 size={14} />
        </ActionButton>
      </TopLine>
      <Panel className="hero">
        <div className="title lg">{recipe.name}</div>
        <p className="small muted" style={{ margin: "4px 0 12px" }}>
          {fmt(recipe.servings, 1)} porciones{recipe.prep_minutes ? ` · ${recipe.prep_minutes} min` : ""}
          {recipe.batch ? " · para varios días" : ""}
        </p>
        <div className="stats">
          <Stat label="kcal / porción" value={fmt(per.kcal)} />
          <Stat label="Proteína" value={fmt(per.protein, 1)} unit="g" />
          <Stat label="Carbs" value={fmt(per.carbs, 1)} unit="g" />
          <Stat label="Grasa" value={fmt(per.fat, 1)} unit="g" />
          <Stat label="Fibra" value={fmt(per.fiber, 1)} unit="g" />
        </div>
      </Panel>
      <div className="cols-2" style={{ alignItems: "start" }}>
        <Panel title="Ingredientes" action={<span className="tiny muted mono">{fmt(total.kcal)} KCAL EN TOTAL</span>}>
          <table className="data">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th className="n">Cant.</th>
                <th className="n">kcal</th>
                <th className="n">P</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((i, k) => (
                <tr key={k}>
                  <td>{i.name}</td>
                  <td className="n">
                    {fmt(i.quantity, 1)} {i.unit}
                  </td>
                  <td className="n">{fmt(i.kcal)}</td>
                  <td className="n">{fmt(i.protein, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Preparación">
          {recipe.steps ? (
            <ol style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
              {recipe.steps
                .split(/\n+/)
                .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
                .filter(Boolean)
                .map((s, k) => (
                  <li key={k}>{s}</li>
                ))}
            </ol>
          ) : (
            <p className="small muted">Sin pasos todavía.</p>
          )}
          {recipe.notes ? <p className="small muted" style={{ marginTop: 10 }}>{recipe.notes}</p> : null}
        </Panel>
      </div>
    </>
  );
}
