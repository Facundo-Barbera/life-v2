"use client";
import { Pencil, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import type { Substance, SubstanceUse } from "@life/db/pulso";
import { ActionForm, Sheet, Submit } from "@/components/client";
import { saveSubstance, saveUse, setGoal } from "./actions";

const AMOUNTS = [
  ["poco", "Poco"],
  ["normal", "Normal"],
  ["mucho", "Mucho"],
] as const;
const CONTEXTS = [
  ["social", "Social"],
  ["solo", "Solo"],
  ["dormir", "Para dormir"],
  ["estres", "Estrés"],
  ["otro", "Otro"],
] as const;

function UseForm({ substances, use, defaultId, today, now, close }: { substances: Substance[]; use?: SubstanceUse; defaultId?: string; today: string; now: string; close: () => void }) {
  const active = substances.filter((s) => !s.archived || s.id === use?.substanceId);
  const [sid, setSid] = useState(use?.substanceId ?? defaultId ?? active[0]?.id ?? "");
  const sub = active.find((s) => s.id === sid);
  const [form, setForm] = useState(use?.form ?? sub?.forms[0] ?? "");
  return (
    <ActionForm action={saveUse} onDone={close}>
      {use ? <input type="hidden" name="id" value={use.id} /> : null}
      <div className="form-row">
        <label className="field">
          <span>Sustancia</span>
          <select
            className="select"
            name="substanceId"
            value={sid}
            onChange={(e) => {
              setSid(e.target.value);
              setForm(active.find((s) => s.id === e.target.value)?.forms[0] ?? "");
            }}
          >
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fecha</span>
          <input className="input" type="date" name="date" defaultValue={use?.date ?? today} max={today} />
        </label>
        <label className="field">
          <span>Hora</span>
          <input className="input" type="time" name="time" defaultValue={use?.time ?? now} />
        </label>
      </div>
      {sub?.forms.length ? (
        <label className="field">
          <span>Forma</span>
          <select className="select" name="form" value={form} onChange={(e) => setForm(e.target.value)}>
            {sub.forms.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="field">
        <span>Cantidad</span>
        <div className="seg">
          {AMOUNTS.map(([k, label]) => (
            <label key={k}>
              <input type="radio" name="amount" value={k} defaultChecked={(use?.amount ?? "normal") === k} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label className="field">
          <span>{sub ? `Cuántos (${sub.unit})` : "Cuántos"}</span>
          <input className="input num-input" name="quantity" inputMode="decimal" defaultValue={use?.quantity ?? ""} placeholder="Opcional" />
        </label>
        {sub?.slug === "cannabis" && form === "comestible" ? (
          <label className="field">
            <span>THC (mg)</span>
            <input className="input num-input" name="thcMg" inputMode="decimal" defaultValue={use?.thcMg ?? ""} />
          </label>
        ) : null}
        <label className="field">
          <span>Contexto</span>
          <select className="select" name="context" defaultValue={use?.context ?? ""}>
            <option value="">—</option>
            {CONTEXTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Nota</span>
        <input className="input" name="note" maxLength={500} defaultValue={use?.note ?? ""} placeholder="Opcional" />
      </label>
      <div>
        <Submit>{use ? "Guardar" : "Anotar"}</Submit>
      </div>
    </ActionForm>
  );
}

export function LogUse(props: { substances: Substance[]; defaultId?: string; today: string; now: string }) {
  return (
    <Sheet
      title="Anotar"
      triggerClassName="btn accent sm"
      trigger={
        <>
          <Plus size={14} /> Anotar
        </>
      }
    >
      {(close) => <UseForm {...props} close={close} />}
    </Sheet>
  );
}

export function EditUse(props: { substances: Substance[]; use: SubstanceUse; today: string; now: string }) {
  return (
    <Sheet title="Editar registro" triggerClassName="btn ghost sm icon-only" trigger={<Pencil size={13} aria-label="Editar" />}>
      {(close) => <UseForm {...props} close={close} />}
    </Sheet>
  );
}

function GoalSelect({ value }: { value: number | null }) {
  return (
    <select className="select" name="maxDaysPerWeek" defaultValue={value === null ? "" : String(value)}>
      <option value="">Sin meta</option>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
        <option key={n} value={n}>
          Máximo {n} {n === 1 ? "día" : "días"} por semana
        </option>
      ))}
    </select>
  );
}

export function GoalForm({ substance }: { substance: Substance }) {
  return (
    <ActionForm action={setGoal} resetOnSuccess={false} className="row wrap">
      <input type="hidden" name="id" value={substance.id} />
      <GoalSelect value={substance.maxDaysPerWeek} />
      <Submit className="btn sm">Guardar meta</Submit>
    </ActionForm>
  );
}

export function SubstanceForm({ substance, close }: { substance?: Substance; close?: () => void }) {
  return (
    <ActionForm action={saveSubstance} onDone={close}>
      {substance ? <input type="hidden" name="id" value={substance.id} /> : null}
      <div className="form-row">
        <label className="field">
          <span>Nombre</span>
          <input className="input" name="name" required maxLength={40} defaultValue={substance?.name} placeholder="Tabaco" />
        </label>
        <label className="field">
          <span>Se cuenta en</span>
          <input className="input" name="unit" maxLength={20} defaultValue={substance?.unit ?? "veces"} />
        </label>
      </div>
      <label className="field">
        <span>Formas (separadas por coma)</span>
        <input className="input" name="forms" defaultValue={substance?.forms.join(", ") ?? ""} placeholder="fumado, vapeado" />
      </label>
      <label className="field">
        <span>Meta</span>
        <GoalSelect value={substance?.maxDaysPerWeek ?? null} />
      </label>
      <div>
        <Submit>{substance ? "Guardar" : "Añadir"}</Submit>
      </div>
    </ActionForm>
  );
}

export function EditSubstance({ substance }: { substance: Substance }) {
  return (
    <Sheet title={substance.name} triggerClassName="btn ghost sm icon-only" trigger={<Settings2 size={14} aria-label="Ajustar" />}>
      {(close) => <SubstanceForm substance={substance} close={close} />}
    </Sheet>
  );
}

export function AddSubstance() {
  return (
    <Sheet
      title="Nueva sustancia"
      triggerClassName="btn sm"
      trigger={
        <>
          <Plus size={14} /> Añadir
        </>
      }
    >
      {(close) => <SubstanceForm close={close} />}
    </Sheet>
  );
}
