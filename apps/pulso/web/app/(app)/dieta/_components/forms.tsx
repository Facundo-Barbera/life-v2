"use client";
import { Plus, ScanBarcode, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { DietPlan, DietPlanDay, FoodItem, Meal, MealSlot, PlanSlot, PulsoSettings, Recipe, SavedDish } from "@life/db";
import { ActionForm, Submit } from "@/components/client";
import {
  editSlotAction,
  lookupProductAction,
  saveDishAction,
  saveMealAction,
  savePlanAction,
  saveRecipeAction,
  saveTargetsAction,
} from "../actions";

const SLOTS: [MealSlot, string][] = [
  ["desayuno", "Desayuno"],
  ["comida", "Comida"],
  ["cena", "Cena"],
  ["snack", "Snack"],
];

const r1 = (n: number) => Math.round(n * 10) / 10;

function SlotSelect({ value, name = "slot" }: { value?: MealSlot | null; name?: string }) {
  return (
    <select className="select" name={name} defaultValue={value ?? ""}>
      <option value="">Según la hora</option>
      {SLOTS.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
}

type MacroFields = { kcal: string; protein: string; carbs: string; fat: string; fiber: string };

/**
 * Add or edit a meal: name, portion, macros, slot and time. A barcode looks the
 * product up on Open Food Facts and fills the macros for the portion typed.
 */
export function MealForm({ date, meal, onDone, defaultSlot, tz }: { date: string; meal?: Meal; onDone?: () => void; defaultSlot?: MealSlot | null; tz?: string }) {
  const [name, setName] = useState(meal?.name ?? "");
  const [quantity, setQuantity] = useState(meal?.quantity != null ? String(meal.quantity) : "");
  const [unit, setUnit] = useState(meal?.unit ?? "g");
  const [m, setM] = useState<MacroFields>({
    kcal: meal ? String(meal.kcal) : "",
    protein: meal ? String(meal.protein_g) : "",
    carbs: meal ? String(meal.carbs_g) : "",
    fat: meal ? String(meal.fat_g) : "",
    fiber: meal ? String(meal.fiber_g) : "",
  });
  const [code, setCode] = useState(meal?.barcode ?? "");
  const [per100, setPer100] = useState<{ kcal: number; protein: number; carbs: number; fat: number; fiber: number } | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const time = meal ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(meal.eaten_at)) : "";

  const fillFrom = (p: NonNullable<typeof per100>, qty: number) =>
    setM({ kcal: String(Math.round((p.kcal * qty) / 100)), protein: String(r1((p.protein * qty) / 100)), carbs: String(r1((p.carbs * qty) / 100)), fat: String(r1((p.fat * qty) / 100)), fiber: String(r1((p.fiber * qty) / 100)) });

  const find = () =>
    start(async () => {
      setLookup(null);
      const res = await lookupProductAction(code);
      if (res.error) return setLookup(res.error);
      if (!res.product) return setLookup("No encontramos ese producto. Captúralo a mano.");
      const p = res.product;
      setName(p.brand ? `${p.name} (${p.brand})` : p.name);
      const qty = p.servingSize ?? 100;
      setQuantity(String(qty));
      setUnit(p.liquid ? "ml" : "g");
      setPer100(p.per100);
      fillFrom(p.per100, qty);
      setLookup(`Por 100 ${p.liquid ? "ml" : "g"}: ${p.per100.kcal} kcal. Ajusta la porción.`);
    });

  const set = (k: keyof MacroFields) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [k]: e.target.value });

  return (
    <ActionForm action={saveMealAction} onDone={onDone}>
      {meal ? <input type="hidden" name="id" value={meal.id} /> : null}
      <input type="hidden" name="date" value={meal?.local_date ?? date} />
      <input type="hidden" name="source" value={per100 ? "codigo" : (meal?.source ?? "manual")} />
      <input type="hidden" name="barcode" value={per100 ? code : (meal?.barcode ?? "")} />
      {!meal ? (
        <div className="row">
          <label className="field grow">
            <span>Código de barras</span>
            <input className="input num-input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="7501…" />
          </label>
          <button type="button" className="btn" style={{ alignSelf: "end" }} disabled={pending || code.trim().length < 8} onClick={find}>
            <ScanBarcode size={15} /> {pending ? "Buscando…" : "Buscar"}
          </button>
        </div>
      ) : null}
      {lookup ? <p className="small muted">{lookup}</p> : null}
      <label className="field">
        <span>Qué comiste</span>
        <input className="input" name="name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus={!meal} />
      </label>
      <div className="form-row">
        <label className="field">
          <span>Cantidad</span>
          <input
            className="input num-input"
            name="quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              const q = Number(e.target.value.replace(",", "."));
              if (per100 && q > 0) fillFrom(per100, q);
            }}
          />
        </label>
        <label className="field">
          <span>Unidad</span>
          <input className="input" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} list="units" />
        </label>
        <label className="field">
          <span>Hora</span>
          <input className="input" type="time" name="time" defaultValue={time} />
        </label>
        <label className="field">
          <span>Momento</span>
          <SlotSelect value={meal?.slot ?? defaultSlot} />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>kcal</span>
          <input className="input num-input" name="kcal" inputMode="decimal" required value={m.kcal} onChange={set("kcal")} />
        </label>
        <label className="field">
          <span>Proteína g</span>
          <input className="input num-input" name="protein" inputMode="decimal" value={m.protein} onChange={set("protein")} />
        </label>
        <label className="field">
          <span>Carbs g</span>
          <input className="input num-input" name="carbs" inputMode="decimal" value={m.carbs} onChange={set("carbs")} />
        </label>
        <label className="field">
          <span>Grasa g</span>
          <input className="input num-input" name="fat" inputMode="decimal" value={m.fat} onChange={set("fat")} />
        </label>
        <label className="field">
          <span>Fibra g</span>
          <input className="input num-input" name="fiber" inputMode="decimal" value={m.fiber} onChange={set("fiber")} />
        </label>
      </div>
      <datalist id="units">
        {["g", "ml", "pieza", "taza", "cda", "porción", "lata", "rebanada"].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="row">
        <Submit>{meal ? "Guardar" : "Registrar"}</Submit>
      </div>
    </ActionForm>
  );
}

