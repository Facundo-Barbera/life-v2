import { Check, Pause, Pill, Play, RotateCcw, SkipForward, Trash2, TriangleAlert, X } from "lucide-react";
import { amountLabel, fmtDay, fmtShortDate, getMedicationPage, isLeft, leftLabel, type MedicationPage, scheduleLine, slotLabel, type TodayItem } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Bars, Chip, Empty, fmt, Label, Num, Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { applyNudgeAction, deleteMedicationAction, recordDoseAction, setActiveAction } from "./actions";
import { AddMedication, EditMedication } from "./editor";

export const metadata = { title: "Medicación" };

const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)} %`);
const TONE: Partial<Record<TodayItem["state"], "green" | "amber" | "red" | "blue">> = { tomada: "green", ahora: "amber", atrasada: "red", entreno: "blue", dia: "blue" };
const STATE_LABEL: Record<TodayItem["state"], string> = {
  tomada: "Tomada",
  omitida: "Omitida",
  ahora: "Ahora",
  atrasada: "Atrasada",
  pendiente: "Pendiente",
  entreno: "Entreno",
  dia: "Hoy",
  "a-demanda": "Si hace falta",
  "no-toca": "No toca",
};

export default async function Medicacion() {
  const { client } = await requireMember();
  const page = await getMedicationPage(client);
  const left = page.today.filter(isLeft).length;
  const low = page.medications.filter((m) => m.active && m.lowStock);
  const scheduled = page.medications.some((m) => m.active && !m.schedule.asNeeded);

  return (
    <>
      <TopLine title={`Medicación · ${fmtDay(page.date)}`}>
        {page.medications.length ? <Chip tone={left ? "amber" : "green"}>{left ? `${left} por tomar` : "Todo al día"}</Chip> : null}
        <AddMedication today={page.date} />
      </TopLine>

      {page.medications.length === 0 ? (
        <Panel className="hero">
          <Empty title="Anota lo que tomas" line="Medicamentos y suplementos a una hora, con una comida o después de entrenar. Marca cada toma con un clic.">
            <div className="row wrap">
              <AddMedication today={page.date} kind="suplemento" label="Suplemento" />
              <AddMedication today={page.date} kind="medicamento" label="Medicamento" accent={false} />
            </div>
          </Empty>
        </Panel>
      ) : (
        <>
          {low.length ? (
            <p className="notice row">
              <TriangleAlert size={15} /> Quedan pocas: {low.map((m) => `${m.name} (${fmt(m.stock, 1)})`).join(", ")}
            </p>
          ) : null}
          <Nudges page={page} />
          <div className="cols-2">
            <Today page={page} />
            <div className="grid">
              {scheduled ? <Constancy page={page} /> : null}
              <Upcoming page={page} />
            </div>
          </div>
          <Cabinet page={page} />
          <History page={page} />
        </>
      )}
    </>
  );
}

function DoseButtons({ item, date }: { item: TodayItem; date: string }) {
  const m = item.medication;
  if (item.state === "a-demanda" || (item.state === "tomada" && !item.slot)) {
    return (
      <div className="row">
        {item.state === "tomada" && item.intakes[0] ? (
          <ActionButton action={recordDoseAction} fields={{ doseId: item.intakes[0].id }} className="btn ghost sm icon-only" title="Deshacer">
            <RotateCcw size={14} />
          </ActionButton>
        ) : null}
        {item.state === "a-demanda" ? (
          <ActionButton action={recordDoseAction} fields={{ medicationId: m.id, date, status: "tomada" }} className="btn sm">
            <Check size={14} /> Tomé una
          </ActionButton>
        ) : null}
      </div>
    );
  }
  const slot = item.slot;
  if (!slot) return null;
  if (slot.doseId && (slot.status === "tomada" || slot.status === "omitida")) {
    return (
      <ActionButton action={recordDoseAction} fields={{ doseId: slot.doseId }} className="btn ghost sm" title="Deshacer">
        <RotateCcw size={14} /> Deshacer
      </ActionButton>
    );
  }
  const f = { medicationId: m.id, date: slot.date, slot: slot.slot };
  return (
    <div className="row">
      <ActionButton action={recordDoseAction} fields={{ ...f, status: "omitida" }} className="btn ghost sm icon-only" title="Omitir">
        <X size={14} />
      </ActionButton>
      {slot.status !== "pospuesta" ? (
        <ActionButton action={recordDoseAction} fields={{ ...f, status: "pospuesta" }} className="btn ghost sm icon-only" title="Posponer">
          <SkipForward size={14} />
        </ActionButton>
      ) : null}
      <ActionButton action={recordDoseAction} fields={{ ...f, status: "tomada" }} className="btn accent sm">
        <Check size={14} /> Tomar
      </ActionButton>
    </div>
  );
}

function Today({ page }: { page: MedicationPage }) {
  const items = page.today.filter((i) => i.state !== "no-toca");
  const off = page.today.filter((i) => i.state === "no-toca");
  return (
    <Panel title={`Hoy · ${page.day.taken} de ${page.day.total} tomadas`} className="tight">
      {items.length === 0 ? <p className="muted small" style={{ padding: "8px 16px" }}>Hoy no te toca nada.</p> : null}
      <div className="rows">
        {items.map((i) => (
          <div key={i.key} className="list-row">
            <span className="icon" style={i.state === "tomada" ? { color: "var(--life-green)", background: "var(--life-green-bg)" } : undefined}>
              {i.state === "tomada" ? <Check size={15} /> : <Pill size={15} />}
            </span>
            <div className="grow">
              <div className="truncate">
                <span className="strong">{i.medication.name}</span> <span className="muted small">{amountLabel(i.medication.dose, i.medication.unit)}</span>
              </div>
              <div className="sub truncate">
                {i.when} · {i.line}
              </div>
            </div>
            <span className="mono small muted">{i.at ?? ""}</span>
            <Chip tone={TONE[i.state]}>{isLeft(i) ? leftLabel(i) : STATE_LABEL[i.state]}</Chip>
            <DoseButtons item={i} date={page.date} />
          </div>
        ))}
        {off.map((i) => (
          <div key={i.key} className="list-row" style={{ opacity: 0.6 }}>
            <span className="icon">
              <Pill size={15} />
            </span>
            <div className="grow">
              <div className="truncate">{i.medication.name}</div>
              <div className="sub truncate">{i.line}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Constancy({ page }: { page: MedicationPage }) {
  const { overall, days, medications } = page.adherence;
  if (overall.last30.due === 0) {
    return (
      <Panel title="Constancia">
        <p className="muted small">Aparece cuando tengas tomas registradas.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Constancia">
      <div className="stats">
        <div className="stat">
          <Label>7 días</Label>
          <Num value={pct(overall.last7.rate)} size="sm" />
          <span className="tiny muted">
            {overall.last7.taken} de {overall.last7.due}
          </span>
        </div>
        <div className="stat">
          <Label>30 días</Label>
          <Num value={pct(overall.last30.rate)} size="sm" />
          <span className="tiny muted">
            {overall.last30.taken} de {overall.last30.due}
          </span>
        </div>
        <div className="stat">
          <Label>Racha</Label>
          <Num value={overall.currentStreak} unit="días" size="sm" />
          <span className="tiny muted">mejor {overall.bestStreak}</span>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Bars values={days.map((d) => (d.due ? d.taken / d.due : null))} max={1} height={36} highlight={days.length - 1} />
        <div className="row between tiny dim mono" style={{ marginTop: 4 }}>
          <span>{fmtShortDate(days[0]!.date)}</span>
          <span>hoy</span>
        </div>
      </div>
      {medications.length > 1 ? (
        <table className="data" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th />
              <th className="n">7 d</th>
              <th className="n">30 d</th>
              <th className="n">Racha</th>
            </tr>
          </thead>
          <tbody>
            {medications.map((m) => (
              <tr key={m.medicationId}>
                <td className="truncate">{m.name}</td>
                <td className="n">{pct(m.last7.rate)}</td>
                <td className="n">{pct(m.last30.rate)}</td>
                <td className="n">{m.currentStreak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Panel>
  );
}

function Upcoming({ page }: { page: MedicationPage }) {
  const byDate = new Map<string, typeof page.upcoming>();
  for (const s of page.upcoming) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  if (!byDate.size) return null;
  return (
    <Panel title="Próximos días">
      <div className="stack">
        {[...byDate.entries()].map(([date, slots]) => (
          <div key={date} className="row" style={{ alignItems: "baseline" }}>
            <span className="label" style={{ width: 92, flexShrink: 0 }}>{fmtDay(date).replace(/ \d+ \w+$/, "")}</span>
            <span className="small truncate">{slots.map((s) => `${s.name} ${s.time ?? slotLabel(s.slot)}`).join(" · ")}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Nudges({ page }: { page: MedicationPage }) {
  if (!page.nudges.length) return null;
  return (
    <Panel title="Sugerencias" className="accent">
      <div className="stack">
        {page.nudges.map((n) => (
          <div key={n.medicationId} className="row wrap">
            <div className="grow">
              <div className="strong">{n.title}</div>
              <div className="small muted">{n.detail}</div>
            </div>
            <ActionButton action={applyNudgeAction} fields={{ id: n.medicationId, schedule: JSON.stringify(n.schedule), instructions: n.instructions }} className="btn sm accent">
              Ponerle horario
            </ActionButton>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Cabinet({ page }: { page: MedicationPage }) {
  return (
    <Panel title={`Lo que tomas · ${page.medications.length}`} className="tight">
      <div className="rows">
        {page.medications.map((m) => (
          <div key={m.id} className="list-row" style={m.active ? undefined : { opacity: 0.55 }}>
            <span className="icon">
              <Pill size={15} />
            </span>
            <div className="grow">
              <div className="truncate">
                <span className="strong">{m.name}</span> <span className="muted small">{amountLabel(m.dose, m.unit)}</span> {m.kind === "suplemento" ? <Chip>Suplemento</Chip> : null}
              </div>
              <div className="sub truncate">
                {scheduleLine(m.schedule)}
                {m.instructions ? ` · ${m.instructions}` : ""}
                {m.active ? "" : " · en pausa"}
                {m.endDate ? ` · hasta ${fmtShortDate(m.endDate)}` : ""}
              </div>
            </div>
            {m.stock !== null ? <Chip tone={m.lowStock ? "amber" : undefined}>Quedan {fmt(m.stock, 1)}</Chip> : null}
            <EditMedication med={m} today={page.date} />
            <ActionButton action={setActiveAction} fields={{ id: m.id, active: !m.active }} className="btn ghost sm icon-only" title={m.active ? "Pausar" : "Reanudar"}>
              {m.active ? <Pause size={14} /> : <Play size={14} />}
            </ActionButton>
            <ActionButton action={deleteMedicationAction} fields={{ id: m.id }} className="btn ghost sm icon-only" title="Borrar" confirm={`¿Borrar ${m.name} y todo su historial? Para dejar de tomarlo y conservar el historial, ponle fecha de fin o páusalo.`}>
              <Trash2 size={14} />
            </ActionButton>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const STATUS_WORD = { tomada: "Tomada", omitida: "Omitida", pospuesta: "Pospuesta" } as const;

function History({ page }: { page: MedicationPage }) {
  if (!page.history.length) return null;
  const clock = (ms: number) => new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: page.tz });
  return (
    <Panel title="Historial · 60 días">
      <details>
        <summary className="small muted" style={{ cursor: "pointer" }}>
          {page.history.length} días con tomas registradas
        </summary>
        <div className="stack" style={{ marginTop: 10 }}>
          {page.history.map((d) => (
            <div key={d.date} className="row" style={{ alignItems: "baseline" }}>
              <span className="label" style={{ width: 120, flexShrink: 0 }}>{fmtDay(d.date)}</span>
              <span className="small">
                {d.entries
                  .map((e) => `${e.name} ${e.status === "tomada" && e.takenAt ? clock(e.takenAt) : STATUS_WORD[e.status].toLowerCase()}${e.scheduledTime ? "" : " (extra)"}`)
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
      </details>
    </Panel>
  );
}
