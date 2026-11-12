"use client";
import { ActionForm, Submit } from "@/components/client";
import { addItemAction, buildAction } from "./actions";

export function BuildForm({ from, days }: { from: string; days: number }) {
  return (
    <ActionForm action={buildAction} className="row wrap" resetOnSuccess={false}>
      <label className="field">
        <span>Desde</span>
        <input className="input" type="date" name="from" defaultValue={from} required />
      </label>
      <label className="field">
        <span>Días</span>
        <select className="select" name="days" defaultValue={String(days)}>
          {[3, 5, 7, 10, 14].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div style={{ alignSelf: "end" }}>
        <Submit pendingLabel="Armando…">Armar con el plan</Submit>
      </div>
    </ActionForm>
  );
}

export function AddItemForm({ categories }: { categories: { key: string; label: string }[] }) {
  return (
    <ActionForm action={addItemAction} className="row wrap">
      <input className="input grow" name="name" placeholder="Papel de cocina, café…" required style={{ minWidth: 160 }} />
      <input className="input" name="amount" placeholder="Cantidad" style={{ width: 120 }} />
      <select className="select" name="category" defaultValue="" style={{ width: 170 }}>
        <option value="">Pasillo automático</option>
        {categories.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <Submit className="btn">Agregar</Submit>
    </ActionForm>
  );
}