// ---------------------------------------------------------------------------
// Items (ingredients / components)
// ---------------------------------------------------------------------------

type Row = { name: string; quantity: string; unit: string; kcal: string; protein: string; carbs: string; fat: string; fiber: string };
const toRow = (i: FoodItem): Row => ({ name: i.name, quantity: String(i.quantity), unit: i.unit, kcal: String(i.kcal), protein: String(i.protein), carbs: String(i.carbs), fat: String(i.fat), fiber: String(i.fiber ?? 0) });
const blank = (): Row => ({ name: "", quantity: "", unit: "g", kcal: "", protein: "", carbs: "", fat: "", fiber: "" });
const n = (s: string) => Number(s.replace(",", ".")) || 0;
const toItem = (r: Row): FoodItem => ({ name: r.name.trim(), quantity: n(r.quantity), unit: r.unit || "g", kcal: n(r.kcal), protein: n(r.protein), carbs: n(r.carbs), fat: n(r.fat), fiber: n(r.fiber) });

/** Editable list of food items; posts them as JSON in a hidden `name` field. */
export function ItemsEditor({ initial, name = "items", label = "Ingredientes" }: { initial?: FoodItem[]; name?: string; label?: string }) {
  const [rows, setRows] = useState<Row[]>(initial?.length ? initial.map(toRow) : [blank()]);
  const items = rows.filter((r) => r.name.trim()).map(toItem);
  const total = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fat }), { kcal: 0, p: 0, c: 0, f: 0 });
  const update = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const cols = "minmax(120px,2fr) 64px 56px 60px 52px 52px 52px 28px";
  return (
    <div className="stack">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="row between">
        <span className="label">{label}</span>
        <span className="tiny muted mono">
          {Math.round(total.kcal)} kcal · P {r1(total.p)} · C {r1(total.c)} · G {r1(total.f)}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gap: 6, minWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6 }} className="tiny dim mono">
            <span>NOMBRE</span>
            <span>CANT.</span>
            <span>UD.</span>
            <span>KCAL</span>
            <span>P</span>
            <span>C</span>
            <span>G</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: cols, gap: 6 }}>
              <input className="input" value={r.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Pechuga de pollo" />
              <input className="input num-input" inputMode="decimal" value={r.quantity} onChange={(e) => update(i, "quantity", e.target.value)} />
              <input className="input" value={r.unit} onChange={(e) => update(i, "unit", e.target.value)} />
              <input className="input num-input" inputMode="decimal" value={r.kcal} onChange={(e) => update(i, "kcal", e.target.value)} />
              <input className="input num-input" inputMode="decimal" value={r.protein} onChange={(e) => update(i, "protein", e.target.value)} />
              <input className="input num-input" inputMode="decimal" value={r.carbs} onChange={(e) => update(i, "carbs", e.target.value)} />
              <input className="input num-input" inputMode="decimal" value={r.fat} onChange={(e) => update(i, "fat", e.target.value)} />
              <button type="button" className="btn ghost sm icon-only" aria-label="Quitar" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blank()])}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <button type="button" className="btn sm" onClick={() => setRows([...rows, blank()])}>
          <Plus size={13} /> Ingrediente
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dishes, recipes, targets
// ---------------------------------------------------------------------------

