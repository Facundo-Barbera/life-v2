import { Activity, ChevronRight, Dumbbell, Play, SkipForward, Undo2 } from "lucide-react";
import Link from "next/link";
import { fmtMinutes, getEntrenoOverview, WEEKDAY_SHORT, type SessionView } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Chip, Empty, fmt, ListRow, Panel, Rows, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { skipSessionAction, startSessionAction } from "./actions";
import { MoveSessionSheet, NewBlockSheet } from "./_components/forms";
import { localTimeOf, shortDay, StatusChip, whenLabel } from "./_components/shared";

export const metadata = { title: "Entreno" };

/** Entreno: the session in progress or the next one with its one button, the week, the block's weeks, the history. */
export default async function Entreno() {
  const { client } = await requireMember();
  const o = await getEntrenoOverview(client);
  const block = o.block;
  const thisWeek = o.weeks.find((w) => w.number === o.currentWeek);
  const tz = o.timezone;

  return (
    <>
      <TopLine title={block ? `Entreno · ${block.program.name}` : "Entreno"}>
        <Link href="/entreno/salud" className="btn ghost sm">
          <Activity size={14} /> Apple Salud
        </Link>
        {block ? (
          <Link href={`/entreno/bloque/${block.program.id}`} className="btn sm">
            Bloque
          </Link>
        ) : null}
      </TopLine>

      {o.inProgress ? (
        <Panel className="hero accent" title="En curso">
          <div className="row between wrap">
            <div className="grow">
              <div className="title lg truncate">{o.inProgress.title}</div>
              <div className="small muted">Empezaste a las {localTimeOf(o.inProgress.started_at, tz)}</div>
            </div>
            <Link href={`/entreno/sesion?workout=${o.inProgress.id}`} className="btn accent lg">
              <Play size={16} fill="currentColor" /> Continuar
            </Link>
          </div>
        </Panel>
      ) : block ? (
        <NextHero next={o.next} today={o.today} tz={tz} weekComplete={!!thisWeek && thisWeek.sessions.every((s) => s.status !== "planned")} />
      ) : (
        <Panel className="hero">
          <Empty title="Aún no tienes un bloque" line="Arma tu rutina: días, ejercicios, series y repeticiones. Pulso fecha cada sesión de cada semana y te sugiere los pesos.">
            <div className="row wrap">
              <NewBlockSheet label="Crear bloque" className="btn accent" />
              <ActionButton action={startSessionAction} fields={{ title: "Sesión libre" }} className="btn">
                Sesión libre
              </ActionButton>
            </div>
          </Empty>
        </Panel>
      )}

      {block && thisWeek ? (
        <Panel title={`Semana ${thisWeek.number} de ${block.program.weeks}${thisWeek.deload ? " · descarga" : ""}`}>
          <div className="row wrap" style={{ gap: 6 }}>
            {thisWeek.sessions.map((s) => (
              <Link key={s.workout.id} href={s.status === "done" || s.status === "partial" ? `/entreno/sesiones/${s.workout.id}` : "#semanas"} className={`chip ${s.status === "done" ? "green" : s.status === "partial" ? "amber" : s.status === "missed" ? "red" : ""}`} style={{ minHeight: 30, paddingInline: 12 }}>
                {s.workout.local_date ? WEEKDAY_SHORT[new Date(`${s.workout.local_date}T12:00:00Z`).getUTCDay() || 7] : "·"} {s.workout.title}
              </Link>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {thisWeek.sessions.filter((s) => s.status === "done" || s.status === "partial").length} de {thisWeek.sessions.filter((s) => s.status !== "skipped").length} sesiones
          </p>
        </Panel>
      ) : null}

      {block ? (
        <div className="cols-2">
          <Panel className="tight" title="Semanas" id="semanas">
            {o.weeks.map((w) => (
              <details key={w.number} open={w.number === o.currentWeek}>
                <summary className="list-row" style={{ cursor: "pointer", minHeight: 40 }}>
                  <span className="label grow">
                    Semana {w.number} · {shortDay(w.from)} – {shortDay(w.to)}
                    {w.deload ? " · descarga" : ""}
                  </span>
                  <span className="tiny muted">
                    {w.sessions.filter((s) => s.status === "done" || s.status === "partial").length}/{w.sessions.filter((s) => s.status !== "skipped").length}
                  </span>
                </summary>
                <Rows>
                  {w.sessions.map((s) => (
                    <SessionRow key={s.workout.id} s={s} today={o.today} tz={tz} live={!!o.inProgress} />
                  ))}
                  {w.sessions.length === 0 ? <div className="list-row muted small">Agrega días al bloque.</div> : null}
                </Rows>
              </details>
            ))}
          </Panel>
          <div className="grid">
            <Panel title="Plan" href={`/entreno/bloque/${block.program.id}`}>
              {block.days.length === 0 ? (
                <Empty title="Sin días" line="Agrega los días del bloque y sus ejercicios." />
              ) : (
                <div className="stack">
                  {block.days.map((d) => (
                    <div key={d.id} className="inner">
                      <div className="row between">
                        <span className="strong truncate">{d.name}</span>
                        <span className="tiny muted mono">{[d.weekday ? WEEKDAY_SHORT[d.weekday] : null, d.time?.slice(0, 5)].filter(Boolean).join(" · ")}</span>
                      </div>
                      <div className="small muted truncate">{d.exercises.map((e) => e.name).join(" · ") || "Sin ejercicios"}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Fuera del plan">
              <div className="row wrap">
                {block.days.map((d) => (
                  <ActionButton key={d.id} action={startSessionAction} fields={{ day: d.id }} className="btn sm">
                    {d.name}
                  </ActionButton>
                ))}
                <ActionButton action={startSessionAction} fields={{ title: "Sesión libre" }} className="btn sm ghost">
                  Sesión libre
                </ActionButton>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      <Panel className="tight" title="Últimas sesiones">
        {o.history.length === 0 ? (
          <div className="list-row muted small">Cuando termines una sesión aparece aquí.</div>
        ) : (
          <Rows>
            {o.history.map((h) => (
              <ListRow
                key={h.workout.id}
                href={`/entreno/sesiones/${h.workout.id}`}
                icon={<Dumbbell size={15} />}
                title={h.workout.title}
                sub={[shortDay(h.workout.local_date), fmtMinutes(h.minutes), `${h.sets} series`, h.volumeKg ? `${fmt(h.volumeKg)} kg` : null].filter(Boolean).join(" · ")}
                trailing={<ChevronRight size={15} className="dim" />}
              />
            ))}
          </Rows>
        )}
      </Panel>

      {block ? (
        <div className="row wrap">
          <NewBlockSheet className="btn ghost sm" />
          <Link href="/entreno/bloques" className="btn ghost sm">
            Bloques anteriores
          </Link>
        </div>
      ) : null}
    </>
  );
}

function NextHero({ next, today, tz, weekComplete }: { next: SessionView | null; today: string; tz: string; weekComplete: boolean }) {
  if (!next) {
    return (
      <Panel className="hero">
        <div className="title">{weekComplete ? "Semana completa" : "Nada pendiente"}</div>
        <p className="small muted">{weekComplete ? "La siguiente semana empieza el lunes." : "Agrega días al bloque o empieza una sesión fuera del plan."}</p>
      </Panel>
    );
  }
  const w = next.workout;
  const time = localTimeOf(w.planned_at, tz);
  return (
    <Panel className="hero accent">
      <div className="row between wrap">
        <div className="grow">
          <span className="label green">{whenLabel(w.local_date, time, today)}</span>
          <div className="title lg truncate">{w.title}</div>
          <div className="small muted">{[w.focus, `${next.exercises.length} ${next.exercises.length === 1 ? "ejercicio" : "ejercicios"}`, `~${next.minutes} min`].filter(Boolean).join(" · ")}</div>
        </div>
        {next.exercises.length > 0 ? (
          <ActionButton action={startSessionAction} fields={{ workout: w.id }} className="btn accent lg">
            <Play size={16} fill="currentColor" /> Empezar
          </ActionButton>
        ) : (
          <Chip>Sin ejercicios</Chip>
        )}
      </div>
    </Panel>
  );
}

function SessionRow({ s, today, tz, live }: { s: SessionView; today: string; tz: string; live: boolean }) {
  const w = s.workout;
  const time = localTimeOf(w.planned_at, tz);
  const doneish = s.status === "done" || s.status === "partial";
  return (
    <div className="list-row">
      <span className="mono tiny muted" style={{ width: 64, flexShrink: 0 }}>
        {shortDay(w.local_date)}
      </span>
      <div className="grow">
        {doneish ? (
          <Link href={`/entreno/sesiones/${w.id}`} className="truncate" style={{ display: "block" }}>
            {w.title}
          </Link>
        ) : (
          <div className="truncate">{w.title}</div>
        )}
        <div className="sub">{doneish ? `${s.sets} de ${s.prescribed} series` : [time, `~${s.minutes} min`].filter(Boolean).join(" · ")}</div>
      </div>
      <StatusChip status={s.status} />
      {s.status === "planned" || s.status === "missed" ? (
        <>
          {!live && s.exercises.length > 0 ? (
            <ActionButton action={startSessionAction} fields={{ workout: w.id }} className="btn ghost sm icon-only" title="Empezar">
              <Play size={13} />
            </ActionButton>
          ) : null}
          <MoveSessionSheet id={w.id} date={w.local_date ?? today} time={time} />
          <ActionButton action={skipSessionAction} fields={{ id: w.id, skip: "true" }} className="btn ghost sm icon-only" title="Saltar">
            <SkipForward size={13} />
          </ActionButton>
        </>
      ) : s.status === "skipped" ? (
        <ActionButton action={skipSessionAction} fields={{ id: w.id, skip: "false" }} className="btn ghost sm icon-only" title="Reanudar">
          <Undo2 size={13} />
        </ActionButton>
      ) : null}
    </div>
  );
}
