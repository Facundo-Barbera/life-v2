import { Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { bests, fmtMinutes, formatSet, formatWeight, getSession, getSettings, volumeOf, type SessionDetail } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { fmt, Panel, Stat, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { deleteSessionAction } from "../../actions";
import { localTimeOf, shortDay } from "../../_components/shared";

export const metadata = { title: "Sesión" };

export default async function SesionHecha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client } = await requireMember();
  let d: SessionDetail;
  try {
    d = await getSession(client, id);
  } catch {
    notFound();
  }
  const w = d.workout;
  if (w.started_at && !w.ended_at && w.status !== "done") redirect(`/entreno/sesion?workout=${w.id}`);
  const { timezone } = await getSettings(client);
  const all = d.exercises.flatMap((e) => e.sets);
  const strength = all.filter((s) => s.duration_s == null);
  const volume = Math.round(strength.reduce((n, s) => n + volumeOf({ weightKg: s.weight_kg ?? 0, reps: s.reps ?? 0, drops: s.drops }), 0));
  const minutes = w.started_at && w.ended_at ? (Date.parse(w.ended_at) - Date.parse(w.started_at)) / 60_000 : null;

  return (
    <>
      <TopLine title={`Entreno · ${w.title}`} back="/entreno" backLabel="Entreno">
        <ActionButton action={deleteSessionAction} fields={{ id: w.id }} className="btn ghost sm" confirm="¿Borrar esta sesión y sus series?">
          <Trash2 size={13} /> Borrar
        </ActionButton>
      </TopLine>
      <Panel className="hero">
        <span className="label">
          {shortDay(w.local_date)} · {localTimeOf(w.started_at, timezone)}–{localTimeOf(w.ended_at, timezone)}
        </span>
        <div className="title lg">{w.title}</div>
        <div className="stats" style={{ marginTop: 12 }}>
          <Stat label="Duración" value={fmtMinutes(minutes)} />
          <Stat label="Series" value={all.length} />
          <Stat label="Volumen" value={fmt(volume)} unit="kg" />
          {w.energy_kcal ? <Stat label="Energía" value={fmt(w.energy_kcal)} unit="kcal" /> : null}
          {w.avg_hr ? <Stat label="FC media" value={fmt(w.avg_hr)} unit="lpm" /> : null}
        </div>
        {w.notes ? <p className="small muted" style={{ marginTop: 10 }}>{w.notes}</p> : null}
      </Panel>
      <div className="cols-2">
        {d.exercises
          .filter((e) => e.sets.length)
          .map((e) => {
            const b = bests(e.sets.map((s) => ({ weightKg: s.weight_kg ?? 0, reps: s.reps ?? 0 })));
            return (
              <Panel key={e.index} title={<Link href={`/entreno/ejercicio/${e.exercise.id}`}>{e.exercise.name}</Link>} action={b.e1rm ? <span className="tiny muted">e1RM {formatWeight(b.e1rm, e.unit)}</span> : null}>
                <div className="stack">
                  {e.sets.map((s, i) => (
                    <div key={s.id} className="row">
                      <span className="mono tiny muted" style={{ width: 22 }}>
                        {i + 1}
                      </span>
                      <span className="grow">
                        {s.duration_s != null
                          ? [`${Math.round(s.duration_s / 60)} min`, s.distance_km ? `${s.distance_km} km` : null, s.kcal ? `${s.kcal} kcal` : null].filter(Boolean).join(" · ")
                          : formatSet({ weightKg: s.weight_kg ?? 0, reps: s.reps ?? 0, drops: s.drops }, e.unit)}
                      </span>
                      {s.rpe != null ? <span className="tiny muted">RPE {s.rpe}</span> : null}
                    </div>
                  ))}
                </div>
              </Panel>
            );
          })}
        {d.orphanSets.length ? (
          <Panel title="Otros">
            {d.orphanSets.map((s) => (
              <div key={s.id} className="small">
                {s.name} · {formatSet({ weightKg: s.weight_kg ?? 0, reps: s.reps ?? 0, drops: s.drops }, d.defaultUnit)}
              </div>
            ))}
          </Panel>
        ) : null}
      </div>
    </>
  );
}
