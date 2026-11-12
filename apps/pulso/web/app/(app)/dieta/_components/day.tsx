import { Check, ChevronLeft, ChevronRight, Copy, Droplet, Trash2, Utensils } from "lucide-react";
import Link from "next/link";
import type { Meal, MealSlot, PulsoSettings, SavedDish } from "@life/db";
import { addDays, fmtDay, type FrequentFood, itemTotals, localTime, MEAL_SLOTS, type NutritionDay, SLOT_LABEL } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Bars, Chip, Empty, fmt, Label, Meter, Num, Panel } from "@/components/ui";
import { addWaterAction, copyDayAction, deleteDishAction, deleteMealAction, deleteWaterAction, eatSlotAction, logDishAction, quickAddAction } from "../actions";
import { AddMealSheet, DishSheet, EditMealSheet, TargetsSheet } from "./sheets";
import { WaterCustom } from "./water";

const PACE: Record<NonNullable<NutritionDay["pace"]>, { label: string; tone: "green" | "amber" | "blue" | "red" }> = {
  bien: { label: "A buen ritmo", tone: "green" },
  adelantado: { label: "Adelantado", tone: "amber" },
  atrasado: { label: "Vas corto", tone: "blue" },
  pasado: { label: "Te pasaste", tone: "red" },
};

export function dayHref(date: string, today: string) {
  return date === today ? "/dieta" : `/dieta?fecha=${date}`;
}

