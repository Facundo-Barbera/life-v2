"use client";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { FullSchedule, Med } from "@life/db/pulso";
import { ActionForm, Sheet, Submit } from "@/components/client";
import { saveMedication } from "./actions";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const PARTS = [
  { key: "manana", label: "Mañana", start: "07:00", end: "12:00" },
  { key: "tarde", label: "Tarde", start: "12:00", end: "19:00" },
  { key: "noche", label: "Noche", start: "19:00", end: "23:00" },
] as const;
const MEALS = [
  { key: "desayuno", label: "Desayuno" },
  { key: "comida", label: "Comida" },
  { key: "cena", label: "Cena" },
] as const;

type Freq = "diario" | "semana" | "intervalo" | "mes";

function freqOf(s: FullSchedule | undefined): Freq {
  if (!s) return "diario";
  if (s.monthDay) return "mes";
  if (s.interval) return "intervalo";
  if (s.days.length) return "semana";
  return "diario";
}

/** The full editor: what it is, the dose, and when (frequency × timing), stock and dates. */
function Editor({ med, kind, today, close }: { med?: Med; kind: "medicamento" | "suplemento"; today: string; close: () => void }) {
  const s = med?.schedule;
  const [mode, setMode] = useState<"horario" | "demanda">(s?.asNeeded ? "demanda" : "horario");
  const [freq, setFreq] = useState<Freq>(freqOf(s));
  const [anyTime, setAnyTime] = useState(s?.anyTime ?? false);
  const [training, setTraining] = useState(!!s?.training);
  const [restNone, setRestNone] = useState(s?.training ? s.training.restDayTime === null : false);
  const [windows, setWindows] = useState<Set<string>>(new Set(s?.windows.map((w) => w.part) ?? []));

  return (
    <ActionForm action={saveMedication} onDone={close}>
      {med ? <input type="hidden" name="id" value={med.id} /> : null}
      <div className="form-row">
        <label className="field" style={{ gridColumn: "span 2" }}>
          <span>Nombre</span>
          <input className="input" name="name" required maxLength={80} defaultValue={med?.name} placeholder={kind === "suplemento" ? "Creatina" : "Levotiroxina"} autoFocus />
        </label>
        <label className="field">
          <span>Tipo</span>
          <select className="select" name="kind" defaultValue={med?.kind ?? kind}>
            <option value="medicamento">Medicamento</option>
            <option value="suplemento">Suplemento</option>
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Dosis</span>
          <input className="input num-input" name="dose" inputMode="decimal" required defaultValue={med?.dose ?? ""} placeholder="1" />
        </label>
        <label className="field">
          <span>Unidad</span>
          <input className="input" name="unit_label" required maxLength={24} defaultValue={med?.unit ?? ""} placeholder="mg, cápsula, g…" list="med-units" />
          <datalist id="med-units">
            {["mg", "g", "mcg", "UI", "ml", "comprimido", "cápsula", "gota", "scoop", "gomita", "sobre"].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Forma</span>
          <input className="input" name="form" maxLength={40} defaultValue={med?.form ?? ""} placeholder="Opcional" />
        </label>
      </div>
      <label className="field">
        <span>Cómo tomarlo</span>
        <input className="input" name="instructions" maxLength={200} defaultValue={med?.instructions ?? ""} placeholder="Con comida, en ayunas…" />
      </label>

      <div className="inner stack">
        <div className="seg" role="radiogroup" aria-label="Horario">
          <button type="button" aria-pressed={mode === "horario"} onClick={() => setMode("horario")}>Con horario</button>
          <button type="button" aria-pressed={mode === "demanda"} onClick={() => setMode("demanda")}>Cuando haga falta</button>
        </div>
        <input type="hidden" name="mode" value={mode} />
        {mode === "horario" ? (
          <>
            <span className="label">Qué días</span>
            <div className="seg">
              {(["diario", "semana", "intervalo", "mes"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={freq === f} onClick={() => setFreq(f)}>
                  {{ diario: "Cada día", semana: "Algunos días", intervalo: "Cada N", mes: "Cada mes" }[f]}
                </button>
              ))}
            </div>
            <input type="hidden" name="freq" value={freq} />
            {freq === "semana" || freq === "intervalo" ? (
              <div className="row wrap">
                {DAYS.map((d, i) => (
                  <label key={d} className="check chip">
                    <input type="checkbox" name="days" value={i + 1} defaultChecked={s?.days.includes(i + 1)} />
                    {d}
                  </label>
                ))}
              </div>
            ) : null}
            {freq === "intervalo" ? (
              <div className="form-row">
                <label className="field">
                  <span>Cada</span>
                  <input className="input num-input" name="every" inputMode="numeric" defaultValue={s?.interval?.every ?? 2} />
                </label>
                <label className="field">
                  <span>Unidad</span>
                  <select className="select" name="unit" defaultValue={s?.interval?.unit ?? "day"}>
                    <option value="day">días</option>
                    <option value="week">semanas</option>
                  </select>
                </label>
              </div>
            ) : null}
            {freq === "mes" ? (
              <label className="field">
                <span>Día del mes</span>
                <input className="input num-input" name="monthDay" inputMode="numeric" defaultValue={s?.monthDay ?? 1} />
              </label>
            ) : null}

            <span className="label" style={{ marginTop: 6 }}>Cuándo</span>
            <label className="field">
              <span>A estas horas</span>
              <input className="input" name="times" defaultValue={s?.times.join(", ") ?? ""} placeholder="08:00, 20:00" />
            </label>
            <div className="stack">
              {PARTS.map((p) => {
                const w = s?.windows.find((x) => x.part === p.key);
                const on = windows.has(p.key);
                return (
                  <div key={p.key} className="row wrap">
                    <label className="check">
                      <input
                        type="checkbox"
                        name={`win_${p.key}`}
                        checked={on}
                        onChange={(e) => {
                          const next = new Set(windows);
                          if (e.target.checked) next.add(p.key);
                          else next.delete(p.key);
                          setWindows(next);
                        }}
                      />
                      En la {p.label.toLowerCase()}
                    </label>
                    {on ? (
                      <>
                        <input className="input" style={{ width: 96 }} type="time" name={`win_${p.key}_start`} defaultValue={w?.start ?? p.start} />
                        <span className="muted">a</span>
                        <input className="input" style={{ width: 96 }} type="time" name={`win_${p.key}_end`} defaultValue={w?.end ?? p.end} />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="row wrap">
              <label className="check">
                <input type="checkbox" name="anyTime" checked={anyTime} onChange={(e) => setAnyTime(e.target.checked)} />
                Cualquier hora del día
              </label>
              {anyTime ? (
                <>
                  <span className="muted small">aviso</span>
                  <input className="input" style={{ width: 96 }} type="time" name="reminder" defaultValue={s?.reminder ?? "19:00"} />
                  <label className="check small">
                    <input type="checkbox" name="noReminder" defaultChecked={!!s?.anyTime && s.reminder === null} /> sin aviso
                  </label>
                </>
              ) : null}
            </div>
            <div className="row wrap">
              {MEALS.map((m) => (
                <label key={m.key} className="check">
                  <input type="checkbox" name={`meal_${m.key}`} defaultChecked={s?.meals.includes(m.key)} />
                  Con {m.label.toLowerCase()}
                </label>
              ))}
              <label className="check">
                <input type="checkbox" name="bedtime" defaultChecked={s?.bedtime} />
                Antes de dormir
              </label>
            </div>
            <div className="row wrap">
              <label className="check">
                <input type="checkbox" name="training" checked={training} onChange={(e) => setTraining(e.target.checked)} />
                Después de entrenar
              </label>
              {training ? (
                <>
                  <span className="muted small">dentro de</span>
                  <input className="input num-input" style={{ width: 70 }} name="withinMinutes" inputMode="numeric" defaultValue={s?.training?.withinMinutes ?? 60} />
                  <span className="muted small">min · sin entreno a las</span>
                  <input className="input" style={{ width: 96 }} type="time" name="restDayTime" disabled={restNone} defaultValue={s?.training?.restDayTime ?? "09:00"} />
                  <label className="check small">
                    <input type="checkbox" name="restNone" checked={restNone} onChange={(e) => setRestNone(e.target.checked)} /> no tomar
                  </label>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <p className="muted small">Sin horario ni avisos. Anotas cada toma cuando la tomes; no cuenta para la constancia.</p>
        )}
      </div>

      <div className="form-row">
        <label className="field">
          <span>Existencias</span>
          <input className="input num-input" name="stock" inputMode="decimal" defaultValue={med?.stock ?? ""} placeholder="Opcional" />
        </label>
        <label className="field">
          <span>Avisar con</span>
          <input className="input num-input" name="lowStockThreshold" inputMode="decimal" defaultValue={med?.lowStockThreshold ?? ""} placeholder="Opcional" />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Desde</span>
          <input className="input" type="date" name="startDate" defaultValue={med?.startDate ?? today} />
        </label>
        <label className="field">
          <span>Hasta</span>
          <input className="input" type="date" name="endDate" defaultValue={med?.endDate ?? ""} />
        </label>
      </div>
      <label className="field">
        <span>Notas</span>
        <textarea className="textarea" name="notes" maxLength={500} defaultValue={med?.notes ?? ""} />
      </label>
      <p className="tiny dim">Anótalo tal como te lo indicaron. Cualquier cambio de dosis lo decide tu médico.</p>
      <div>
        <Submit>{med ? "Guardar" : "Añadir"}</Submit>
      </div>
    </ActionForm>
  );
}

export function AddMedication({ today, kind = "medicamento", label = "Añadir", accent = true }: { today: string; kind?: "medicamento" | "suplemento"; label?: string; accent?: boolean }) {
  return (
    <Sheet
      title={kind === "suplemento" ? "Nuevo suplemento" : "Nuevo medicamento"}
      triggerClassName={accent ? "btn accent sm" : "btn sm"}
      trigger={
        <>
          <Plus size={14} /> {label}
        </>
      }
    >
      {(close) => <Editor kind={kind} today={today} close={close} />}
    </Sheet>
  );
}

export function EditMedication({ med, today }: { med: Med; today: string }) {
  return (
    <Sheet title={med.name} triggerClassName="btn ghost sm icon-only" trigger={<Pencil size={14} aria-label="Editar" />}>
      {(close) => <Editor med={med} kind={med.kind} today={today} close={close} />}
    </Sheet>
  );
}
