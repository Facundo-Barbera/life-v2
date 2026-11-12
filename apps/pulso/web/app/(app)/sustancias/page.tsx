import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { AMOUNT_LABEL, CONTEXT_LABEL, fmtDay, fmtShortDate, getSubstanceOverview, localTime, type SubstanceOverview } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Bars, Chip, Empty, fmt, Label, Num, Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { archiveSubstance, deleteUseAction, moveSubstanceAction } from "./actions";
import { AddSubstance, EditSubstance, EditUse, GoalForm, LogUse } from "./forms";

export const metadata = { title: "Sustancias" };

const LEVEL_BG = ["var(--life-inner)", "color-mix(in oklab, var(--violet) 35%, var(--life-inner))", "color-mix(in oklab, var(--violet) 65%, var(--life-inner))", "var(--violet)"];
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export default async function Sustancias({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { client } = await requireMember();
  const o = await getSubstanceOverview(client, s);
  const active = o.substances.filter((x) => !x.archived);
  const current = o.substances.find((x) => x.id === o.summary.substanceId) ?? null;
  const clock = localTime(new Date(), o.tz);

  return (
    <>
      <TopLine title="Sustancias">
        <span className="chip">
          <Lock size={11} /> Privado
        </span>
        {active.length ? <LogUse substances={o.substances} defaultId={current?.id} today={o.today} now={clock} /> : null}
      </TopLine>

      <div className="row wrap between">
        <nav className="seg" aria-label="Sustancia">
          {active.map((x) => (
            <Link key={x.id} href={`/sustancias?s=${x.id}`} aria-current={x.id === current?.id ? "page" : undefined}>
              {x.name}
            </Link>
          ))}
          {active.length > 1 ? (
            <Link href="/sustancias?s=all" aria-current={o.summary.substanceId === null ? "page" : undefined}>
              Todas
            </Link>
          ) : null}
        </nav>
        <p className="tiny muted">
          Solo tú lo ves.{" "}
          {o.sharedWithCalendar ? "También aparece en el calendario de Life" : "No aparece en el calendario de Life"} ·{" "}
          <Link href="/ajustes" className="green">
            cambiar
          </Link>
        </p>
      </div>

      {active.length === 0 ? (
        <Panel>
          <Empty title="Nada que registrar" line="Archivaste todas. Reactiva una o añade otra." />
        </Panel>
      ) : (
        <>
          <Overview o={o} name={current?.name ?? "Todas"} unit={current?.unit ?? null} />
          <div className="cols-2">
            <Heatmap o={o} />
            <Patterns o={o} />
          </div>
          {current ? (
            <Panel title="Tu meta">
              <p className="small muted" style={{ marginBottom: 8 }}>
                Cuántos días a la semana como máximo. Es tuya: sirve para ver cómo vas, no para juzgarte.
              </p>
              <GoalForm substance={current} />
            </Panel>
          ) : null}
          <Correlations o={o} />
          <Entries o={o} clock={clock} />
        </>
      )}
      <Manage o={o} />
    </>
  );
}

function Overview({ o, name }: { o: SubstanceOverview; name: string; unit: string | null }) {
  const s = o.summary;
  const goal = s.goal;
  return (
    <Panel className="hero">
      <div className="stats">
        <div className="stat">
          <Label>Esta semana</Label>
          <Num value={s.daysThisWeek} unit={goal ? `de ${goal.maxDaysPerWeek} días` : s.daysThisWeek === 1 ? "día" : "días"} size="md" className={goal ? (goal.within ? "green" : "amber") : undefined} />
          {goal ? <span className="tiny muted">{goal.within ? "Dentro de tu meta" : "Por encima de tu meta"}</span> : <span className="tiny muted">{name}</span>}
        </div>
        <div className="stat">
          <Label>Promedio</Label>
          <Num value={s.avgDaysPerWeek === null ? "—" : fmt(s.avgDaysPerWeek, 1)} unit="días/sem" size="md" />
          <span className="tiny muted">semanas completas</span>
        </div>
        <div className="stat">
          <Label>Días sin</Label>
          <Num value={s.daysWithout ?? "—"} size="md" />
          <span className="tiny muted">más largo: {s.longestWithout}</span>
        </div>
        <div className="stat">
          <Label>Última vez</Label>
          <Num value={s.lastUse ? fmtShortDate(s.lastUse.date) : "—"} size="md" />
          <span className="tiny muted">{s.lastUse?.time ?? "sin registros"}</span>
        </div>
        {s.drinkDays !== undefined ? (
          <div className="stat">
            <Label>En Dieta</Label>
            <Num value={s.drinkDays} unit="días" size="md" />
            <span className="tiny muted">con alcohol anotado</span>
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 14 }}>
        <Bars values={s.weeks.map((w) => w.days)} max={7} height={44} highlight={s.weeks.length - 1} color="var(--violet)" labels={s.weeks.map((w, i) => (i === s.weeks.length - 1 ? "esta" : fmtShortDate(w.weekStart).split(" ")[0]!))} />
      </div>
    </Panel>
  );
}

function Heatmap({ o }: { o: SubstanceOverview }) {
  const days = o.summary.days;
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <Panel title="8 semanas">
      <div style={{ display: "grid", gridTemplateColumns: "20px repeat(8, 1fr)", gap: 4 }}>
        {WEEKDAYS.map((d, wd) => (
          <div key={d} style={{ display: "contents" }}>
            <span className="tiny dim mono">{d}</span>
            {weeks.map((w, i) => {
              const day = w[wd];
              return <div key={i} title={day ? `${fmtDay(day.date)} · ${day.uses} ${day.uses === 1 ? "vez" : "veces"}` : ""} style={{ height: 16, borderRadius: 4, background: day ? LEVEL_BG[day.level] : "transparent", outline: day?.date === o.today ? "1px solid var(--life-text)" : undefined }} />;
            })}
          </div>
        ))}
      </div>
      <div className="row tiny muted" style={{ marginTop: 8, gap: 6 }}>
        {["Nada", "Poco", "Normal", "Mucho"].map((l, i) => (
          <span key={l} className="row" style={{ gap: 4 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: LEVEL_BG[i], display: "inline-block" }} /> {l}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function Patterns({ o }: { o: SubstanceOverview }) {
  const s = o.summary;
  const total = s.timeOfDay.reduce((n, b) => n + b.uses, 0);
  const name = (id: string) => o.substances.find((x) => x.id === id)?.name ?? "—";
  return (
    <Panel title="Cuándo y cómo">
      {total === 0 ? (
        <p className="muted small">Sin registros en estas 8 semanas.</p>
      ) : (
        <div className="stack">
          <Bars values={s.timeOfDay.map((b) => b.uses)} labels={s.timeOfDay.map((b) => b.label)} height={40} color="var(--violet)" />
          {s.byForm.length ? <p className="small">{s.byForm.map((f) => `${f.form} ${f.uses}`).join(" · ")}</p> : null}
          {s.byContext.length ? <p className="small muted">{s.byContext.map((c) => `${CONTEXT_LABEL[c.context]} ${c.uses}`).join(" · ")}</p> : null}
          {s.bySubstance.length ? <p className="small muted">{s.bySubstance.map((b) => `${name(b.substanceId)} ${b.uses}`).join(" · ")}</p> : null}
        </div>
      )}
    </Panel>
  );
}

function Correlations({ o }: { o: SubstanceOverview }) {
  const shown = o.summary.correlations.filter((c) => c.enough && c.text);
  return (
    <Panel title="Con tu sueño y recuperación">
      {shown.length ? (
        <ul className="stack" style={{ listStyle: "none" }}>
          {shown.map((c) => (
            <li key={c.key} className="small">
              {c.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Hacen falta al menos 3 noches con y 3 sin consumo, con datos de sueño, para comparar.</p>
      )}
      <p className="tiny dim" style={{ marginTop: 8 }}>
        Comparaciones de tus propios datos; no prueban causa.
      </p>
    </Panel>
  );
}

function Entries({ o, clock }: { o: SubstanceOverview; clock: string }) {
  const name = (id: string) => o.substances.find((x) => x.id === id)?.name ?? "—";
  return (
    <Panel title={`Registros · 60 días · ${o.entries.length}`} className="tight">
      {o.entries.length === 0 ? <p className="muted small" style={{ padding: "8px 16px" }}>Nada anotado.</p> : null}
      <div className="rows">
        {o.entries.map((e) => (
          <div key={e.id} className="list-row">
            <span className="mono small muted" style={{ width: 92, flexShrink: 0 }}>
              {fmtShortDate(e.date)} {e.time}
            </span>
            <div className="grow">
              <div className="truncate">
                {name(e.substanceId)} <span className="muted small">{[e.form, AMOUNT_LABEL[e.amount].toLowerCase(), e.quantity != null ? `×${fmt(e.quantity, 1)}` : null, e.thcMg != null ? `${fmt(e.thcMg, 1)} mg THC` : null].filter(Boolean).join(" · ")}</span>
              </div>
              {e.context || e.note ? <div className="sub truncate">{[e.context ? CONTEXT_LABEL[e.context] : null, e.note].filter(Boolean).join(" · ")}</div> : null}
            </div>
            <EditUse substances={o.substances} use={e} today={o.today} now={clock} />
            <ActionButton action={deleteUseAction} fields={{ id: e.id }} className="btn ghost sm icon-only" title="Borrar" confirm="¿Borrar este registro?">
              <Trash2 size={13} />
            </ActionButton>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Manage({ o }: { o: SubstanceOverview }) {
  const active = o.substances.filter((x) => !x.archived);
  return (
    <Panel title="Qué registras" action={<AddSubstance />} className="tight">
      <div className="rows">
        {o.substances.map((x) => {
          const i = active.findIndex((a) => a.id === x.id);
          return (
            <div key={x.id} className="list-row" style={x.archived ? { opacity: 0.55 } : undefined}>
              <div className="grow">
                <div className="truncate">
                  {x.name} {x.builtin ? <Chip>Incluida</Chip> : null} {x.archived ? <Chip>Archivada</Chip> : null}
                </div>
                <div className="sub truncate">
                  {[x.unit, x.forms.join(", ") || null, x.maxDaysPerWeek !== null ? `meta ${x.maxDaysPerWeek} días/sem` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              {!x.archived ? (
                <>
                  <ActionButton action={moveSubstanceAction} fields={{ id: x.id, dir: "up" }} className="btn ghost sm icon-only" title="Subir">
                    <ArrowUp size={13} />
                  </ActionButton>
                  <ActionButton action={moveSubstanceAction} fields={{ id: x.id, dir: "down" }} className="btn ghost sm icon-only" title="Bajar">
                    <ArrowDown size={13} />
                  </ActionButton>
                </>
              ) : null}
              <EditSubstance substance={x} />
              <ActionButton action={archiveSubstance} fields={{ id: x.id, archived: !x.archived }} className="btn ghost sm icon-only" title={x.archived ? "Reactivar" : "Archivar"} confirm={x.archived || i < 0 ? undefined : `¿Archivar ${x.name}? Su historial se queda.`}>
                {x.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
              </ActionButton>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
