"use client";
import { CalendarClock, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { Program, ProgramDay, ProgramExercise, WeightUnit } from "@life/db";
import { shown, WEEKDAY_ES } from "@life/db/pulso";
import { ActionForm, Sheet, Submit } from "@/components/client";
import {
  addDayAction,
  addDayExerciseAction,
  createBlockAction,
  createExerciseAction,
  moveSessionAction,
  updateBlockAction,
  updateDayAction,
  updateDayExerciseAction,
} from "../actions";
import { ExercisePicker, type PickerItem } from "./picker";

function BlockFields({ p }: { p?: Program }) {
  return (
    <>
      <label className="field">
        <span>Nombre</span>
        <input className="input" name="name" required defaultValue={p?.name ?? ""} placeholder="Torso / pierna" />
      </label>
      <div className="form-row">
        <label className="field">
          <span>Objetivo</span>
          <select className="select" name="goal" defaultValue={p?.goal ?? "hipertrofia"}>
            <option value="hipertrofia">Hipertrofia</option>
            <option value="fuerza">Fuerza</option>
            <option value="resistencia">Resistencia</option>
            <option value="perdida_grasa">Perder grasa</option>
            <option value="salud">Salud general</option>
          </select>
        </label>
        <label className="field">
          <span>Semanas</span>
          <input className="input num-input" name="weeks" inputMode="numeric" required defaultValue={p?.weeks ?? 6} />
        </label>
        <label className="field">
          <span>Empieza</span>
          <input className="input" type="date" name="starts_on" required defaultValue={p?.starts_on ?? new Date().toISOString().slice(0, 10)} />
        </label>
      </div>
      <label className="field">
        <span>Semanas de descarga</span>
        <input className="input" name="deload" defaultValue={p?.deload_weeks.join(", ") ?? ""} placeholder="p. ej. 4, 8" />
      </label>
      <label className="field">
        <span>Notas</span>
        <textarea className="textarea" name="notes" defaultValue={p?.notes ?? ""} />
      </label>
    </>
  );
}

export function NewBlockSheet({ label = "Nuevo bloque", className = "btn sm" }: { label?: string; className?: string }) {
  return (
    <Sheet title="Nuevo bloque" triggerClassName={className} trigger={<><Plus size={14} /> {label}</>}>
      <ActionForm action={createBlockAction}>
        <BlockFields />
        <label className="check">
          <input type="checkbox" name="activate" defaultChecked />
          <span>Hacerlo mi bloque activo</span>
        </label>
        <div>
          <Submit>Crear y agregar días</Submit>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function BlockSettingsSheet({ program }: { program: Program }) {
  return (
    <Sheet title="Bloque" triggerClassName="btn sm" trigger={<><Pencil size={14} /> Editar</>}>
      {(close) => (
        <ActionForm action={updateBlockAction} onDone={close} resetOnSuccess={false}>
          <input type="hidden" name="id" value={program.id} />
          <BlockFields p={program} />
          <div>
            <Submit>Guardar</Submit>
          </div>
        </ActionForm>
      )}
    </Sheet>
  );
}

function DayFields({ d }: { d?: ProgramDay }) {
  return (
    <>
      <div className="form-row">
        <label className="field">
          <span>Nombre</span>
          <input className="input" name="name" required defaultValue={d?.name ?? ""} placeholder="Torso A" />
        </label>
        <label className="field">
          <span>Enfoque</span>
          <input className="input" name="focus" defaultValue={d?.focus ?? ""} placeholder="Empuje" />
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Día</span>
          <select className="select" name="weekday" defaultValue={d?.weekday ?? ""}>
            <option value="">Sin día fijo</option>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {WEEKDAY_ES[n]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Hora</span>
          <input className="input" type="time" name="time" defaultValue={d?.time?.slice(0, 5) ?? ""} />
        </label>
        <label className="field">
          <span>Minutos</span>
          <input className="input num-input" name="duration" inputMode="numeric" defaultValue={d?.duration_min ?? ""} />
        </label>
      </div>
    </>
  );
}

export function DaySheet({ programId, day }: { programId: string; day?: ProgramDay }) {
  return (
    <Sheet title={day ? "Día" : "Nuevo día"} triggerClassName={day ? "btn ghost sm icon-only" : "btn sm"} trigger={day ? <Pencil size={14} /> : <><Plus size={14} /> Día</>}>
      {(close) => (
        <ActionForm action={day ? updateDayAction : addDayAction} onDone={close} resetOnSuccess={!day}>
          {day ? <input type="hidden" name="id" value={day.id} /> : <input type="hidden" name="program_id" value={programId} />}
          <DayFields d={day} />
          <div>
            <Submit>{day ? "Guardar" : "Agregar"}</Submit>
          </div>
        </ActionForm>
      )}
    </Sheet>
  );
}

/** Pick an exercise, then its prescription. */
export function AddExerciseSheet({ dayId, items }: { dayId: string; items: PickerItem[] }) {
  const [picked, setPicked] = useState<PickerItem | null>(null);
  return (
    <Sheet title="Agregar ejercicio" triggerClassName="btn sm" trigger={<><Plus size={14} /> Ejercicio</>}>
      {(close) =>
        picked ? (
          <ActionForm
            action={addDayExerciseAction}
            onDone={() => {
              setPicked(null);
              close();
            }}
          >
            <input type="hidden" name="day_id" value={dayId} />
            <input type="hidden" name="exercise_id" value={picked.id} />
            <div className="row between">
              <span className="title">{picked.name}</span>
              <button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>
                Cambiar
              </button>
            </div>
            {picked.kind === "cardio" ? (
              <label className="field">
                <span>Minutos</span>
                <input className="input num-input" name="minutes" inputMode="numeric" defaultValue={20} />
              </label>
            ) : (
              <div className="form-row">
                <label className="field">
                  <span>Series</span>
                  <input className="input num-input" name="sets" inputMode="numeric" defaultValue={3} />
                </label>
                <label className="field">
                  <span>Reps mín</span>
                  <input className="input num-input" name="rep_min" inputMode="numeric" defaultValue={8} />
                </label>
                <label className="field">
                  <span>Reps máx</span>
                  <input className="input num-input" name="rep_max" inputMode="numeric" defaultValue={12} />
                </label>
                <label className="field">
                  <span>RIR</span>
                  <input className="input num-input" name="rir" inputMode="numeric" defaultValue={2} />
                </label>
                <label className="field">
                  <span>Descanso (s)</span>
                  <input className="input num-input" name="rest" inputMode="numeric" defaultValue={90} />
                </label>
              </div>
            )}
            <div>
              <Submit>Agregar</Submit>
            </div>
          </ActionForm>
        ) : (
          <ExercisePicker items={items} onPick={(id) => setPicked(items.find((i) => i.id === id) ?? null)} />
        )
      }
    </Sheet>
  );
}

export function EditExerciseSheet({ dayId, index, ex, unit }: { dayId: string; index: number; ex: ProgramExercise; unit: WeightUnit }) {
  return (
    <Sheet title={ex.name} triggerClassName="btn ghost sm icon-only" trigger={<Pencil size={14} />}>
      {(close) => (
        <ActionForm action={updateDayExerciseAction} onDone={close} resetOnSuccess={false}>
          <input type="hidden" name="day_id" value={dayId} />
          <input type="hidden" name="index" value={index} />
          <input type="hidden" name="unit" value={unit} />
          {ex.cardio ? (
            <div className="form-row">
              <label className="field">
                <span>Minutos</span>
                <input className="input num-input" name="minutes" inputMode="numeric" defaultValue={ex.cardio.minutes ?? ""} />
              </label>
              <label className="field">
                <span>Distancia (km)</span>
                <input className="input num-input" name="distance" inputMode="decimal" defaultValue={ex.cardio.distanceKm ?? ""} />
              </label>
              <label className="field">
                <span>Nivel</span>
                <input className="input num-input" name="level" inputMode="decimal" defaultValue={ex.cardio.level ?? ""} />
              </label>
            </div>
          ) : (
            <div className="form-row">
              <label className="field">
                <span>Series</span>
                <input className="input num-input" name="sets" inputMode="numeric" defaultValue={ex.sets} />
              </label>
              <label className="field">
                <span>Reps mín</span>
                <input className="input num-input" name="rep_min" inputMode="numeric" defaultValue={ex.repMin} />
              </label>
              <label className="field">
                <span>Reps máx</span>
                <input className="input num-input" name="rep_max" inputMode="numeric" defaultValue={ex.repMax} />
              </label>
              <label className="field">
                <span>RIR</span>
                <input className="input num-input" name="rir" inputMode="numeric" defaultValue={ex.targetRir ?? ""} />
              </label>
              <label className="field">
                <span>Descanso (s)</span>
                <input className="input num-input" name="rest" inputMode="numeric" defaultValue={ex.restSeconds} />
              </label>
              <label className="field">
                <span>Peso ({unit})</span>
                <input className="input num-input" name="weight" inputMode="decimal" defaultValue={ex.weightKg != null ? shown(ex.weightKg, unit) : ""} />
              </label>
            </div>
          )}
          <label className="field">
            <span>Notas</span>
            <input className="input" name="notes" defaultValue={ex.notes ?? ""} />
          </label>
          <div>
            <Submit>Guardar</Submit>
          </div>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function MoveSessionSheet({ id, date, time }: { id: string; date: string | null; time: string | null }) {
  return (
    <Sheet title="Mover sesión" triggerClassName="btn ghost sm icon-only" trigger={<CalendarClock size={14} />}>
      {(close) => (
        <ActionForm action={moveSessionAction} onDone={close} resetOnSuccess={false}>
          <input type="hidden" name="id" value={id} />
          <div className="form-row">
            <label className="field">
              <span>Fecha</span>
              <input className="input" type="date" name="date" required defaultValue={date ?? ""} />
            </label>
            <label className="field">
              <span>Hora</span>
              <input className="input" type="time" name="time" defaultValue={time ?? ""} />
            </label>
          </div>
          <div>
            <Submit>Mover</Submit>
          </div>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function NewExerciseSheet() {
  return (
    <Sheet title="Ejercicio propio" triggerClassName="btn ghost sm" trigger={<><Plus size={14} /> Ejercicio propio</>}>
      {(close) => (
        <ActionForm action={createExerciseAction} onDone={close}>
          <label className="field">
            <span>Nombre</span>
            <input className="input" name="name" required />
          </label>
          <div className="form-row">
            <label className="field">
              <span>Músculo</span>
              <select className="select" name="muscle" defaultValue="chest">
                {Object.entries({ chest: "Pecho", back: "Espalda", shoulders: "Hombros", biceps: "Bíceps", triceps: "Tríceps", forearms: "Antebrazos", quads: "Cuádriceps", hamstrings: "Femorales", glutes: "Glúteos", calves: "Pantorrillas", core: "Abdomen", full_body: "Cuerpo completo", cardio: "Cardio" }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Equipo</span>
              <select className="select" name="equipment" defaultValue="machine">
                {Object.entries({ machine: "Máquina", cable: "Polea", dumbbell: "Mancuernas", barbell: "Barra", bodyweight: "Peso corporal", band: "Bandas", kettlebell: "Kettlebell" }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo</span>
              <select className="select" name="kind" defaultValue="compound">
                <option value="compound">Multiarticular</option>
                <option value="isolation">Aislamiento</option>
                <option value="cardio">Cardio</option>
              </select>
            </label>
          </div>
          <div>
            <Submit>Crear</Submit>
          </div>
        </ActionForm>
      )}
    </Sheet>
  );
}

