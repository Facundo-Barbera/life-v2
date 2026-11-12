"use client";
import { Pencil, Plus } from "lucide-react";
import { ActionForm, Sheet, Submit } from "@/components/client";
import { saveManualNight, saveSleepTarget } from "./actions";

type Night = { id: string; night: string; asleep: string; wake: string; note: string | null };

function NightForm({ night, today, close }: { night?: Night; today: string; close: () => void }) {
  return (
    <ActionForm action={saveManualNight} onDone={close}>
      {night ? <input type="hidden" name="id" value={night.id} /> : null}
      <div className="form-row">
        <label className="field">
          <span>Desperté el</span>
          <input className="input" type="date" name="wakeDate" required max={today} defaultValue={night?.night ?? today} />
        </label>
        <label className="field">
          <span>Me dormí</span>
          <input className="input" type="time" name="asleep" required defaultValue={night?.asleep ?? "23:30"} />
        </label>
        <label className="field">
          <span>Desperté</span>
          <input className="input" type="time" name="wake" required defaultValue={night?.wake ?? "07:00"} />
        </label>
      </div>
      <label className="field">
        <span>Nota</span>
        <input className="input" name="note" maxLength={280} defaultValue={night?.note ?? ""} placeholder="Opcional" />
      </label>
      <p className="tiny dim">Si Salud mide esa noche, cuenta la de Salud.</p>
      <div>
        <Submit>{night ? "Guardar" : "Anotar"}</Submit>
      </div>
    </ActionForm>
  );
}

export function AddNight({ today }: { today: string }) {
  return (
    <Sheet
      title="Anotar una noche"
      triggerClassName="btn sm"
      trigger={
        <>
          <Plus size={14} /> Anotar noche
        </>
      }
    >
      {(close) => <NightForm today={today} close={close} />}
    </Sheet>
  );
}

export function EditNight({ night, today }: { night: Night; today: string }) {
  return (
    <Sheet title="Editar noche" triggerClassName="btn ghost sm icon-only" trigger={<Pencil size={13} aria-label="Editar" />}>
      {(close) => <NightForm night={night} today={today} close={close} />}
    </Sheet>
  );
}

export function TargetForm({ hours }: { hours: number | null }) {
  return (
    <ActionForm action={saveSleepTarget} resetOnSuccess={false} className="row wrap">
      <input className="input num-input" style={{ width: 80 }} name="hours" inputMode="decimal" defaultValue={hours ?? ""} placeholder="8" aria-label="Horas" />
      <span className="muted small">horas</span>
      <Submit className="btn sm">Guardar</Submit>
    </ActionForm>
  );
}
