import { Play } from "lucide-react";
import { redirect } from "next/navigation";
import { asLibrary, estimateMinutes, getInProgress, getSession, listLibrary, listPersonalExercises, similarExercises, type SessionDetail } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Empty, Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { startSessionAction } from "../actions";
import { pickerItems } from "../_components/shared";
import { Logger } from "./logger";

export const metadata = { title: "Sesión" };

/**
 * `/entreno/sesion?workout=<id>`: the session in progress (the logger), or a
 * dated session not started yet with its «Empezar». Without an id, the one in
 * progress if any.
 */
export default async function Sesion({ searchParams }: { searchParams: Promise<{ workout?: string }> }) {
  const { workout } = await searchParams;
  const { client } = await requireMember();
  const live = await getInProgress(client);
  if (!workout) redirect(live ? `/entreno/sesion?workout=${live.id}` : "/entreno");
  let detail: SessionDetail;
  try {
    detail = await getSession(client, workout);
  } catch {
    redirect("/entreno");
  }
  const w = detail.workout;
  if (w.status === "done") redirect(`/entreno/sesiones/${w.id}`);

  if (!w.started_at) {
    return (
      <>
        <TopLine title={`Entreno · ${w.title}`} back="/entreno" backLabel="Entreno" />
        <Panel className="hero accent">
          <div className="row between wrap">
            <div className="grow">
              <div className="title lg">{w.title}</div>
              <div className="small muted">
                {detail.exercises.length} ejercicios · ~{estimateMinutes(detail.exercises.map((e) => e.rx))} min{detail.deload ? " · semana de descarga" : ""}
              </div>
            </div>
            {live && live.id !== w.id ? (
              <a href={`/entreno/sesion?workout=${live.id}`} className="btn">
                Tienes otra en curso
              </a>
            ) : (
              <ActionButton action={startSessionAction} fields={{ workout: w.id }} className="btn accent lg">
                <Play size={16} fill="currentColor" /> Empezar
              </ActionButton>
            )}
          </div>
        </Panel>
        <Panel className="tight" title="Hoy toca">
          {detail.exercises.length === 0 ? (
            <div className="list-row">
              <Empty title="Sin ejercicios" line="Agrégalos al día en el bloque." />
            </div>
          ) : (
            <div className="rows">
              {detail.exercises.map((e) => (
                <div key={e.index} className="list-row">
                  <div className="grow">
                    <div className="truncate">{e.exercise.name}</div>
                    <div className="sub">{e.cardio ? "Cardio" : `${e.rx.sets} × ${e.rx.repMin}–${e.rx.repMax}`}</div>
                  </div>
                  {e.suggestion ? <span className="tiny muted" style={{ maxWidth: "50%", textAlign: "right" }}>{e.suggestion.reason}</span> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </>
    );
  }

  const [library, personal] = await Promise.all([listLibrary(client), listPersonalExercises(client)]);
  const similar: Record<string, string[]> = {};
  for (const e of detail.exercises) similar[e.exercise.id] = similarExercises(asLibrary(e.exercise, library), library, [], 6).map((s) => s.exercise.id);

  return (
    <>
      <TopLine title={`Entreno · Sesión`} back="/entreno" backLabel="Entreno" />
      <Logger detail={detail} items={pickerItems(library, personal)} similar={similar} />
    </>
  );
}