export function DishForm({ dish, onDone }: { dish?: SavedDish; onDone?: () => void }) {
  return (
    <ActionForm action={saveDishAction} onDone={onDone}>
      {dish ? <input type="hidden" name="id" value={dish.id} /> : null}
      <div className="form-row">
        <label className="field">
          <span>Nombre</span>
          <input className="input" name="name" required defaultValue={dish?.name} placeholder="Avena con plátano" />
        </label>
        <label className="field">
          <span>Momento</span>
          <SlotSelect value={dish?.slot} />
        </label>
      </div>
      <ItemsEditor initial={dish?.components} label="Componentes (una porción)" />
      <div>
        <Submit>Guardar platillo</Submit>
      </div>
    </ActionForm>
  );
}

export function RecipeForm({ recipe, onDone }: { recipe?: Recipe; onDone?: () => void }) {
  return (
    <ActionForm action={saveRecipeAction} onDone={onDone} resetOnSuccess={!recipe}>
      {recipe ? <input type="hidden" name="id" value={recipe.id} /> : null}
      <label className="field">
        <span>Nombre</span>
        <input className="input" name="name" required defaultValue={recipe?.name} placeholder="Pollo al limón" />
      </label>
      <div className="form-row">
        <label className="field">
          <span>Porciones</span>
          <input className="input num-input" name="servings" inputMode="decimal" required defaultValue={recipe?.servings ?? 1} />
        </label>
        <label className="field">
          <span>Minutos</span>
          <input className="input num-input" name="prep_minutes" inputMode="numeric" defaultValue={recipe?.prep_minutes ?? ""} />
        </label>
        <label className="check" style={{ alignSelf: "end", minHeight: 38 }}>
          <input type="checkbox" name="batch" defaultChecked={recipe?.batch} />
          <span>Para varios días</span>
        </label>
      </div>
      <ItemsEditor initial={recipe?.ingredients} label="Ingredientes (receta completa)" />
      <label className="field">
        <span>Pasos</span>
        <textarea className="textarea" name="steps" defaultValue={recipe?.steps ?? ""} rows={5} />
      </label>
      <label className="field">
        <span>Notas</span>
        <input className="input" name="notes" defaultValue={recipe?.notes ?? ""} />
      </label>
      <div>
        <Submit>Guardar receta</Submit>
      </div>
    </ActionForm>
  );
}

