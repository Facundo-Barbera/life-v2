"use client";
import type { PulsoSettings } from "@life/db";
import { ActionForm, Submit } from "@/components/client";
import { invite, saveSettings } from "./actions";

export function SettingsForm({ s }: { s: PulsoSettings }) {
  return (
    <ActionForm action={saveSettings} resetOnSuccess={false}>
      <div className="form-row">
        <label className="field">
          <span>Zona horaria</span>
          <input className="input" name="timezone" defaultValue={s.timezone} />
        </label>
        <label className="field">
          <span>Unidad de peso</span>
          <select className="select" name="weight_unit" defaultValue={s.weight_unit}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </label>
        <label className="field">
          <span>Estatura (cm)</span>
          <input className="input num-input" name="height_cm" inputMode="decimal" defaultValue={s.height_cm ?? ""} />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Sexo</span>
          <select className="select" name="sex" defaultValue={s.sex ?? ""}>
            <option value="">—</option>
            <option value="male">Hombre</option>
            <option value="female">Mujer</option>
          </select>
        </label>
        <label className="field">
          <span>Nacimiento</span>
          <input className="input" type="date" name="birth_date" defaultValue={s.birth_date ?? ""} />
        </label>
        <label className="field">
          <span>Actividad</span>
          <select className="select" name="activity_level" defaultValue={s.activity_level ?? ""}>
            <option value="">—</option>
            <option value="sedentario">Sedentaria</option>
            <option value="ligero">Ligera</option>
            <option value="moderado">Moderada</option>
            <option value="activo">Activa</option>
            <option value="muy_activo">Muy activa</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Meta de sueño (h)</span>
          <input className="input num-input" name="sleep_target_h" inputMode="decimal" defaultValue={s.sleep_target_min ? s.sleep_target_min / 60 : ""} />
        </label>
        <label className="field">
          <span>Descanso entre series (s)</span>
          <input className="input num-input" name="rest_seconds" inputMode="numeric" defaultValue={s.rest_seconds} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="substances_in_timeline" defaultChecked={s.substances_in_timeline} />
        <span>Mostrar sustancias en el calendario de Life <span className="muted small">(apagado: solo las ves aquí)</span></span>
      </label>
      <div>
        <Submit>Guardar</Submit>
      </div>
    </ActionForm>
  );
}

export function InviteForm() {
  return (
    <ActionForm action={invite}>
      <div className="form-row">
        <label className="field">
          <span>Correo</span>
          <input className="input" type="email" name="email" required placeholder="amiga@correo.com" />
        </label>
        <label className="field">
          <span>Nota</span>
          <input className="input" name="note" placeholder="Opcional" />
        </label>
      </div>
      <div>
        <Submit pendingLabel="Invitando…">Invitar</Submit>
      </div>
    </ActionForm>
  );
}
