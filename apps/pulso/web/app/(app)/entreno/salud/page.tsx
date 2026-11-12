import { Activity, Link2, Unlink } from "lucide-react";
import { fmtMinutes, getSettings, listHealthWorkouts, localDate } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Chip, Empty, fmt, Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { linkHealthAction } from "../actions";
import { localTimeOf, shortDay } from "../_components/shared";

export const metadata = { title: "Apple Salud" };

/** Workouts Apple Health recorded (any app), each tied to the Pulso session it was, or apart. */
export default async function SaludWorkouts() {
  const { client } = await requireMember();
  const [rows, { timezone }] = await Promise.all([listHealthWorkouts(client, 60), getSettings(client)]);
  return (
    <>
      <TopLine title="Entreno · Apple Salud" back="/entreno" backLabel="Entreno" />
      <Panel className="tight">
        {rows.length === 0 ? (
          <div className="list-row">
            <Empty title="Sin entrenamientos de Salud" line="El iPhone sube aquí los entrenamientos que registra Apple Salud (Watch, otras apps) de los últimos 30 días." />
          </div>
        ) : (
          <div className="rows">
            {rows.map((h) => {
              const minutes = (Date.parse(h.ended_at) - Date.parse(h.started_at)) / 60_000;
              const date = localDate(h.started_at, timezone);
              return (
                <div key={h.id} className="list-row" style={{ flexWrap: "wrap" }}>
                  <span className="icon">
                    <Activity size={15} />
                  </span>
                  <div className="grow">
                    <div className="truncate">{h.activity}</div>
                    <div className="sub">
                      {[shortDay(date), localTimeOf(h.started_at, timezone), fmtMinutes(minutes), h.energy_kcal ? `${fmt(h.energy_kcal)} kcal` : null, h.avg_hr ? `${fmt(h.avg_hr)} lpm` : null, h.source_name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {h.linked ? (
                    <>
                      <Chip tone="green">{h.linked.title}</Chip>
                      <ActionButton action={linkHealthAction} fields={{ id: h.id }} className="btn ghost sm icon-only" title="Separar">
                        <Unlink size={13} />
                      </ActionButton>
                    </>
                  ) : h.candidates.length ? (
                    h.candidates.map((c) => (
                      <ActionButton key={c.id} action={linkHealthAction} fields={{ id: h.id, workout_id: c.id }} className="btn sm" title={`Es ${c.title}`}>
                        <Link2 size={13} /> {c.title}
                      </ActionButton>
                    ))
                  ) : (
                    <Chip>Aparte</Chip>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