export function TargetsForm({ s, computedKcal, onDone }: { s: PulsoSettings; computedKcal: number; onDone?: () => void }) {
  const [mode, setMode] = useState<"meta" | "manual">(s.kcal_target ? "manual" : "meta");
  return (
    <ActionForm action={saveTargetsAction} onDone={onDone} resetOnSuccess={false}>
      <input type="hidden" name="mode" value={mode} />
      <div className="seg" role="group">
        <button type="button" aria-pressed={mode === "meta"} onClick={() => setMode("meta")}>
          Usar la meta
        </button>
        <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}>
          A mano
        </button>
      </div>
      <p className="small muted">{mode === "meta" ? `Tu meta de peso decide el presupuesto: hoy ${computedKcal.toLocaleString("es-MX")} kcal. Cámbiala en Cuerpo.` : "Un número fijo que gana sobre la meta."}</p>
      <div className="form-row">
        {mode === "manual" ? (
          <label className="field">
            <span>kcal</span>
            <input className="input num-input" name="kcal" inputMode="numeric" defaultValue={s.kcal_target ?? computedKcal} required />
          </label>
        ) : null}
        <label className="field">
          <span>Proteína g</span>
          <input className="input num-input" name="protein" inputMode="decimal" defaultValue={s.protein_g_target ?? ""} placeholder="auto" />
        </label>
        <label className="field">
          <span>Carbs g</span>
          <input className="input num-input" name="carbs" inputMode="decimal" defaultValue={s.carbs_g_target ?? ""} placeholder="auto" />
        </label>
        <label className="field">
          <span>Grasa g</span>
          <input className="input num-input" name="fat" inputMode="decimal" defaultValue={s.fat_g_target ?? ""} placeholder="auto" />
        </label>
        <label className="field">
          <span>Fibra g</span>
          <input className="input num-input" name="fiber" inputMode="decimal" defaultValue={s.fiber_g_target ?? ""} placeholder="auto" />
        </label>
      </div>
      <span className="label">Agua</span>
      <div className="form-row">
        <label className="field">
          <span>Meta ml</span>
          <input className="input num-input" name="water_goal_ml" inputMode="numeric" defaultValue={s.water_goal_ml ?? ""} placeholder="2500" />
        </label>
        <label className="field">
          <span>Vaso ml</span>
          <input className="input num-input" name="glass_ml" inputMode="numeric" defaultValue={s.water_glass_ml} />
        </label>
        <label className="field">
          <span>Botella ml</span>
          <input className="input num-input" name="bottle_ml" inputMode="numeric" defaultValue={s.water_bottle_ml} />
        </label>
      </div>
      <span className="label">Horas de comida (ritmo del día)</span>
      <div className="form-row">
        <label className="field">
          <span>Desayuno</span>
          <input className="input" type="time" name="t_desayuno" defaultValue={s.meal_times.desayuno ?? "08:30"} />
        </label>
        <label className="field">
          <span>Comida</span>
          <input className="input" type="time" name="t_comida" defaultValue={s.meal_times.comida ?? "14:30"} />
        </label>
        <label className="field">
          <span>Cena</span>
          <input className="input" type="time" name="t_cena" defaultValue={s.meal_times.cena ?? "20:30"} />
        </label>
      </div>
      <div>
        <Submit>Guardar</Submit>
      </div>
    </ActionForm>
  );
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function SlotForm({ slot, recipes, onDone }: { slot: PlanSlot; recipes: Recipe[]; onDone?: () => void }) {
  return (
    <ActionForm action={editSlotAction} onDone={onDone} resetOnSuccess={false}>
      <input type="hidden" name="id" value={slot.id} />
      <div className="form-row">
        <label className="field">
          <span>Nombre</span>
          <input className="input" name="name" defaultValue={slot.name ?? ""} />
        </label>
        <label className="field">
          <span>Momento</span>
          <select className="select" name="slot" defaultValue={slot.slot}>
            {SLOTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Hora</span>
          <input className="input" type="time" name="time" defaultValue={slot.time?.slice(0, 5) ?? ""} />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Receta</span>
          <select className="select" name="recipe_id" defaultValue={slot.recipe_id ?? ""}>
            <option value="">—</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Porciones</span>
          <input className="input num-input" name="portions" inputMode="decimal" defaultValue={slot.portions ?? ""} />
        </label>
      </div>
      <ItemsEditor initial={slot.items} label="Ingredientes (vacío = los de la receta)" />
      <label className="field">
        <span>Nota</span>
        <input className="input" name="note" defaultValue={slot.note ?? ""} />
      </label>
      <div>
        <Submit>Guardar</Submit>
      </div>
    </ActionForm>
  );
}

type EditMeal = { slot: MealSlot; time: string; name: string; recipeId: string; portions: string; kcal: string; protein: string };
type EditDay = { label: string; meals: EditMeal[] };

const fromPlanDay = (d: DietPlanDay): EditDay => ({
  label: d.label,
  meals: d.meals.map((m) => {
    const t = m.items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.protein }), { kcal: 0, p: 0 });
    return { slot: m.slot, time: m.time ?? "", name: m.name, recipeId: m.recipeId ?? "", portions: m.portions ? String(m.portions) : "", kcal: m.items.length && !m.recipeId ? String(Math.round(t.kcal)) : "", protein: m.items.length && !m.recipeId ? String(r1(t.p)) : "" };
  }),
});

const emptyDay = (i: number): EditDay => ({
  label: `Día ${i + 1}`,
  meals: [
    { slot: "desayuno", time: "", name: "", recipeId: "", portions: "1", kcal: "", protein: "" },
    { slot: "comida", time: "", name: "", recipeId: "", portions: "1", kcal: "", protein: "" },
    { slot: "cena", time: "", name: "", recipeId: "", portions: "1", kcal: "", protein: "" },
  ],
});

/**
 * A plan is rotation days: each day's meals by moment, from a recipe (and its
 * portions) or a quick name + kcal. Saving can activate it, which fills the
 * coming days with dated meals.
 */
