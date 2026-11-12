import { Trash2 } from "lucide-react";
import {
  type BodyGauge, type BodyMetric, fmtDay, fmtShortDate, GOAL_MODE_LABEL, getBodyOverview, localDate, localTime,
  METRIC_LABEL, type Projection, type ScanView,
} from "@life/db/pulso";
import type { WeighIn, WeightUnit } from "@life/db";
import { ActionButton } from "@/components/client";
import { Chip, Empty, fmt, Meter, Num, Panel, Sparkline, Stat, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { deleteScanAction, deleteWeighInAction } from "./actions";
import { BodyMap } from "./body-map";
import { EditWeighInSheet, GoalSheet, ImportForm, ScanSheet, TargetSheet, WeighInSheet } from "./forms";

export const metadata = { title: "Cuerpo" };

const LB = 0.45359237;
const inUnit = (kg: number | null | undefined, unit: WeightUnit) => (kg == null ? null : unit === "lb" ? kg / LB : kg);
const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmt(Math.abs(n), digits)}`;
const TOD_LABEL = { morning: "Mañana", evening: "Noche", unknown: "Otro" } as const;
const BAND_TONE = { low: "amber", normal: "green", high: "amber" } as const;
const BAND_LABEL = { low: "Bajo", normal: "Normal", high: "Alto" } as const;
const GAUGE_LABEL: Record<BodyGauge["metric"], string> = {
  weight: "Peso", skeletalMuscleMass: "Músculo esquelético", bodyFatMass: "Masa grasa", bmi: "IMC", percentBodyFat: "% grasa", visceralFatLevel: "Grasa visceral",
};

export default async function Cuerpo() {
  const { client } = await requireMember();
  const o = await getBodyOverview(client);
  const unit = o.settings.weight_unit;
  const tz = o.settings.timezone;
  const today = o.days[o.days.length - 1]!;
  const weight = o.projections.find((p) => p.metric === "weight");
  const latestScan = o.views[0] ?? null;
  const fullScan = o.views.find((s) => s.skeletalMuscleMass != null || s.bodyFatMass != null || s.totalBodyWater != null) ?? null;
  const b = o.budget;
  const goalTarget = (m: BodyMetric) => o.goals.find((g) => g.metric === m)?.target ?? (m === "weight" ? o.settings.goal_weight_kg : null);

  return (
    <>
      <TopLine title={`Cuerpo · ${fmtDay(o.today)}`}>
        <WeighInSheet unit={unit} />
        <ScanSheet />
      </TopLine>

      <div className="cols-3">
        <Panel title="Pesajes de hoy" className="hero">
          <div className="cols-2" style={{ gap: 8 }}>
            <div className="inner stat">
              <span className="label">Mañana</span>
              <Num value={today.morning != null ? fmt(inUnit(today.morning, unit), 1) : "—"} unit={unit} size="lg" />
            </div>
            <div className="inner stat">
              <span className="label">Noche</span>
              <Num value={today.evening != null ? fmt(inUnit(today.evening, unit), 1) : "—"} unit={unit} size="lg" />
            </div>
          </div>
          <div className="row between small" style={{ marginTop: 10 }}>
            <span className="muted">Oscilación de hoy</span>
            <span className="strong">{today.swing != null ? `${signed(inUnit(today.swing, unit)!)} ${unit}` : "—"}</span>
          </div>
          <div className="row between small" style={{ marginTop: 4 }}>
            <span className="muted">Promedio 30 días</span>
            <span className="strong">{o.swing != null ? `${signed(inUnit(o.swing, unit)!)} ${unit}` : "—"}</span>
          </div>
          <p className="tiny dim" style={{ marginTop: 8 }}>Mañana y noche son series distintas: la de la mañana marca la tendencia.</p>
        </Panel>

        <Panel title="Tendencia (mañana)" className="hero">
          {weight?.current != null ? (
            <>
              <div className="row between">
                <Num value={fmt(inUnit(weight.current, unit), 1)} unit={unit} size="xl" />
                <Chip tone={weight.slopePerWeek! < -0.05 ? "green" : weight.slopePerWeek! > 0.05 ? "amber" : undefined}>
                  {signed(inUnit(weight.slopePerWeek!, unit)!, 2)} {unit}/sem
                </Chip>
              </div>
              <div style={{ marginTop: 10 }}>
                <Sparkline values={o.days.map((d) => inUnit(d.morning, unit))} target={inUnit(goalTarget("weight"), unit)} />
                <Sparkline values={o.days.map((d) => inUnit(d.evening, unit))} color="var(--life-blue)" height={28} />
              </div>
              <div className="row small" style={{ gap: 12, marginTop: 4 }}>
                <span className="green">— mañana</span>
                <span className="blue">— noche</span>
                <span className="muted grow right">30 días</span>
              </div>
            </>
          ) : (
            <Empty title="Sin tendencia todavía" line={weight?.note ?? "Pésate unas mañanas, en días distintos, para ver hacia dónde vas."} />
          )}
        </Panel>

        <Panel title="La meta decide el presupuesto" className="hero accent" action={<GoalSheet unit={unit} goal={inUnit(o.settings.goal_weight_kg, unit)} mode={o.settings.goal_mode} reachBy={o.settings.goal_reach_by} kcalTarget={o.settings.kcal_target} />}>
          <div className="row between">
            <Num value={fmt(b.kcal)} unit="kcal/día" size="xl" />
            <Chip tone={b.source === "manual" ? "blue" : b.source === "meta" ? "green" : undefined}>{b.source === "manual" ? "A mano" : b.source === "meta" ? "Por meta" : "Mantener"}</Chip>
          </div>
          <div className="stats" style={{ marginTop: 10 }}>
            <Stat label="Meta" value={o.settings.goal_weight_kg != null ? fmt(inUnit(o.settings.goal_weight_kg, unit), 1) : "—"} unit={unit} hint={o.settings.goal_reach_by ? `para el ${fmtShortDate(o.settings.goal_reach_by)}` : o.settings.goal_mode ? GOAL_MODE_LABEL[o.settings.goal_mode] : undefined} />
            <Stat label="Ritmo" value={b.kgPerWeek != null ? signed(inUnit(b.kgPerWeek, unit)!, 2) : "—"} unit={`${unit}/sem`} />
            <Stat label="Semanas" value={b.weeksToGoal ?? "—"} hint={b.tdee ? `mant. ${fmt(b.tdee)} kcal` : undefined} />
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>{b.explanation}</p>
          <p className="tiny dim mono" style={{ marginTop: 6 }}>P {b.protein} g · C {b.carbs} g · G {b.fat} g · Fibra {b.fiber} g</p>
        </Panel>
      </div>

      <div className="cols-2">
        <Panel title="Pesajes" className="tight">
          <WeighInList weighIns={o.weighIns.slice(0, 20)} unit={unit} tz={tz} />
        </Panel>
        <Panel title="Proyecciones">
          {o.projections.length ? (
            <div className="stack">
              {o.projections.map((p) => <ProjectionRow key={p.metric} p={p} target={goalTarget(p.metric)} />)}
              {o.eveningProjection.current != null ? (
                <p className="tiny muted">Noche: {fmt(o.eveningProjection.current, 1)} kg · {o.eveningProjection.note}</p>
              ) : null}
            </div>
          ) : (
            <Empty title="Sin datos para proyectar" line="Con tres mediciones en días distintos, separadas por una semana, verás dónde estarás en 4, 8 y 12 semanas." />
          )}
        </Panel>
      </div>

      {latestScan ? (
        <>
          <div className="cols-3">
            <Panel title={`Composición${fullScan && fullScan !== latestScan ? ` · ${fmtShortDate(localDate(fullScan.measuredAt, tz))}` : ""}`}>
              {fullScan ? <Composition s={fullScan} /> : <Empty title="Sin composición" line="El último escaneo solo trae el peso." />}
            </Panel>
            <Panel title="Por segmento">
              {o.analysis.segments ? <BodyMap segments={o.analysis.segments} /> : <Empty title="Sin segmentos" line="Los escaneos de InBody traen brazos, tronco y piernas." />}
            </Panel>
            <Panel title="Músculo y grasa">
              {o.analysis.muscleFat || o.analysis.obesity.length ? (
                <div className="stack">
                  {o.analysis.muscleFat?.gauges.map((g) => <GaugeRow key={g.metric} g={g} />)}
                  {o.analysis.obesity.map((g) => <GaugeRow key={g.metric} g={g} />)}
                  {o.analysis.basis ? (
                    <p className="tiny muted">Estándar para {o.analysis.basis.heightCm} cm{o.analysis.basis.heightFrom === "scan" ? " (estatura tomada del escaneo)" : ""}: {o.analysis.basis.standardWeight} kg.</p>
                  ) : <p className="tiny muted">Agrega tu estatura y sexo en Ajustes para compararte con el estándar.</p>}
                </div>
              ) : <Empty title="Sin análisis" line="Necesita peso, músculo y grasa de un escaneo, y tu estatura." />}
            </Panel>
          </div>

          <Evolution views={o.views} tz={tz} />

          <Panel title={`Historial · ${o.scans.length} ${o.scans.length === 1 ? "medición" : "mediciones"}`} className="tight">
            <div className="rows">
              {o.views.slice(0, 30).map((s, i) => <ScanRow key={s.id} s={s} older={o.views.slice(i + 1)} tz={tz} />)}
            </div>
          </Panel>
        </>
      ) : null}

      <Panel title="Importar InBody">
        <p className="small muted" style={{ marginBottom: 10 }}>
          Pega el texto del QR de tu hoja (léelo con la cámara del teléfono) o sube el CSV que exporta la app de InBody. Una prueba importada dos veces queda una sola.
        </p>
        <ImportForm />
      </Panel>
    </>
  );
}

function WeighInList({ weighIns, unit, tz }: { weighIns: WeighIn[]; unit: WeightUnit; tz: string }) {
  if (!weighIns.length) {
    return (
      <div style={{ padding: "6px 16px 12px" }}>
        <Empty title="Sin pesajes" line="Anota tu peso de la mañana (y si quieres, el de la noche).">
          <WeighInSheet unit={unit} label="Primer pesaje" />
        </Empty>
      </div>
    );
  }
  return (
    <div className="rows">
      {weighIns.map((w) => {
        const date = localDate(w.measured_at, tz);
        const time = localTime(w.measured_at, tz);
        const value = inUnit(Number(w.weight_kg), unit)!;
        return (
          <div key={w.id} className="list-row">
            <Chip tone={w.time_of_day === "morning" ? "green" : w.time_of_day === "evening" ? "blue" : undefined}>{TOD_LABEL[w.time_of_day]}</Chip>
            <div className="grow">
              <div><span className="num sm">{fmt(value, 1)}</span><span className="unit">{unit}</span></div>
              <div className="sub">{fmtDay(date)} · {time}{w.source !== "manual" ? ` · ${w.source === "healthkit" ? "Salud" : w.source}` : ""}</div>
            </div>
            <EditWeighInSheet id={w.id} weight={Math.round(value * 100) / 100} unit={unit} date={date} time={time} timeOfDay={w.time_of_day} />
            <ActionButton action={deleteWeighInAction} fields={{ id: w.id }} className="btn ghost sm icon-only" confirm="¿Borrar este pesaje?" title="Borrar">
              <Trash2 size={13} />
            </ActionButton>
          </div>
        );
      })}
    </div>
  );
}

function ProjectionRow({ p, target }: { p: Projection; target: number | null }) {
  const unit = p.unit;
  return (
    <div className="inner stack" style={{ gap: 6 }}>
      <div className="row between">
        <span className="label">{METRIC_LABEL[p.metric]}</span>
        <TargetSheet metric={p.metric} label={METRIC_LABEL[p.metric]} unit={unit} target={target} />
      </div>
      <div className="row between">
        <Num value={p.current != null ? fmt(p.current, 1) : fmt(p.observed[p.observed.length - 1]?.value, 1)} unit={unit} size="md" />
        <span className="small muted">{p.note}</span>
      </div>
      {p.observed.length > 1 ? <Sparkline values={p.observed.map((r) => r.value)} target={target} height={32} /> : null}
      {p.horizons.length ? (
        <div className="row small" style={{ gap: 12 }}>
          {p.horizons.map((h) => (
            <span key={h.weeks} title={`${fmt(h.low, 1)}–${fmt(h.high, 1)} ${unit}`}>
              <span className="muted">{h.weeks} sem </span>
              <span className="strong">{fmt(h.value, 1)}</span>
              <span className="dim tiny"> ±{fmt((h.high - h.low) / 2, 1)}</span>
            </span>
          ))}
        </div>
      ) : null}
      {p.goal ? <p className="tiny green">{p.goal.message}</p> : null}
    </div>
  );
}

function Composition({ s }: { s: ScanView }) {
  const w = s.weight;
  const parts: { label: string; kg: number | null; color: string }[] = [
    { label: "Músculo", kg: s.skeletalMuscleMass, color: "var(--life-green)" },
    { label: "Grasa", kg: s.bodyFatMass, color: "var(--life-amber)" },
    { label: "Agua", kg: s.totalBodyWater, color: "var(--life-blue)" },
  ];
  return (
    <div className="stack">
      {w ? (
        <div className="row between">
          <Num value={fmt(w, 1)} unit="kg" size="lg" />
          {s.percentBodyFat != null ? <Chip tone="amber">{fmt(s.percentBodyFat, 1)} % grasa</Chip> : null}
        </div>
      ) : null}
      {parts.map((p) =>
        p.kg != null ? (
          <div key={p.label} className="stack" style={{ gap: 4 }}>
            <div className="row between small">
              <span className="muted">{p.label}</span>
              <span><span className="strong">{fmt(p.kg, 1)}</span> kg{w ? <span className="muted"> · {fmt((p.kg / w) * 100, 0)} %</span> : null}</span>
            </div>
            <Meter value={p.kg} max={w ?? p.kg} color={p.color} />
          </div>
        ) : null,
      )}
      <div className="stats">
        {s.bmr != null ? <Stat label="Basal" value={fmt(s.bmr)} unit="kcal" /> : null}
        {s.visceralFatLevel != null ? <Stat label="Visceral" value={fmt(s.visceralFatLevel)} tone={s.visceralFatLevel >= 10 ? "amber" : undefined} /> : null}
        {s.bmi != null ? <Stat label="IMC" value={fmt(s.bmi, 1)} /> : null}
        {s.inbodyScore != null ? <Stat label="Puntaje" value={fmt(s.inbodyScore)} /> : null}
        {s.protein != null ? <Stat label="Proteína" value={fmt(s.protein, 1)} unit="kg" /> : null}
        {s.ecwRatio != null ? <Stat label="AEC/ACT" value={fmt(s.ecwRatio, 3)} /> : null}
      </div>
    </div>
  );
}

/** A gauge as InBody draws it: the bar with the normal range shaded, the value, the previous one as a tick. */
function GaugeRow({ g }: { g: BodyGauge }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row between small">
        <span className="muted">{GAUGE_LABEL[g.metric]}</span>
        <span>
          <span className="strong">{fmt(g.value, 1)}</span> <span className="muted">{g.unit}</span>
          {g.percent != null ? <span className="dim"> · {g.percent} %</span> : null}{" "}
          <Chip tone={BAND_TONE[g.band]}>{BAND_LABEL[g.band]}</Chip>
        </span>
      </div>
      <div className="meter" style={{ position: "relative" }}>
        <span style={{ position: "absolute", top: 0, bottom: 0, left: `${g.at.low * 100}%`, width: `${(g.at.high - g.at.low) * 100}%`, background: "var(--life-green-bg)" }} />
        <i style={{ width: `${g.at.value * 100}%`, background: g.band === "normal" ? "var(--life-green)" : "var(--life-amber)" }} />
        {g.at.previous != null ? <b style={{ left: `calc(${g.at.previous * 100}% - 1px)` }} /> : null}
      </div>
    </div>
  );
}

function Evolution({ views, tz }: { views: ScanView[]; tz: string }) {
  const full = views.filter((s) => s.weight != null && s.skeletalMuscleMass != null && s.bodyFatMass != null).slice(0, 24).reverse();
  if (full.length < 2) return null;
  const first = full[0]!;
  const last = full[full.length - 1]!;
  const rows: { label: string; key: "weight" | "skeletalMuscleMass" | "bodyFatMass"; color: string }[] = [
    { label: "Peso", key: "weight", color: "var(--life-text)" },
    { label: "Músculo", key: "skeletalMuscleMass", color: "var(--life-green)" },
    { label: "Grasa", key: "bodyFatMass", color: "var(--life-amber)" },
  ];
  return (
    <Panel title={`Evolución · ${full.length} escaneos desde el ${fmtShortDate(localDate(first.measuredAt, tz))}`}>
      <div className="cols-3">
        {rows.map((r) => (
          <div key={r.key} className="inner stack" style={{ gap: 6 }}>
            <div className="row between">
              <span className="label">{r.label}</span>
              <span className="small strong">{signed(last[r.key]! - first[r.key]!)} kg</span>
            </div>
            <Num value={fmt(last[r.key], 1)} unit="kg" size="sm" />
            <Sparkline values={full.map((s) => s[r.key])} color={r.color} height={32} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ScanRow({ s, older, tz }: { s: ScanView; older: ScanView[]; tz: string }) {
  const delta = (k: "weight" | "skeletalMuscleMass" | "bodyFatMass") => {
    const before = older.find((x) => x[k] != null)?.[k];
    return s[k] != null && before != null ? s[k]! - before : null;
  };
  const values = [
    s.weight != null && `${fmt(s.weight, 1)} kg`,
    s.percentBodyFat != null && `${fmt(s.percentBodyFat, 1)} % grasa`,
    s.skeletalMuscleMass != null && `${fmt(s.skeletalMuscleMass, 1)} kg músculo`,
  ].filter(Boolean);
  const dm = delta("skeletalMuscleMass");
  const df = delta("bodyFatMass");
  return (
    <div className="list-row">
      <div className="grow">
        <div className="truncate">{values.join(" · ") || "Medición"}</div>
        <div className="sub">
          {fmtDay(localDate(s.measuredAt, tz))} · {s.source === "inbody" ? `InBody${s.device ? ` ${s.device}` : ""}` : "A mano"}
        </div>
      </div>
      {dm != null ? <Chip tone={dm >= 0 ? "green" : "amber"}>Músc. {signed(dm)}</Chip> : null}
      {df != null ? <Chip tone={df <= 0 ? "green" : "amber"}>Grasa {signed(df)}</Chip> : null}
      <ActionButton action={deleteScanAction} fields={{ id: s.id }} className="btn ghost sm icon-only" confirm="¿Borrar esta medición?" title="Borrar">
        <Trash2 size={13} />
      </ActionButton>
    </div>
  );
}
