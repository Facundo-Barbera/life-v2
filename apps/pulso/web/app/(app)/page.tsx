import { Check, Dumbbell, HeartPulse, Moon, Pill, Play, Scale, Utensils } from "lucide-react";
import Link from "next/link";
import type { LifeClient } from "@life/db";
import {
  fmtDay,
  fmtMinutes,
  getBodySummary,
  getLastNight,
  getMedicationDay,
  getNutritionDay,
  getReadiness,
  getSettings,
  getTrainingToday,
  localDate,
  localTime,
} from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Chip, Empty, fmt, ListRow, Meter, Num, Panel, Ring, Rows, Sparkline, Stat, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { recordDoseAction } from "./medicacion/actions";

export const metadata = { title: "Hoy" };

const READY = { high: "Listo para entrenar", medium: "Preparación media", low: "Mejor suave hoy", unknown: "Sin medición todavía" } as const;
const PACE = { bien: "Vas bien", adelantado: "Vas adelantado", atrasado: "Vas atrasado", pasado: "Te pasaste" } as const;
const PACE_TONE = { bien: "green", adelantado: "amber", atrasado: "blue", pasado: "red" } as const;
const WEEK_STATUS = { done: "hecho", partial: "a medias", missed: "sin hacer", planned: "por hacer", skipped: "saltado" } as const;

/** Never let one broken section take Hoy down. */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error("[hoy]", e);
    return null;
  }
}

async function load(client: LifeClient) {
  const settings = await getSettings(client);
  const today = localDate(new Date(), settings.timezone);
  const now = localTime(new Date(), settings.timezone);
  const [readiness, training, doses, night, food, body] = await Promise.all([
    safe(() => getReadiness(client)),
    safe(() => getTrainingToday(client)),
    safe(() => getMedicationDay(client, today, now)),
    safe(() => getLastNight(client)),
    safe(() => getNutritionDay(client, today)),
    safe(() => getBodySummary(client)),
  ]);
  return { settings, today, readiness, training, doses, night, food, body };
}

/**
 * Hoy: the day at a glance (readiness and the workout), then what needs doing
 * (doses, the week), and how the body is doing (last night, food, weight).
 * Every panel leads to its destination, and each destination leads back here.
 */
export default async function Hoy() {
  const { client } = await requireMember();
  const v = await load(client);
  return (
    <>
      <TopLine title={fmtDay(v.today)} back={null}>
        <Link href="/ajustes" className="chip">
          {v.settings.timezone.split("/").pop()?.replace("_", " ")}
        </Link>
      </TopLine>
      <Hero readiness={v.readiness} training={v.training} />
      <div className="cols-2">
        <Doses doses={v.doses} today={v.today} />
        <Week training={v.training} />
      </div>
      <div className="cols-3">
        <Sleep night={v.night} />
        <Food food={v.food} />
        <Weight body={v.body} />
      </div>
    </>
  );
}

type V = Awaited<ReturnType<typeof load>>;

