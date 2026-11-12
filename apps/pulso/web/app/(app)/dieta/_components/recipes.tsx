import { Clock } from "lucide-react";
import type { Recipe } from "@life/db";
import { recipePerServing } from "@life/db/pulso";
import { Empty, fmt, ListRow, Panel, Rows } from "@/components/ui";
import { RecipeSheet } from "./sheets";

export function RecipeList({ recipes }: { recipes: Recipe[] }) {
  return (
    <Panel className="tight" title="Recetas" action={<RecipeSheet label="Receta" />}>
      {recipes.length === 0 ? (
        <div style={{ padding: "6px 16px 12px" }}>
          <Empty title="Sin recetas" line="Guarda tus recetas con sus ingredientes: el plan las usa para calcular calorías y la lista de compras." />
        </div>
      ) : (
        <Rows>
          {recipes.map((r) => {
            const p = recipePerServing(r);
            return (
              <ListRow
                key={r.id}
                href={`/dieta/receta/${r.id}`}
                title={r.name}
                sub={`${fmt(r.servings, 1)} porc. · ${r.ingredients.length} ing.${r.batch ? " · para varios días" : ""}`}
                trailing={
                  <div className="right">
                    <div className="num sm">{fmt(p.kcal)}</div>
                    <div className="tiny muted mono">
                      KCAL/PORC · P {fmt(p.protein)}
                      {r.prep_minutes ? (
                        <>
                          {" "}
                          · <Clock size={10} /> {r.prep_minutes}′
                        </>
                      ) : null}
                    </div>
                  </div>
                }
              />
            );
          })}
        </Rows>
      )}
    </Panel>
  );
}
