import Link from "next/link";
import { notFound } from "next/navigation";
import { EQUIPMENT_ES, formatSet, formatWeight, getExerciseDetail, MUSCLE_ES, shown, type ExerciseDetail } from "@life/db/pulso";
import { ActionButton, ActionForm, Submit } from "@/components/client";
import { Chip, Empty, fmt, ListRow, Panel, Rows, Sparkline, Stat, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { setNotesAction, setUnitAction } from "../../actions";

export const metadata = { title: "Ejercicio" };

const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "2-digit" }) : "—");

export default async function Ejercicio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireMember();
  let d: ExerciseDetail;
  try {
    d = await getExerciseDetail(client, decodeURIComponent(id));
  } catch {
    notFound();
  }
  const p = d.performance;
  const unit = d.unit;
  const meta = d.library ?? null;
  const muscle = meta ? String(meta.muscle) : (d.exercise?.muscle_group ?? "");
  const equipment = meta ? String(meta.equipment) : (d.exercise?.equipment ?? "");
  const key = d.exercise?.id ?? meta!.id;

  return (
    <>
      <TopLine title={`Entreno · ${d.name}`} back="/entreno" backLabel="Entreno">
        <div className="seg">
          {(["kg", "lb"] as const).map((u) => (
            <ActionButton key={u} action={setUnitAction} fields={{ exercise_id: key, unit: u }} className="" title={`Usar ${u}`}>
              <span aria-pressed={unit === u} style={{ padding: "5px 11px", borderRadius: 999, display: "inline-block", background: unit === u ? "var(--life-card)" : "transparent" }}>
                {u}
              </span>
            </ActionButton>
          ))}
        </div>
      </TopLine>

      <Panel className="hero">
        <div className="row wrap" style={{ gap: 6 }}>
          {muscle ? <Chip>{MUSCLE_ES[muscle] ?? muscle}</Chip> : null}
          {equipment ? <Chip>{EQUIPMENT_ES[equipment] ?? equipment}</Chip> : null}
          {meta?.secondary.map((m) => <Chip key={m}>{MUSCLE_ES[m] ?? m}</Chip>)}
        </div>
        <div className="stats" style={{ marginTop: 12 }}>
          <Stat label="Más peso" value={p.maxWeight ? fmt(shown(p.maxWeight.kg, unit), 2) : "—"} unit={p.maxWeight ? `${unit} × ${p.maxWeight.reps}` : undefined} hint={p.maxWeight ? day(p.maxWeight.at) : undefined} />
          <Stat label="Mejor e1RM" value={p.bestE1rm ? fmt(shown(p.bestE1rm.kg, unit), 1) : "—"} unit={p.bestE1rm ? unit : undefined} hint={p.bestE1rm ? day(p.bestE1rm.at) : undefined} tone="green" />
          <Stat label="Más volumen" value={p.maxVolume ? fmt(p.maxVolume.kg) : "—"} unit={p.maxVolume ? "kg" : undefined} hint={p.maxVolume ? day(p.maxVolume.at) : undefined} />
          <Stat label="Sesiones" value={p.history.length} />
        </div>
        {p.history.length >= 2 ? (
          <div style={{ marginTop: 12 }}>
            <span className="label">e1RM por sesión</span>
            <Sparkline values={p.history.map((h) => (h.e1rm ? shown(h.e1rm, unit) : null))} height={56} />
          </div>
        ) : null}
      </Panel>

      <div className="cols-2">
        <Panel className="tight" title="Historial">
          {d.sessions.length === 0 ? (
            <div className="list-row">
              <Empty title="Aún sin series" line="Cuando lo hagas en una sesión verás aquí cada serie." />
            </div>
          ) : (
            <Rows>
              {d.sessions.slice(0, 30).map((s) => (
                <ListRow
                  key={s.workoutId}
                  href={`/entreno/sesiones/${s.workoutId}`}
                  title={s.sets.map((x) => formatSet({ weightKg: x.weight_kg ?? 0, reps: x.reps ?? 0, drops: x.drops }, unit)).join(", ")}
                  sub={`${day(s.at)} · ${s.title}`}
                />
              ))}
            </Rows>
          )}
        </Panel>
        <div className="grid">
          {d.exercise ? (
            <Panel title="Notas">
              <ActionForm action={setNotesAction} resetOnSuccess={false}>
                <input type="hidden" name="exercise_id" value={d.exercise.id} />
                <textarea className="textarea" name="notes" defaultValue={d.exercise.notes ?? ""} placeholder="Ajuste del asiento, agarre, molestias…" />
                <div>
                  <Submit className="btn sm">Guardar</Submit>
                </div>
              </ActionForm>
            </Panel>
          ) : null}
          <Panel className="tight" title="Alternativas">
            <Rows>
              {d.similar.map((s) => (
                <ListRow key={s.exercise.id} href={`/entreno/ejercicio/${s.exercise.id}`} title={s.exercise.name} sub={s.reasons.join(" · ")} />
              ))}
            </Rows>
          </Panel>
          {p.maxWeight ? <p className="tiny muted">Pesos en {unit}; se guardan en kg ({formatWeight(p.maxWeight.kg, "kg")}).</p> : null}
        </div>
      </div>
      <Link href="/entreno" className="btn ghost sm" style={{ justifySelf: "start" }}>
        Volver a Entreno
      </Link>
    </>
  );
}