function Hero({ readiness, training }: { readiness: V["readiness"]; training: V["training"] }) {
  const score = readiness?.score ?? null;
  const live = training?.inProgress ?? null;
  const done = training?.doneToday?.[0] ?? null;
  const next = training?.next ?? null;
  return (
    <section className="panel hero accent" style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", alignItems: "center" }}>
      <div className="row" style={{ gap: 16 }}>
        <Ring value={score == null ? null : score / 100} size={104} stroke={10} label={score != null ? `Preparación ${Math.round(score)} de 100` : "Sin medición"}>
          {score != null ? <Num value={Math.round(score)} size="lg" /> : <HeartPulse size={22} className="muted" />}
        </Ring>
        <div className="grow stack" style={{ gap: 4 }}>
          <span className="label">Preparación</span>
          <span className="title lg">{READY[readiness?.level ?? "unknown"]}</span>
          <span className="small muted">{readiness?.explanation ?? "Sincroniza Salud desde el teléfono para ver tu VFC, pulso en reposo y sueño."}</span>
          {readiness ? (
            <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
              <Chip>VFC {fmt(readiness.hrv)} ms</Chip>
              <Chip>Reposo {fmt(readiness.restingHr)} lpm</Chip>
              <Chip>Sueño {fmtMinutes(readiness.sleepMin)}</Chip>
            </div>
          ) : null}
        </div>
      </div>
      <div className="inner" style={{ padding: 14 }}>
        {live ? (
          <div className="row">
            <span className="icon" style={{ color: "var(--life-green)" }}><Dumbbell size={18} /></span>
            <div className="grow">
              <span className="label green">En curso</span>
              <div className="title truncate">{live.title}</div>
            </div>
            <Link href={`/entreno/sesion?workout=${live.id}`} className="btn accent">
              <Play size={14} fill="currentColor" /> Seguir
            </Link>
          </div>
        ) : done ? (
          <div className="row">
            <span className="icon" style={{ color: "var(--life-green)" }}><Check size={18} /></span>
            <div className="grow">
              <span className="label">Hoy entrenaste</span>
              <div className="title truncate">{done.title}</div>
              <span className="tiny muted">
                {[done.minutes ? fmtMinutes(done.minutes) : null, done.sets ? `${done.sets} ${done.sets === 1 ? "serie" : "series"}` : null, done.energyKcal ? `${fmt(done.energyKcal)} kcal` : null].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
        ) : next ? (
          <div className="row">
            <div className="grow">
              <span className="label green">
                {next.workout.local_date && training?.today?.id === next.workout.id ? "Hoy toca" : "Siguiente"}
                {next.workout.local_date ? ` · ${fmtDay(next.workout.local_date).toUpperCase()}` : ""}
              </span>
              <div className="title truncate">{next.workout.title}</div>
              <span className="tiny muted">
                {[next.workout.focus, `${next.exercises} ${next.exercises === 1 ? "ejercicio" : "ejercicios"}`, next.minutes ? `~${next.minutes} min` : null].filter(Boolean).join(" · ")}
              </span>
            </div>
            <Link href={`/entreno/sesion?workout=${next.workout.id}`} className="btn accent">
              <Play size={14} fill="currentColor" /> Empezar
            </Link>
          </div>
        ) : (
          <div className="row">
            <span className="icon"><Dumbbell size={18} /></span>
            <div className="grow">
              <div className="title">{training?.week ? "Semana completa" : "Sin rutina activa"}</div>
              <span className="tiny muted">{training?.week ? "La siguiente empieza el lunes." : "Arma tu bloque de entreno."}</span>
            </div>
            {training?.week ? null : (
              <Link href="/entreno" className="btn">Crear</Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Doses({ doses, today }: { doses: V["doses"]; today: string }) {
  const pending = doses?.slots.filter((s) => s.status === "pendiente" || s.status === "pospuesta") ?? [];
  return (
    <Panel className="tight" title={<><Pill size={12} style={{ verticalAlign: -1 }} /> Tomas de hoy</>} href="/medicacion">
      {!doses ? (
        <div className="list-row muted small">No se pudo leer la medicación.</div>
      ) : doses.medications === 0 ? (
        <div className="list-row">
          <Empty title="Sin medicación" line="Anota lo que tomas y aquí verás cuándo toca.">
            <Link href="/medicacion" className="btn sm">Añadir</Link>
          </Empty>
        </div>
      ) : doses.total === 0 ? (
        <div className="list-row muted small">Hoy no toca ninguna.</div>
      ) : pending.length === 0 ? (
        <ListRow icon={<Check size={16} className="green" />} title="Todo tomado" sub={`${doses.taken} de ${doses.total}`} />
      ) : (
        <Rows>
          {pending.slice(0, 5).map((s) => (
            <ListRow
              key={`${s.medicationId}-${s.slot}`}
              title={s.name}
              sub={[s.time ?? s.slot, `${fmt(s.dose, 2)} ${s.unit}`, s.status === "pospuesta" ? "pospuesta" : null].filter(Boolean).join(" · ")}
              trailing={
                <ActionButton action={recordDoseAction} fields={{ medicationId: s.medicationId, date: today, slot: s.slot, status: "tomada" }} className="btn sm accent">
                  Tomar
                </ActionButton>
              }
            />
          ))}
          <div className="list-row tiny muted">
            {doses.taken} de {doses.total} tomadas{pending.length > 5 ? ` · ${pending.length - 5} más` : ""}
          </div>
        </Rows>
      )}
    </Panel>
  );
}

function Week({ training }: { training: V["training"] }) {
  const week = training?.week ?? null;
  return (
    <Panel title={<><Dumbbell size={12} style={{ verticalAlign: -1 }} /> Tu semana</>} href="/entreno">
      {week ? (
        <div className="stack">
          <span className="small muted">
            {week.program} · semana {week.number} de {week.weeks}
            {week.deload ? " · descarga" : ""}
          </span>
          <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
            <Num value={week.done} size="lg" />
            <span className="muted">de {week.days.length} {week.days.length === 1 ? "día" : "días"}</span>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {week.days.map((d) => (
              <span key={d.id} className={`chip ${d.status === "done" ? "green" : d.status === "partial" ? "amber" : ""}`} title={`${d.name}: ${WEEK_STATUS[d.status]}`} style={d.status === "missed" || d.status === "skipped" ? { textDecoration: "line-through" } : undefined}>
                {d.status === "done" ? <Check size={11} /> : null}
                {d.name}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <Empty title="Sin rutina activa" line="Crea un bloque con tus días de entreno.">
          <Link href="/entreno" className="btn sm">Ir a Entreno</Link>
        </Empty>
      )}
    </Panel>
  );
}

function Sleep({ night }: { night: V["night"] }) {
  return (
    <Panel title={<><Moon size={12} style={{ verticalAlign: -1 }} /> Anoche</>} href="/sueno">
      {night ? (
        <div className="stack">
          <Num value={fmtMinutes(night.asleepMin)} size="md" />
          {night.targetMin ? <Meter value={night.asleepMin} max={night.targetMin} color={night.asleepMin >= night.targetMin ? undefined : "var(--life-blue)"} /> : null}
          <span className="tiny muted">
            {new Date(night.start).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} – {new Date(night.end).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
            {night.targetMin ? ` · meta ${fmtMinutes(night.targetMin)}` : ""}
            {night.source === "manual" ? " · a mano" : ""}
          </span>
        </div>
      ) : (
        <Empty title="Sin noche registrada" line="Llega de Salud o anótala a mano.">
          <Link href="/sueno" className="btn sm">Anotar</Link>
        </Empty>
      )}
    </Panel>
  );
}

function Food({ food }: { food: V["food"] }) {
  if (!food)
    return (
      <Panel title={<><Utensils size={12} style={{ verticalAlign: -1 }} /> Comida</>} href="/dieta">
        <p className="muted small">No se pudo leer la dieta.</p>
      </Panel>
    );
  const left = food.budget.kcal - food.eaten.kcal;
  return (
    <Panel title={<><Utensils size={12} style={{ verticalAlign: -1 }} /> Comida</>} href="/dieta" action={food.pace ? <Chip tone={PACE_TONE[food.pace]}>{PACE[food.pace]}</Chip> : null}>
      <div className="stack">
        <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
          <Num value={fmt(food.eaten.kcal)} size="md" />
          <span className="muted small">de {fmt(food.budget.kcal)} kcal</span>
        </div>
        <Meter value={food.eaten.kcal} max={food.budget.kcal} mark={food.expectedNow} color={left < 0 ? "var(--red)" : undefined} />
        <span className="tiny muted">
          {left >= 0 ? `Te quedan ${fmt(left)} kcal` : `${fmt(-left)} kcal de más`} · P {fmt(food.eaten.protein)}/{fmt(food.budget.protein)} g · agua {fmt(food.waterMl / 1000, 1)} L
        </span>
        {food.nextPlanned ? <span className="tiny">Sigue: {food.nextPlanned.name ?? food.nextPlanned.slot}{food.nextPlanned.time ? ` · ${food.nextPlanned.time.slice(0, 5)}` : ""}</span> : null}
      </div>
    </Panel>
  );
}

function Weight({ body }: { body: V["body"] }) {
  const m = body?.morning ?? null;
  const e = body?.evening ?? null;
  return (
    <Panel title={<><Scale size={12} style={{ verticalAlign: -1 }} /> Peso</>} href="/cuerpo">
      {m || e ? (
        <div className="stack">
          <div className="stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Stat label="Mañana" value={m ? fmt(m.weight_kg, 1) : "—"} unit="kg" />
            <Stat label="Noche" value={e ? fmt(e.weight_kg, 1) : "—"} unit="kg" />
          </div>
          <Sparkline values={body?.series7 ?? []} target={body?.goal.weightKg ?? null} />
          <span className="tiny muted">
            {body?.trend ? `Tendencia ${body.trend.slopePerWeek >= 0 ? "+" : ""}${fmt(body.trend.slopePerWeek, 2)} kg/sem` : "Sin tendencia aún"}
            {body?.goal.weightKg ? ` · meta ${fmt(body.goal.weightKg, 1)} kg` : ""}
          </span>
        </div>
      ) : (
        <Empty title="Sin pesajes" line="Pésate en la mañana; la noche se cuenta aparte.">
          <Link href="/cuerpo" className="btn sm">Pesarme</Link>
        </Empty>
      )}
    </Panel>
  );
}