export function DayNav({ day }: { day: NutritionDay }) {
  const prev = addDays(day.date, -1);
  const next = addDays(day.date, 1);
  const label = day.isToday ? "Hoy" : day.date === addDays(day.today, -1) ? "Ayer" : fmtDay(day.date);
  return (
    <div className="row">
      <Link className="btn ghost sm icon-only" href={dayHref(prev, day.today)} aria-label="Día anterior" scroll={false}>
        <ChevronLeft size={15} />
      </Link>
      <span className="mono small" style={{ minWidth: 120, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      {day.isToday ? (
        <span className="btn ghost sm icon-only" aria-hidden style={{ opacity: 0.3 }}>
          <ChevronRight size={15} />
        </span>
      ) : (
        <Link className="btn ghost sm icon-only" href={dayHref(next, day.today)} aria-label="Día siguiente" scroll={false}>
          <ChevronRight size={15} />
        </Link>
      )}
    </div>
  );
}

/** The budget at this hour: eaten vs budget, the tick where you should be by now, macros. */
export function BudgetHero({ day, settings }: { day: NutritionDay; settings: PulsoSettings }) {
  const { budget, eaten } = day;
  const over = day.remaining < 0;
  const pace = day.pace ? PACE[day.pace] : null;
  const macros: [string, number, number, string][] = [
    ["Proteína", eaten.protein, budget.protein, "var(--life-green)"],
    ["Carbs", eaten.carbs, budget.carbs, "var(--life-blue)"],
    ["Grasa", eaten.fat, budget.fat, "var(--life-amber)"],
    ["Fibra", eaten.fiber, budget.fiber, "var(--violet)"],
  ];
  return (
    <Panel className="hero" title="Presupuesto" action={<TargetsSheet s={settings} computedKcal={budget.kcal} />}>
      <div className="row wrap" style={{ alignItems: "flex-end", gap: 18 }}>
        <div className="stack" style={{ gap: 4 }}>
          <Label>Comido</Label>
          <Num value={fmt(eaten.kcal)} unit={`/ ${fmt(budget.kcal)} kcal`} size="xl" />
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <Label>{over ? "Pasado" : "Te quedan"}</Label>
          <Num value={fmt(Math.abs(day.remaining))} unit="kcal" size="lg" className={over ? "red" : "green"} />
        </div>
        {day.expectedNow != null ? (
          <div className="stack" style={{ gap: 4 }}>
            <Label>A esta hora</Label>
            <Num value={fmt(day.expectedNow)} unit="kcal" size="md" className="muted" />
          </div>
        ) : null}
        <span className="grow" />
        {pace ? <Chip tone={pace.tone}>{pace.label}</Chip> : null}
        <Chip tone={budget.source === "manual" ? "amber" : undefined}>{budget.source === "manual" ? "A mano" : budget.source === "meta" ? "Por tu meta" : "Mantener"}</Chip>
      </div>
      <div style={{ margin: "14px 0 6px" }}>
        <Meter value={eaten.kcal} max={Math.max(budget.kcal, eaten.kcal)} mark={day.expectedNow} color={over ? "var(--red)" : undefined} tall />
      </div>
      <p className="tiny muted">{budget.explanation}</p>
      <div className="cols-4" style={{ marginTop: 12 }}>
        {macros.map(([label, value, target, color]) => (
          <div key={label} className="stack" style={{ gap: 5 }}>
            <div className="row between">
              <Label>{label}</Label>
              <span className="small mono">
                {fmt(value, 0)}
                <span className="dim"> / {fmt(target)} g</span>
              </span>
            </div>
            <Meter value={value} max={Math.max(target, value, 1)} color={color} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

type Group = { key: string; dishId: string | null; name: string; meals: Meal[]; kcal: number; protein: number; at: string };

function groups(meals: Meal[]): Group[] {
  const out: Group[] = [];
  const byDish = new Map<string, Group>();
  for (const m of meals) {
    if (m.dish_id) {
      const g = byDish.get(m.dish_id);
      if (g) {
        g.meals.push(m);
        g.kcal += Number(m.kcal);
        g.protein += Number(m.protein_g);
        continue;
      }
      const ng: Group = { key: m.dish_id, dishId: m.dish_id, name: m.dish_name ?? m.name, meals: [m], kcal: Number(m.kcal), protein: Number(m.protein_g), at: m.eaten_at };
      byDish.set(m.dish_id, ng);
      out.push(ng);
    } else out.push({ key: m.id, dishId: null, name: m.name, meals: [m], kcal: Number(m.kcal), protein: Number(m.protein_g), at: m.eaten_at });
  }
  return out;
}

/** The day's meals by moment, each with its subtotal and its own add button. */
export function Meals({ day }: { day: NutritionDay }) {
  const tz = day.timezone;
  return (
    <Panel className="tight" title="Comidas">
      {MEAL_SLOTS.map((slot) => {
        const list = day.bySlot[slot];
        const kcal = list.reduce((s, m) => s + Number(m.kcal), 0);
        return (
          <div key={slot} style={{ borderTop: "1px solid var(--life-border)" }}>
            <div className="row" style={{ padding: "8px 16px 4px" }}>
              <span className="label grow">{SLOT_LABEL[slot]}</span>
              {list.length ? <span className="small mono muted">{fmt(kcal)} kcal</span> : null}
              <AddMealSheet date={day.date} tz={tz} slot={slot as MealSlot} label="" className="btn ghost sm icon-only" />
            </div>
            {list.length ? (
              <div className="rows">
                {groups(list).map((g) => (
                  <div key={g.key} className="list-row" style={{ minHeight: 44, paddingBlock: 6 }}>
                    <span className="mono tiny dim" style={{ width: 38 }}>
                      {localTime(g.at, tz)}
                    </span>
                    <div className="grow">
                      <div className="truncate">
                        {g.name}
                        {g.meals[0]!.plan_slot_id ? <span className="green tiny mono"> · PLAN</span> : null}
                      </div>
                      <div className="sub truncate">
                        {g.dishId
                          ? g.meals.map((m) => m.name).join(" · ")
                          : [g.meals[0]!.quantity != null ? `${fmt(g.meals[0]!.quantity, 1)} ${g.meals[0]!.unit ?? ""}` : null, `P ${fmt(g.protein, 1)} g`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span className="num sm">{fmt(g.kcal)}</span>
                    {g.dishId ? null : <EditMealSheet meal={g.meals[0]!} tz={tz} />}
                    <ActionButton action={deleteMealAction} fields={g.dishId ? { dish: g.dishId } : { id: g.meals[0]!.id }} className="btn ghost sm icon-only" title="Borrar" confirm={g.dishId ? "¿Borrar el platillo completo?" : undefined}>
                      <Trash2 size={13} />
                    </ActionButton>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {day.meals.length === 0 ? (
        <div style={{ padding: "8px 16px 12px" }}>
          <Empty title="Nada registrado" line="Registra lo que comes o copia lo del día anterior.">
            <ActionButton action={copyDayAction} fields={{ from: addDays(day.date, -1), to: day.date }} className="btn sm">
              <Copy size={13} /> Copiar el día anterior
            </ActionButton>
          </Empty>
        </div>
      ) : null}
    </Panel>
  );
}

export function NextPlanned({ day }: { day: NutritionDay }) {
  const s = day.nextPlanned;
  if (!s || !day.isToday) return null;
  const kcal = itemTotals(s.items).kcal;
  return (
    <Panel className="tight accent">
      <div className="list-row">
        <span className="icon">
          <Utensils size={15} />
        </span>
        <div className="grow">
          <div className="truncate">{s.name ?? SLOT_LABEL[s.slot]}</div>
          <div className="sub">
            Siguiente del plan · {SLOT_LABEL[s.slot]}
            {s.time ? ` · ${s.time.slice(0, 5)}` : ""}
            {kcal ? ` · ${fmt(kcal)} kcal` : ""}
          </div>
        </div>
        <ActionButton action={eatSlotAction} fields={{ id: s.id }} className="btn accent sm">
          <Check size={13} /> Comí esto
        </ActionButton>
      </div>
    </Panel>
  );
}

/** Frequent foods and saved dishes, one tap to log. */
export function Quick({ day, frequent, dishes }: { day: NutritionDay; frequent: FrequentFood[]; dishes: SavedDish[] }) {
  return (
    <Panel title="Rápido" action={<DishSheet label="Platillo" />}>
      {frequent.length === 0 && dishes.length === 0 ? <p className="small muted">Lo que registres seguido y tus platillos aparecen aquí para anotarlos con un toque.</p> : null}
      {dishes.length ? (
        <div className="stack" style={{ marginBottom: 10 }}>
          <Label>Mis platillos</Label>
          <div className="rows">
            {dishes.map((d) => {
              const t = itemTotals(d.components);
              return (
                <div key={d.id} className="row" style={{ padding: "6px 0" }}>
                  <div className="grow">
                    <div className="truncate">{d.name}</div>
                    <div className="tiny muted mono">
                      {fmt(t.kcal)} KCAL · P {fmt(t.protein)} · {d.components.length} ING.
                    </div>
                  </div>
                  <ActionButton action={logDishAction} fields={{ id: d.id, date: day.date, slot: d.slot ?? undefined }} className="btn sm" title={`Registrar ${d.name}`}>
                    + Anotar
                  </ActionButton>
                  <DishSheet dish={d} />
                  <ActionButton action={deleteDishAction} fields={{ id: d.id }} className="btn ghost sm icon-only" confirm="¿Borrar este platillo guardado?" title="Borrar">
                    <Trash2 size={13} />
                  </ActionButton>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {frequent.length ? (
        <div className="stack">
          <Label>Frecuentes</Label>
          <div className="row wrap" style={{ gap: 6 }}>
            {frequent.map((f) => (
              <ActionButton
                key={f.name}
                action={quickAddAction}
                fields={{ date: day.date, name: f.name, quantity: f.quantity, unit: f.unit, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber }}
                className="chip"
                title={`Anotar ${f.name}`}
              >
                + {f.name} · {fmt(f.kcal)}
              </ActionButton>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

export function WaterPanel({ day }: { day: NutritionDay }) {
  const goal = day.waterGoalMl;
  return (
    <Panel title="Agua">
      <div className="row" style={{ alignItems: "flex-end", marginBottom: 8 }}>
        <Num value={fmt(day.waterMl / 1000, 2)} unit={goal ? `/ ${fmt(goal / 1000, 1)} L` : "L"} size="lg" className="blue" />
      </div>
      {goal ? <Meter value={day.waterMl} max={Math.max(goal, day.waterMl)} color="var(--life-blue)" /> : null}
      <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
        <ActionButton action={addWaterAction} fields={{ ml: day.glassMl, date: day.date }} className="btn sm">
          <Droplet size={13} /> Vaso {day.glassMl} ml
        </ActionButton>
        <ActionButton action={addWaterAction} fields={{ ml: day.bottleMl, date: day.date }} className="btn sm">
          <Droplet size={13} /> Botella {day.bottleMl} ml
        </ActionButton>
        <WaterCustom date={day.date} />
      </div>
      {day.water.length ? (
        <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
          {day.water.map((w) => (
            <span key={w.id} className="chip">
              {localTime(w.drunk_at, day.timezone)} · {w.amount_ml} ml
              <ActionButton action={deleteWaterAction} fields={{ id: w.id }} className="btn ghost sm icon-only" title="Borrar">
                <Trash2 size={11} />
              </ActionButton>
            </span>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

const WD = ["L", "M", "X", "J", "V", "S", "D"];

export function History({ history, budget, today }: { history: { date: string; kcal: number; logged: boolean }[]; budget: number; today: string }) {
  const logged = history.filter((h) => h.logged && h.date !== today);
  const avg = logged.length ? Math.round(logged.reduce((s, h) => s + h.kcal, 0) / logged.length) : null;
  return (
    <Panel title="Últimos 14 días">
      <div className="row" style={{ marginBottom: 8 }}>
        <Label>Promedio</Label>
        <span className="num sm">{fmt(avg)}</span>
        <span className="tiny muted">kcal · presupuesto {fmt(budget)}</span>
      </div>
      <Bars
        values={history.map((h) => (h.logged ? h.kcal : null))}
        max={Math.max(budget * 1.3, ...history.map((h) => h.kcal))}
        labels={history.map((h) => WD[(new Date(`${h.date}T12:00:00Z`).getUTCDay() + 6) % 7]!)}
        highlight={history.length - 1}
      />
    </Panel>
  );
}
