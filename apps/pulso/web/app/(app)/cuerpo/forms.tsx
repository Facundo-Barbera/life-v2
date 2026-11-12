"use client";
import { Pencil, Plus, ScanLine, Upload } from "lucide-react";
import { useState } from "react";
import type { GoalMode, TimeOfDay, WeightUnit } from "@life/db";
import { ActionForm, Sheet, Submit } from "@/components/client";
import { addWeighInAction, editWeighInAction, importAction, saveGoalAction, saveScanAction, setTargetAction } from "./actions";

const TOD: { value: TimeOfDay | ""; label: string }[] = [
  { value: "", label: "Por la hora" },
  { value: "morning", label: "Mañana" },
  { value: "evening", label: "Noche" },
  { value: "unknown", label: "Otro" },
];

function WhenFields({ date, time }: { date?: string; time?: string }) {
  return (
    <div className="form-row">
      <label className="field">
        <span>Día</span>
        <input className="input" type="date" name="date" defaultValue={date} />
      </label>
      <label className="field">
        <span>Hora</span>
        <input className="input" type="time" name="time" defaultValue={time} />
      </label>
    </div>
  );
}

/** Quick weigh-in: weight, and morning/evening from the hour unless chosen. */
export function WeighInSheet({ unit, label = "Pesaje", accent = true }: { unit: WeightUnit; label?: string; accent?: boolean }) {
  return (
    <Sheet title="Nuevo pesaje" trigger={<><Plus size={15} /> {label}</>} triggerClassName={accent ? "btn accent sm" : "btn sm"}>
      {(close) => (
        <ActionForm action={addWeighInAction} onDone={close}>
          <label className="field">
            <span>Peso ({unit})</span>
            <input className="input num-input" name="weight" inputMode="decimal" required autoFocus placeholder={unit === "kg" ? "80.4" : "177.2"} style={{ fontSize: 22 }} />
          </label>
          <label className="field">
            <span>Momento</span>
            <select className="select" name="time_of_day" defaultValue="">
              {TOD.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <WhenFields />
          <p className="tiny muted">Sin día ni hora, es ahora. Antes de las 14:00 cuenta como de mañana; desde las 17:00, de noche.</p>
          <Submit>Guardar pesaje</Submit>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function EditWeighInSheet({ id, weight, unit, date, time, timeOfDay }: { id: string; weight: number; unit: WeightUnit; date: string; time: string; timeOfDay: TimeOfDay }) {
  return (
    <Sheet title="Editar pesaje" trigger={<Pencil size={13} />} triggerClassName="btn ghost sm icon-only">
      {(close) => (
        <ActionForm action={editWeighInAction} onDone={close}>
          <input type="hidden" name="id" value={id} />
          <label className="field">
            <span>Peso ({unit})</span>
            <input className="input num-input" name="weight" inputMode="decimal" defaultValue={weight} required />
          </label>
          <label className="field">
            <span>Momento</span>
            <select className="select" name="time_of_day" defaultValue={timeOfDay}>
              {TOD.slice(1).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <WhenFields date={date} time={time} />
          <Submit>Guardar</Submit>
        </ActionForm>
      )}
    </Sheet>
  );
}

/** The weight goal and its pace (or date); saving recomputes the day's budget. */
export function GoalSheet({ unit, goal, mode, reachBy, kcalTarget }: { unit: WeightUnit; goal: number | null; mode: GoalMode | null; reachBy: string | null; kcalTarget: number | null }) {
  const [by, setBy] = useState<"ritmo" | "fecha">(reachBy ? "fecha" : "ritmo");
  return (
    <Sheet title="Tu meta" trigger={<><Pencil size={13} /> Meta</>} triggerClassName="btn sm">
      {(close) => (
        <ActionForm action={saveGoalAction} onDone={close} resetOnSuccess={false}>
          <label className="field">
            <span>Peso meta ({unit})</span>
            <input className="input num-input" name="goal_weight" inputMode="decimal" defaultValue={goal ?? ""} placeholder="Vacío: mantener" />
          </label>
          <div className="seg" role="group" aria-label="Cómo llegar">
            <button type="button" aria-pressed={by === "ritmo"} onClick={() => setBy("ritmo")}>A un ritmo</button>
            <button type="button" aria-pressed={by === "fecha"} onClick={() => setBy("fecha")}>Para una fecha</button>
          </div>
          <input type="hidden" name="pace_by" value={by} />
          {by === "ritmo" ? (
            <label className="field">
              <span>Ritmo</span>
              <select className="select" name="mode" defaultValue={mode ?? "constante"}>
                <option value="suave">Suave · ~0.25 % del peso por semana</option>
                <option value="constante">Constante · ~0.5 % por semana</option>
                <option value="rapido">Rápido · ~0.75 % por semana</option>
              </select>
            </label>
          ) : (
            <>
              <input type="hidden" name="mode" value={mode ?? "constante"} />
              <label className="field">
                <span>Llegar el</span>
                <input className="input" type="date" name="reach_by" defaultValue={reachBy ?? ""} required />
              </label>
              <p className="tiny muted">Si la fecha pide más que el ritmo rápido, el presupuesto se queda en el rápido.</p>
            </>
          )}
          <label className="field">
            <span>Presupuesto a mano (kcal, opcional)</span>
            <input className="input num-input" name="kcal_target" inputMode="numeric" defaultValue={kcalTarget ?? ""} placeholder="Vacío: lo decide la meta" />
          </label>
          <Submit>Guardar meta</Submit>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function TargetSheet({ metric, label, unit, target }: { metric: string; label: string; unit: string; target: number | null }) {
  return (
    <Sheet title={`Objetivo · ${label}`} trigger={target != null ? `Obj. ${target} ${unit}` : "Objetivo"} triggerClassName="chip">
      {(close) => (
        <ActionForm action={setTargetAction} onDone={close} resetOnSuccess={false}>
          <input type="hidden" name="metric" value={metric} />
          <label className="field">
            <span>{label} ({unit})</span>
            <input className="input num-input" name="target" inputMode="decimal" defaultValue={target ?? ""} placeholder="Vacío: sin objetivo" />
          </label>
          <Submit>Guardar</Submit>
        </ActionForm>
      )}
    </Sheet>
  );
}

const MAIN: [string, string, string][] = [
  ["weight", "Peso", "kg"],
  ["skeletalMuscleMass", "Músculo esquelético", "kg"],
  ["bodyFatMass", "Masa grasa", "kg"],
  ["percentBodyFat", "Grasa", "%"],
  ["bmi", "IMC", ""],
  ["visceralFatLevel", "Grasa visceral", "nivel"],
  ["bmr", "Metabolismo basal", "kcal"],
  ["totalBodyWater", "Agua total", "L"],
];
const MORE: [string, string, string][] = [
  ["inbodyScore", "Puntaje InBody", ""],
  ["softLeanMass", "Masa magra blanda", "kg"],
  ["protein", "Proteína", "kg"],
  ["mineral", "Minerales", "kg"],
  ["ecwRatio", "Ratio AEC/ACT", ""],
  ["smi", "SMI", "kg/m²"],
  ["waistHipRatio", "Cintura/cadera", ""],
  ["visceralFatArea", "Área grasa visceral", "cm²"],
  ["phaseAngle", "Ángulo de fase", "°"],
];
const SEGS: [string, string][] = [["rightArm", "Brazo der."], ["leftArm", "Brazo izq."], ["trunk", "Tronco"], ["rightLeg", "Pierna der."], ["leftLeg", "Pierna izq."]];

function NumField({ name, label, unit }: { name: string; label: string; unit: string }) {
  return (
    <label className="field">
      <span>{label}{unit ? ` (${unit})` : ""}</span>
      <input className="input num-input" name={name} inputMode="decimal" />
    </label>
  );
}

/** A scan by hand: the sheet's main values, optionally the rest and the segments. */
export function ScanSheet() {
  return (
    <Sheet title="Medición de composición" trigger={<><ScanLine size={15} /> Escaneo</>} triggerClassName="btn sm">
      {(close) => (
        <ActionForm action={saveScanAction} onDone={close}>
          <div className="form-row">
            <label className="field">
              <span>Fuente</span>
              <select className="select" name="source" defaultValue="inbody">
                <option value="inbody">InBody</option>
                <option value="manual">Otra báscula / a mano</option>
              </select>
            </label>
            <label className="field">
              <span>Equipo</span>
              <input className="input" name="device" placeholder="270, 570…" />
            </label>
          </div>
          <WhenFields />
          <div className="form-row">{MAIN.map(([k, l, u]) => <NumField key={k} name={k} label={l} unit={u} />)}</div>
          <details>
            <summary className="label" style={{ cursor: "pointer" }}>Más valores</summary>
            <div className="form-row" style={{ marginTop: 8 }}>{MORE.map(([k, l, u]) => <NumField key={k} name={k} label={l} unit={u} />)}</div>
          </details>
          <details>
            <summary className="label" style={{ cursor: "pointer" }}>Por segmento (kg)</summary>
            <p className="tiny muted" style={{ margin: "6px 0" }}>Llena los cinco de una fila o ninguno.</p>
            <div className="label" style={{ marginTop: 6 }}>Masa magra</div>
            <div className="form-row">{SEGS.map(([k, l]) => <NumField key={k} name={`lean_${k}`} label={l} unit="" />)}</div>
            <div className="label" style={{ marginTop: 6 }}>Masa grasa</div>
            <div className="form-row">{SEGS.map(([k, l]) => <NumField key={k} name={`fat_${k}`} label={l} unit="" />)}</div>
          </details>
          <Submit>Guardar medición</Submit>
        </ActionForm>
      )}
    </Sheet>
  );
}

/** Import: the InBody QR's text (from any QR reader) or the LookinBody CSV export. */
export function ImportForm() {
  return (
    <ActionForm action={importAction}>
      <label className="field">
        <span>Texto del QR o CSV pegado</span>
        <textarea className="textarea" name="text" placeholder="https://qrcode.inbody.com?IBData=…" />
      </label>
      <label className="field">
        <span>O un archivo CSV de InBody / LookinBody</span>
        <input className="input" type="file" name="file" accept=".csv,text/csv,text/plain" />
      </label>
      <div>
        <Submit pendingLabel="Importando…"><Upload size={15} /> Importar</Submit>
      </div>
    </ActionForm>
  );
}