export function PlanForm({ plan, recipes, today, onDone }: { plan?: DietPlan; recipes: Recipe[]; today: string; onDone?: () => void }) {
  const [days, setDays] = useState<EditDay[]>(plan?.days.length ? plan.days.map(fromPlanDay) : [emptyDay(0)]);
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const json = JSON.stringify(
    days.map<DietPlanDay>((d) => ({
      label: d.label || "Día",
      meals: d.meals
        .filter((m) => m.name.trim() || m.recipeId)
        .map((m) => {
          const recipe = m.recipeId ? byId.get(m.recipeId) : undefined;
          const kcal = n(m.kcal);
          return {
            slot: m.slot,
            time: m.time || null,
            name: m.name.trim() || recipe?.name || "Comida",
            recipeId: recipe ? recipe.id : null,
            portions: recipe ? n(m.portions) || 1 : null,
            items: recipe || !kcal ? [] : [{ name: m.name.trim() || "Comida", quantity: 1, unit: "porción", kcal, protein: n(m.protein), carbs: 0, fat: 0 }],
          };
        }),
    })),
  );

  const setMeal = (di: number, mi: number, patch: Partial<EditMeal>) => setDays(days.map((d, i) => (i === di ? { ...d, meals: d.meals.map((m, j) => (j === mi ? { ...m, ...patch } : m)) } : d)));

  return (
    <ActionForm action={savePlanAction} onDone={onDone} resetOnSuccess={!plan}>
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <input type="hidden" name="days" value={json} />
      <div className="form-row">
        <label className="field">
          <span>Nombre</span>
          <input className="input" name="name" required defaultValue={plan?.name ?? ""} placeholder="Definición noviembre" />
        </label>
        <label className="field">
          <span>Empieza</span>
          <input className="input" type="date" name="starts_on" required defaultValue={plan?.starts_on ?? today} />
        </label>
        <label className="field">
          <span>Llenar días</span>
          <input className="input num-input" name="horizon" inputMode="numeric" defaultValue={14} />
        </label>
      </div>
      {days.map((d, di) => (
        <div key={di} className="inner stack">
          <div className="row">
            <input className="input" style={{ maxWidth: 200 }} value={d.label} onChange={(e) => setDays(days.map((x, i) => (i === di ? { ...x, label: e.target.value } : x)))} />
            <span className="grow" />
            <button type="button" className="btn ghost sm" disabled={days.length === 1} onClick={() => setDays(days.filter((_, i) => i !== di))}>
              Quitar día
            </button>
          </div>
          {d.meals.map((m, mi) => (
            <div key={mi} style={{ display: "grid", gridTemplateColumns: "100px 84px minmax(120px,1fr) minmax(120px,1fr) 60px 64px 28px", gap: 6, overflowX: "auto" }}>
              <select className="select" value={m.slot} onChange={(e) => setMeal(di, mi, { slot: e.target.value as MealSlot })}>
                {SLOTS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <input className="input" type="time" value={m.time} onChange={(e) => setMeal(di, mi, { time: e.target.value })} />
              <select className="select" value={m.recipeId} onChange={(e) => setMeal(di, mi, { recipeId: e.target.value })}>
                <option value="">Sin receta</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input className="input" placeholder={m.recipeId ? "Nombre (opcional)" : "Qué comer"} value={m.name} onChange={(e) => setMeal(di, mi, { name: e.target.value })} />
              {m.recipeId ? (
                <input className="input num-input" title="Porciones" placeholder="porc." value={m.portions} onChange={(e) => setMeal(di, mi, { portions: e.target.value })} />
              ) : (
                <input className="input num-input" title="kcal" placeholder="kcal" value={m.kcal} onChange={(e) => setMeal(di, mi, { kcal: e.target.value })} />
              )}
              {m.recipeId ? <span /> : <input className="input num-input" title="Proteína g" placeholder="P g" value={m.protein} onChange={(e) => setMeal(di, mi, { protein: e.target.value })} />}
              <button type="button" className="btn ghost sm icon-only" aria-label="Quitar" onClick={() => setDays(days.map((x, i) => (i === di ? { ...x, meals: x.meals.filter((_, j) => j !== mi) } : x)))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="btn sm" onClick={() => setDays(days.map((x, i) => (i === di ? { ...x, meals: [...x.meals, { slot: "snack", time: "", name: "", recipeId: "", portions: "1", kcal: "", protein: "" }] } : x)))}>
              <Plus size={13} /> Comida
            </button>
          </div>
        </div>
      ))}
      <div className="row wrap">
        <button type="button" className="btn sm" onClick={() => setDays([...days, emptyDay(days.length)])}>
          <Plus size={13} /> Día de rotación
        </button>
        <span className="grow" />
        <label className="check">
          <input type="checkbox" name="activate" defaultChecked={!plan || plan.active} />
          <span>Activar y llenar los próximos días</span>
        </label>
      </div>
      <p className="tiny muted">Los días se repiten en orden desde la fecha de inicio. Con receta, las calorías salen de sus ingredientes.</p>
      <div>
        <Submit>Guardar plan</Submit>
      </div>
    </ActionForm>
  );
}
