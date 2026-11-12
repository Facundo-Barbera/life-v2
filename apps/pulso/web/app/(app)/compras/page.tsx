import { Check, Trash2 } from "lucide-react";
import Link from "next/link";
import { addDays, fmtShortDate, getActivePlan, getSettings, getShopping, localDate, SHOPPING_CATEGORIES, SHOPPING_CATEGORY_LABELS } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Chip, Empty, Meter, Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { categoryAction, clearAllAction, clearCheckedAction, deleteItemAction, toggleAction } from "./actions";
import { AddItemForm, BuildForm } from "./forms";

export const metadata = { title: "Compras" };

export default async function Compras() {
  const { client } = await requireMember();
  const [settings, view, plan] = await Promise.all([getSettings(client), getShopping(client), getActivePlan(client)]);
  const today = localDate(new Date(), settings.timezone);
  const total = view.toBuy + view.bought;
  const categories = SHOPPING_CATEGORIES.map((key) => ({ key, label: SHOPPING_CATEGORY_LABELS[key] }));
  return (
    <>
      <TopLine title="Compras">
        <Link href="/dieta?vista=plan" className="btn ghost sm">
          Plan
        </Link>
      </TopLine>
      <div className="cols-2" style={{ alignItems: "start" }}>
        <Panel title="Del plan">
          {plan ? (
            <>
              <p className="small muted" style={{ marginBottom: 10 }}>
                Suma lo que usan las comidas de <span className="strong">{plan.name}</span> en esos días. Lo que agregas a mano se queda.
              </p>
              <BuildForm from={view.list?.from_date && view.list.from_date >= today ? view.list.from_date : today} days={view.list?.days ?? 7} />
              {view.list ? (
                <p className="tiny muted mono" style={{ marginTop: 8 }}>
                  LISTA DEL {fmtShortDate(view.list.from_date).toUpperCase()} AL {fmtShortDate(addDays(view.list.from_date, view.list.days - 1)).toUpperCase()}
                  {view.list.plan_name && view.list.plan_name !== plan.name ? ` · DE «${view.list.plan_name}»` : ""}
                </p>
              ) : null}
            </>
          ) : (
            <Empty title="Sin plan activo" line="Activa un plan en Dieta para armar la lista con sus ingredientes. Mientras, agrega cosas a mano.">
              <Link href="/dieta?vista=plan" className="btn sm">
                Ir al plan
              </Link>
            </Empty>
          )}
        </Panel>
        <Panel title="Agregar">
          <AddItemForm categories={categories} />
        </Panel>
      </div>

      <Panel
        className="tight"
        title={total ? `${view.bought} de ${total} comprados` : "Lista"}
        action={
          total ? (
            <div className="row" style={{ gap: 6 }}>
              {view.bought ? (
                <ActionButton action={clearCheckedAction} fields={{}} className="btn ghost sm">
                  Quitar comprados
                </ActionButton>
              ) : null}
              <ActionButton action={clearAllAction} fields={{}} className="btn ghost sm" confirm="¿Vaciar toda la lista?">
                Vaciar
              </ActionButton>
            </div>
          ) : null
        }
      >
        {total ? (
          <div style={{ padding: "4px 16px 8px" }}>
            <Meter value={view.bought} max={total} />
          </div>
        ) : (
          <div style={{ padding: "6px 16px 12px" }}>
            <p className="small muted">La lista está vacía.</p>
          </div>
        )}
        {view.byCategory.map((g) => (
          <div key={g.category} style={{ borderTop: "1px solid var(--life-border)" }}>
            <div className="row" style={{ padding: "8px 16px 2px" }}>
              <span className="label grow">{g.label}</span>
              <span className="tiny muted mono">{g.items.filter((i) => !i.checked).length}</span>
            </div>
            <div className="rows">
              {g.items.map((i) => (
                <div key={i.id} className="list-row" style={{ minHeight: 44, paddingBlock: 4, opacity: i.checked ? 0.45 : 1 }}>
                  <ActionButton action={toggleAction} fields={{ id: i.id, checked: !i.checked }} className={i.checked ? "btn accent sm icon-only" : "btn sm icon-only"} title={i.checked ? "Desmarcar" : "Comprado"}>
                    <Check size={13} />
                  </ActionButton>
                  <div className="grow">
                    <div className="truncate" style={{ textDecoration: i.checked ? "line-through" : undefined }}>
                      {i.name}
                    </div>
                    {i.note ? <div className="sub">{i.note}</div> : null}
                  </div>
                  {i.amount ? <span className="small mono muted">{i.amount}</span> : null}
                  {i.source === "manual" ? <Chip>a mano</Chip> : null}
                  <form action={categoryAction} className="row" style={{ gap: 4 }}>
                    <input type="hidden" name="id" value={i.id} />
                    <select className="select" name="category" defaultValue={i.category} style={{ minHeight: 28, padding: "2px 6px", width: 130, fontSize: 12 }} aria-label="Pasillo">
                      {categories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="btn ghost sm">
                      Mover
                    </button>
                  </form>
                  <ActionButton action={deleteItemAction} fields={{ id: i.id }} className="btn ghost sm icon-only" title="Borrar">
                    <Trash2 size={13} />
                  </ActionButton>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Panel>
    </>
  );
}
