import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatWeight, getProgram, getSettings, listLibrary, listPersonalExercises, WEEKDAY_ES, type Block } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Chip, Empty, Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { activateBlockAction, deleteBlockAction, deleteDayAction, endBlockAction, moveDayAction, moveDayExerciseAction, removeDayExerciseAction } from "../../actions";
import { AddExerciseSheet, BlockSettingsSheet, DaySheet, EditExerciseSheet, NewExerciseSheet } from "../../_components/forms";
import { pickerItems, shortDay } from "../../_components/shared";

export const metadata = { title: "Bloque" };

const GOAL: Record<string, string> = { hipertrofia: "Hipertrofia", fuerza: "Fuerza", resistencia: "Resistencia", perdida_grasa: "Perder grasa", salud: "Salud general" };

export default async function Bloque({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireMember();
  let block: Block;
  try {
    block = await getProgram(client, id);
  } catch {
    notFound();
  }
  const [library, personal, settings] = await Promise.all([listLibrary(client), listPersonalExercises(client), getSettings(client)]);
  const items = pickerItems(library, personal);
  const unitOf = (exerciseId: string) => personal.find((p) => p.id === exerciseId || p.library_id === exerciseId)?.unit ?? settings.weight_unit;
  const { program, days } = block;

  return (
    <>
      <TopLine title={`Entreno · ${program.name}`} back="/entreno" backLabel="Entreno">
        <NewExerciseSheet />
        <BlockSettingsSheet program={program} />
      </TopLine>

      <Panel className="hero">
        <div className="row between wrap">
          <div className="grow">
            <div className="row wrap" style={{ gap: 6 }}>
              {program.active ? <Chip tone="green">Activo</Chip> : program.ended_at ? <Chip>Terminado</Chip> : <Chip>Sin activar</Chip>}
              <Chip>{GOAL[program.goal] ?? program.goal}</Chip>
              <Chip>{program.weeks} semanas</Chip>
              {program.deload_weeks.length ? <Chip tone="blue">Descarga {program.deload_weeks.join(", ")}</Chip> : null}
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              Desde el {shortDay(program.starts_on)}. {program.notes}
            </p>
          </div>
          <div className="row wrap">
            {program.active ? (
              <ActionButton action={endBlockAction} fields={{ id: program.id }} className="btn sm" confirm="¿Terminar el bloque? Se quitan las sesiones planeadas de hoy en adelante.">
                Terminar
              </ActionButton>
            ) : (
              <ActionButton action={activateBlockAction} fields={{ id: program.id }} className="btn accent sm">
                Activar
              </ActionButton>
            )}
            <ActionButton action={deleteBlockAction} fields={{ id: program.id }} className="btn danger sm" confirm="¿Borrar el bloque? Las sesiones hechas se quedan en tu historial.">
              <Trash2 size={13} /> Borrar
            </ActionButton>
          </div>
        </div>
      </Panel>

      {days.length === 0 ? (
        <Panel>
          <Empty title="Sin días" line="Agrega un día por sesión de la semana (Torso A, Pierna…), con su día y hora si los tiene." />
        </Panel>
      ) : null}

      <div className="cols-2">
        {days.map((d, di) => (
          <Panel
            key={d.id}
            title={[d.name, d.focus].filter(Boolean).join(" · ")}
            action={
              <div className="row" style={{ gap: 2 }}>
                <span className="tiny muted mono">{[d.weekday ? WEEKDAY_ES[d.weekday] : "Sin día", d.time?.slice(0, 5)].filter(Boolean).join(" · ")}</span>
                <DaySheet programId={program.id} day={d} />
                {di > 0 ? (
                  <ActionButton action={moveDayAction} fields={{ id: d.id, delta: -1 }} className="btn ghost sm icon-only" title="Subir">
                    <ArrowUp size={13} />
                  </ActionButton>
                ) : null}
                {di < days.length - 1 ? (
                  <ActionButton action={moveDayAction} fields={{ id: d.id, delta: 1 }} className="btn ghost sm icon-only" title="Bajar">
                    <ArrowDown size={13} />
                  </ActionButton>
                ) : null}
                <ActionButton action={deleteDayAction} fields={{ id: d.id }} className="btn ghost sm icon-only" confirm={`¿Quitar ${d.name} del bloque?`} title="Quitar día">
                  <Trash2 size={13} />
                </ActionButton>
              </div>
            }
          >
            <div className="rows">
              {d.exercises.map((e, i) => {
                const unit = unitOf(e.exerciseId);
                return (
                  <div key={`${e.exerciseId}-${i}`} className="list-row" style={{ paddingInline: 0 }}>
                    <div className="grow">
                      <Link href={`/entreno/ejercicio/${e.exerciseId}`} className="truncate" style={{ display: "block" }}>
                        {e.name}
                      </Link>
                      <div className="sub">
                        {e.cardio
                          ? [e.cardio.minutes ? `${e.cardio.minutes} min` : null, e.cardio.distanceKm ? `${e.cardio.distanceKm} km` : null, e.cardio.level ? `nivel ${e.cardio.level}` : null].filter(Boolean).join(" · ") || "Cardio"
                          : [`${e.sets} × ${e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}`, e.targetRir != null ? `RIR ${e.targetRir}` : null, `${e.restSeconds} s`, e.weightKg ? formatWeight(e.weightKg, unit) : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <EditExerciseSheet dayId={d.id} index={i} ex={e} unit={unit} />
                    {i > 0 ? (
                      <ActionButton action={moveDayExerciseAction} fields={{ day_id: d.id, index: i, delta: -1 }} className="btn ghost sm icon-only" title="Subir">
                        <ArrowUp size={13} />
                      </ActionButton>
                    ) : null}
                    <ActionButton action={removeDayExerciseAction} fields={{ day_id: d.id, index: i }} className="btn ghost sm icon-only" title="Quitar">
                      <Trash2 size={13} />
                    </ActionButton>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8 }}>
              <AddExerciseSheet dayId={d.id} items={items} />
            </div>
          </Panel>
        ))}
      </div>

      <div>
        <DaySheet programId={program.id} />
      </div>
    </>
  );
}
