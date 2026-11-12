import { Check, ChevronLeft, ChevronRight, RotateCcw, SkipForward, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import type { DietPlan, Recipe } from "@life/db";
import { addDays, fmtShortDate, isoWeekday, type PlanWeekDay, SLOT_LABEL } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Chip, Empty, fmt, Label, Panel } from "@/components/ui";
import { activatePlanAction, deactivatePlanAction, deletePlanAction, deleteSlotAction, eatSlotAction, refillPlanAction, slotStatusAction, uneatSlotAction } from "../actions";
import { PlanSheet, SlotSheet } from "./sheets";

const WEEKDAY = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** The plan's week: each date's planned meals, to eat, skip or edit. */
export function PlanWeek({ plan, plans, days, recipes, from, today, budgetKcal }: { plan: DietPlan | null; plans: DietPlan[]; days: PlanWeekDay[]; recipes: Recipe[]; from: string; today: string; budgetKcal: number }) {
  const others = plans.filter((p) => !p.active);
  return (
    <>
      <Panel
        title="Plan activo"
        action={
          <div className="row" style={{ gap: 6 }}>
            {plan ? <PlanSheet plan={plan} recipes={recipes} today={today} /> : null}
            <PlanSheet recipes={recipes} today={today} />
          </div>
        }
      >
        {plan ? (
          <div className="row wrap">
            <div className="grow">
              <div className="title">{plan.name}</div>
              <div className="tiny muted mono">
                DESDE {fmtShortDate(plan.starts_on).toUpperCase()} · ROTACIÓN DE {plan.days.length} {plan.days.length === 1 ? "DÍA" : "DÍAS"}
                {plan.notes ? ` · ${plan.notes}` : ""}
              </div>
            </div>
            <ActionButton action={refillPlanAction} fields={{ id: plan.id }} className="btn sm" title="Rellenar los próximos 14 días">
              <RotateCcw size={13} /> Rellenar
            </ActionButton>
            <ActionButton action={deactivatePlanAction} fields={{ id: plan.id }} className="btn ghost sm" confirm="¿Pausar este plan? Lo ya planeado se queda.">
              Pausar
            </ActionButton>
          </div>
        ) : (
          <Empty title="Sin plan activo" line="Arma un plan con días de rotación (tus recetas o comidas rápidas) y Pulso llena las próximas fechas para que marques lo que comes y armes la lista de compras." />
        )}
      </Panel>

      <div className="row">
        <Link className="btn ghost sm icon-only" href={`/dieta?vista=plan&desde=${addDays(from, -7)}`} aria-label="Semana anterior">
          <ChevronLeft size={15} />
        </Link>
        <span className="label">
          {fmtShortDate(from)} – {fmtShortDate(addDays(from, 6))}
        </span>
        <Link className="btn ghost sm icon-only" href={`/dieta?vista=plan&desde=${addDays(from, 7)}`} aria-label="Semana siguiente">
          <ChevronRight size={15} />
        </Link>
      </div>

      <div className="cols-2">
        {days.map((d) => {
          const isToday = d.date === today;
          return (
            <Panel key={d.date} className={isToday ? "tight accent" : "tight"} title={`${WEEKDAY[isoWeekday(d.date) - 1]} ${fmtShortDate(d.date)}${isToday ? " · hoy" : ""}`} action={d.kcal ? <span className={`small mono ${d.kcal > budgetKcal * 1.05 ? "amber" : "muted"}`}>{fmt(d.kcal)} kcal</span> : null}>
              {d.slots.length === 0 ? (
                <p className="small muted" style={{ padding: "6px 16px 12px" }}>
                  Nada planeado.
                </p>
              ) : (
                <div className="rows">
                  {d.slots.map((s) => (
                    <div key={s.id} className="list-row" style={{ minHeight: 44, paddingBlock: 6, opacity: s.status === "skipped" ? 0.45 : 1 }}>
                      <div className="grow">
                        <div className="truncate" style={{ textDecoration: s.status === "skipped" ? "line-through" : undefined }}>
                          {s.name ?? SLOT_LABEL[s.slot]}
                        </div>
                        <div className="sub">
                          {SLOT_LABEL[s.slot]}
                          {s.time ? ` · ${s.time.slice(0, 5)}` : ""}
                          {s.kcal ? ` · ${fmt(s.kcal)} kcal` : ""}
                        </div>
                      </div>
                      {s.eaten ? (
                        <>
                          <Chip tone="green">Comida</Chip>
                          <ActionButton action={uneatSlotAction} fields={{ id: s.id }} className="btn ghost sm icon-only" title="Deshacer">
                            <Undo2 size={13} />
                          </ActionButton>
                        </>
                      ) : s.status === "skipped" ? (
                        <ActionButton action={slotStatusAction} fields={{ id: s.id, status: "planned" }} className="btn ghost sm" title="Volver a planear">
                          Reponer
                        </ActionButton>
                      ) : (
                        <>
                          {d.date <= today ? (
                            <ActionButton action={eatSlotAction} fields={{ id: s.id }} className="btn sm" title="Comí esto">
                              <Check size={13} />
                            </ActionButton>
                          ) : null}
                          <ActionButton action={slotStatusAction} fields={{ id: s.id, status: "skipped" }} className="btn ghost sm icon-only" title="Saltar">
                            <SkipForward size={13} />
                          </ActionButton>
                          <SlotSheet slot={s} recipes={recipes} />
                          <ActionButton action={deleteSlotAction} fields={{ id: s.id }} className="btn ghost sm icon-only" title="Quitar" confirm="¿Quitar esta comida del plan?">
                            <Trash2 size={13} />
                          </ActionButton>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      {others.length ? (
        <Panel className="tight" title="Otros planes">
          <div className="rows">
            {others.map((p) => (
              <div key={p.id} className="list-row">
                <div className="grow">
                  <div className="truncate">{p.name}</div>
                  <div className="sub">
                    {p.days.length} {p.days.length === 1 ? "día" : "días"} · desde {fmtShortDate(p.starts_on)}
                  </div>
                </div>
                <PlanSheet plan={p} recipes={recipes} today={today} />
                <ActionButton action={activatePlanAction} fields={{ id: p.id }} className="btn sm">
                  Activar
                </ActionButton>
                <ActionButton action={deletePlanAction} fields={{ id: p.id }} className="btn ghost sm icon-only" confirm="¿Borrar este plan y lo que tenía planeado? Lo que ya comiste se queda." title="Borrar">
                  <Trash2 size={13} />
                </ActionButton>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      <p className="tiny dim">
        <Label>Tip</Label> Con un plan activo, <Link href="/compras" className="green">Compras</Link> arma la lista de lo que necesitas.
      </p>
    </>
  );
}
