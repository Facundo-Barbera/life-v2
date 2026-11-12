import { HeartPulse, Moon, Trash2 } from "lucide-react";
import { addDays, clockOf, fmtDay, fmtMinutes, fmtShortDate, getReadiness, getSleepOverview, type SleepNight, type SleepSummary } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Bars, Chip, Empty, Label, Num, Panel, Ring, Sparkline, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { deleteManualNightAction } from "./actions";
import { AddNight, EditNight, TargetForm } from "./forms";

export const metadata = { title: "Sueño" };

const STAGES = [
  { key: "deep", label: "Profundo", color: "var(--life-blue)" },
  { key: "core", label: "Ligero", color: "color-mix(in oklab, var(--life-blue) 55%, var(--life-inner))" },
  { key: "rem", label: "REM", color: "var(--violet)" },
  { key: "awake", label: "Despierto", color: "var(--life-amber)" },
] as const;

const LEVEL = { high: "Lista para exigirte", medium: "Recuperación media", low: "Mejor suave hoy", unknown: "Sin medición todavía" } as const;

export default async function Sueno() {
  const { client } = await requireMember();
  const [o, readiness] = await Promise.all([getSleepOverview(client, 30), getReadiness(client)]);
  const last = o.nights[0] && o.nights[0].night >= addDays(o.today, -1) ? o.nights[0] : null;
  const chron = [...o.nights].reverse();

  return (
    <>
      <TopLine title={`Sueño · ${fmtDay(o.today)}`}>
        <AddNight today={o.today} />
      </TopLine>

      <div className="cols-2">
        <LastNight night={last} target={o.targetMin} />
        <Panel title="Recuperación de hoy">
          <div className="row" style={{ gap: 16 }}>
            <Ring value={readiness.score === null ? null : readiness.score / 100} size={84} stroke={8} label={readiness.score === null ? "Sin medición" : `Recuperación ${readiness.score} de 100`}>
              {readiness.score === null ? <HeartPulse size={20} className="muted" /> : <Num value={readiness.score} size="md" />}
            </Ring>
            <div className="grow stack" style={{ gap: 4 }}>
              <span className="strong">{LEVEL[readiness.level]}</span>
              <span className="small muted">{readiness.explanation}</span>
            </div>
          </div>
          <div className="stats" style={{ marginTop: 12 }}>
            {readiness.factors.map((f) => (
              <div key={f.key} className="stat">
                <Label>{f.label}</Label>
                <Num value={f.value === null ? "—" : f.key === "sleep" ? fmtMinutes(f.value) : Math.round(f.value)} unit={f.value === null || f.key === "sleep" ? undefined : f.key === "hrv" ? "ms" : "lpm"} size="sm" />
                <span className="tiny muted">{f.detail}</span>
              </div>
            ))}
          </div>
          {readiness.days.some((d) => d.hrv !== null) ? (
            <div style={{ marginTop: 10 }}>
              <Label>VFC · 15 días</Label>
              <Sparkline values={readiness.days.map((d) => d.hrv)} color="var(--life-blue)" />
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title={`30 noches · meta ${fmtMinutes(o.targetMin)}`}>
        {chron.length ? (
          <>
            <Bars values={chron.map((n) => n.minutes.asleep)} max={Math.max(o.targetMin * 1.25, ...chron.map((n) => n.minutes.asleep))} height={72} highlight={chron.length - 1} color="var(--life-blue)" labels={chron.map((n, i) => (i === 0 || i === chron.length - 1 || i % 7 === 0 ? fmtShortDate(n.night).split(" ")[0]! : ""))} />
            <div className="cols-2" style={{ marginTop: 14 }}>
              <Summary title="14 noches" s={o.last14} />
              <Summary title="30 noches" s={o.last30} />
            </div>
          </>
        ) : (
          <Empty title="Sin noches todavía" line="Pulso lee tu sueño de Salud desde el iPhone. También puedes anotar una noche a mano." />
        )}
      </Panel>

      <div className="cols-2">
        <Panel title="Noches" className="tight">
          <div className="rows">
            {o.nights.map((n) => (
              <NightRow key={n.id} n={n} today={o.today} />
            ))}
            {o.hidden.map((n) => (
              <div key={n.id} className="list-row" style={{ opacity: 0.5 }}>
                <div className="grow">
                  <div className="truncate">{fmtDay(n.night)} · a mano</div>
                  <div className="sub">Oculta: Salud midió esa noche</div>
                </div>
                <ActionButton action={deleteManualNightAction} fields={{ id: n.id }} className="btn ghost sm icon-only" title="Borrar" confirm="¿Borrar la noche anotada a mano?">
                  <Trash2 size={13} />
                </ActionButton>
              </div>
            ))}
            {!o.nights.length && !o.hidden.length ? <p className="muted small" style={{ padding: "8px 16px" }}>Nada en los últimos 30 días.</p> : null}
          </div>
        </Panel>
        <Panel title="Meta de sueño">
          <p className="small muted" style={{ marginBottom: 8 }}>
            Cuánto quieres dormir. Mide la deuda y la puntuación de cada noche.
          </p>
          <TargetForm hours={o.targetMin / 60} />
        </Panel>
      </div>
    </>
  );
}

function LastNight({ night, target }: { night: SleepNight | null; target: number }) {
  if (!night) {
    return (
      <Panel title="Anoche" className="hero">
        <Empty title="Sin datos de anoche" line="Cuando el iPhone sincronice con Salud aparece aquí, o anótala a mano." />
      </Panel>
    );
  }
  const m = night.minutes;
  const total = m.deep + m.core + m.rem + m.awake || 1;
  return (
    <Panel title={`Anoche · ${night.source === "manual" ? "a mano" : "Salud"}`} className="hero">
      <div className="row" style={{ gap: 16 }}>
        <Ring value={night.score.value / 100} size={96} stroke={9} color="var(--life-blue)" label={`Puntuación ${night.score.value} de 100`}>
          <div className="stack" style={{ gap: 0, justifyItems: "center" }}>
            <Num value={night.score.value} size="md" />
            <span className="tiny dim mono">PTS</span>
          </div>
        </Ring>
        <div className="grow stack" style={{ gap: 4 }}>
          <Num value={fmtMinutes(m.asleep)} size="lg" />
          <span className="small muted">
            {clockOf(night.bedtimeMin)} → {clockOf(night.wakeMin)} · {m.asleep >= target ? "llegaste a tu meta" : `${fmtMinutes(target - m.asleep)} bajo tu meta`}
          </span>
          <span className="small">{night.score.explanation}</span>
        </div>
      </div>
      {night.stagePct ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "var(--life-inner)" }}>
            {STAGES.map((s) => (
              <i key={s.key} style={{ width: `${(m[s.key] / total) * 100}%`, background: s.color }} />
            ))}
          </div>
          <div className="row wrap tiny muted" style={{ marginTop: 6 }}>
            {STAGES.map((s) => (
              <span key={s.key} className="row" style={{ gap: 4 }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                {s.label} {fmtMinutes(m[s.key])}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="stats" style={{ marginTop: 12 }}>
        {night.score.factors.map((f) => (
          <div key={f.key} className="stat">
            <Label>{f.label}</Label>
            <Num value={f.points} unit={`/${f.maxPoints}`} size="sm" />
            <span className="tiny muted">{f.detail}</span>
          </div>
        ))}
      </div>
      {night.insights.length ? (
        <ul className="stack small" style={{ listStyle: "none", marginTop: 10 }}>
          {night.insights.map((t) => (
            <li key={t}>· {t}</li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function Summary({ title, s }: { title: string; s: SleepSummary }) {
  return (
    <div className="inner stack">
      <Label>{title}</Label>
      <div className="stats">
        <div className="stat">
          <Label>Promedio</Label>
          <Num value={fmtMinutes(s.avgAsleepMin)} size="sm" />
        </div>
        <div className="stat">
          <Label>Deuda</Label>
          <Num value={fmtMinutes(s.debtMin)} size="sm" className={s.debtMin >= 60 ? "amber" : undefined} />
        </div>
        <div className="stat">
          <Label>Regularidad</Label>
          <Num value={s.regularity ?? "—"} size="sm" />
        </div>
        <div className="stat">
          <Label>Horario</Label>
          <Num value={`${clockOf(s.avgBedtimeMin)}–${clockOf(s.avgWakeMin)}`} size="sm" />
        </div>
      </div>
      {s.insights.map((t) => (
        <span key={t} className="small muted">
          {t}
        </span>
      ))}
    </div>
  );
}

function NightRow({ n, today }: { n: SleepNight; today: string }) {
  const manual = n.source === "manual";
  const offset = n.tzOffsetMin * 60_000;
  const hhmm = (ms: number) => new Date(ms + offset).toISOString().slice(11, 16);
  return (
    <div className="list-row">
      <span className="icon">
        <Moon size={15} />
      </span>
      <div className="grow">
        <div className="truncate">
          <span className="strong">{fmtMinutes(n.minutes.asleep)}</span> <span className="muted small">{fmtDay(n.night)}</span>
        </div>
        <div className="sub truncate">
          {clockOf(n.bedtimeMin)} → {clockOf(n.wakeMin)}
          {n.note ? ` · ${n.note}` : ""}
        </div>
      </div>
      <Chip tone={n.score.value >= 80 ? "green" : n.score.value >= 60 ? undefined : "amber"}>{n.score.value}</Chip>
      {manual ? (
        <>
          <Chip>A mano</Chip>
          <EditNight night={{ id: n.id, night: n.night, asleep: hhmm(n.inBedStart), wake: hhmm(n.inBedEnd), note: n.note }} today={today} />
          <ActionButton action={deleteManualNightAction} fields={{ id: n.id }} className="btn ghost sm icon-only" title="Borrar" confirm="¿Borrar esta noche?">
            <Trash2 size={13} />
          </ActionButton>
        </>
      ) : null}
    </div>
  );
}

