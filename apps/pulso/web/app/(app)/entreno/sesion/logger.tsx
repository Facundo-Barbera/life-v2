"use client";
import { Check, Plus, Repeat, Timer, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { SetDrop, WorkoutSet } from "@life/db";
import { e1rm, formatSet, formatWeight, fromUnit, shown, type SessionDetail, type SessionExercise } from "@life/db/pulso";
import type { ActionResult } from "@/components/client";
import { Sheet } from "@/components/client";
import {
  addSessionExerciseAction,
  cancelSessionAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
  removeSessionExerciseAction,
  swapSessionExerciseAction,
} from "../actions";
import { ExercisePicker, type PickerItem } from "../_components/picker";

type Rest = { endsAt: number; total: number; name: string } | null;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * The web logger: each exercise with last time and the suggested load, one
 * row to note a set (weight in the exercise's unit, reps, RPE, drops), a rest
 * timer after each set, add/swap/remove exercises, finish or cancel.
 */
export function Logger({ detail, items, similar }: { detail: SessionDetail; items: PickerItem[]; similar: Record<string, string[]> }) {
  const w = detail.workout;
  const now = useNow();
  const [rest, setRest] = useState<Rest>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(w.notes ?? "");

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r && !r.ok) setError(r.error);
      else after?.();
    });

  const elapsed = w.started_at ? (now - Date.parse(w.started_at)) / 1000 : 0;
  const restLeft = rest ? (rest.endsAt - now) / 1000 : 0;
  useEffect(() => {
    if (rest && restLeft <= -5) setRest(null);
  }, [rest, restLeft]);

  const totalSets = detail.exercises.reduce((n, e) => n + e.sets.length, 0);

  return (
    <div className="grid">
      <div className="panel hero accent" style={{ position: "sticky", top: 58, zIndex: 10 }}>
        <div className="row between wrap">
          <div className="grow">
            <span className="label green">En curso{detail.deload ? " · descarga" : ""}</span>
            <div className="title lg truncate">{w.title}</div>
            <div className="small muted">
              {clock(elapsed)} · {totalSets} {totalSets === 1 ? "serie" : "series"}
            </div>
          </div>
          {rest ? (
            <button type="button" className="btn lg" onClick={() => setRest(null)} title="Quitar descanso" style={{ background: restLeft > 0 ? "var(--life-blue-bg)" : "var(--life-green-bg)", color: restLeft > 0 ? "var(--life-blue)" : "var(--life-green)" }}>
              <Timer size={16} /> {restLeft > 0 ? clock(restLeft) : "¡Va!"}
            </button>
          ) : null}
          {rest && restLeft > 0 ? (
            <button type="button" className="btn sm" onClick={() => setRest({ ...rest, endsAt: rest.endsAt + 30_000, total: rest.total + 30 })}>
              +30 s
            </button>
          ) : null}
        </div>
        {rest && restLeft > 0 ? (
          <div className="meter" style={{ marginTop: 10 }}>
            <i style={{ width: `${(1 - restLeft / rest.total) * 100}%`, background: "var(--life-blue)" }} />
          </div>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {detail.exercises.map((e) => (
        <ExerciseCard
          key={`${e.index}-${e.exercise.id}`}
          e={e}
          busy={pending}
          items={items}
          similar={similar[e.exercise.id] ?? []}
          onLog={(input) =>
            run(
              () => logSetAction(w.id, e.exercise.id, input),
              () => {
                const secs = e.rx.restSeconds || detail.restSeconds;
                if (!e.cardio && secs > 0) setRest({ endsAt: Date.now() + secs * 1000, total: secs, name: e.exercise.name });
              },
            )
          }
          onDelete={(setId) => run(() => deleteSetAction(setId))}
          onSwap={(id) => run(() => swapSessionExerciseAction(w.id, e.index, id))}
          onRemove={() => run(() => removeSessionExerciseAction(w.id, e.index))}
        />
      ))}

      {detail.orphanSets.length ? (
        <div className="panel">
          <span className="label">También anotaste</span>
          <div className="rows" style={{ marginTop: 6 }}>
            {detail.orphanSets.map((s) => (
              <div key={s.id} className="list-row" style={{ paddingInline: 0 }}>
                <span className="grow">
                  {s.name} · {formatSet({ weightKg: s.weight_kg ?? 0, reps: s.reps ?? 0, drops: s.drops }, detail.defaultUnit)}
                </span>
                <button className="btn ghost sm icon-only" disabled={pending} onClick={() => run(() => deleteSetAction(s.id))} aria-label="Borrar serie">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="row wrap">
        <Sheet title="Agregar ejercicio" triggerClassName="btn" trigger={<><Plus size={15} /> Ejercicio</>}>
          {(close) => <ExercisePicker items={items} busy={pending} onPick={(id) => run(() => addSessionExerciseAction(w.id, id), close)} />}
        </Sheet>
      </div>

      <div className="panel">
        <label className="field">
          <span>Notas de la sesión</span>
          <textarea className="textarea" value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Cómo te sentiste, molestias…" />
        </label>
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn accent lg" disabled={pending || totalSets === 0} onClick={() => run(() => finishSessionAction(w.id, notes.trim() || null))}>
            <Check size={16} /> Terminar
          </button>
          <button
            className="btn ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm("¿Cancelar la sesión? Se borran las series que anotaste.")) run(() => cancelSessionAction(w.id));
            }}
          >
            <X size={15} /> Cancelar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

function rxLine(e: SessionExercise) {
  if (e.cardio) return [e.rx.cardio?.minutes ? `${e.rx.cardio.minutes} min` : null, e.rx.cardio?.distanceKm ? `${e.rx.cardio.distanceKm} km` : null, e.rx.cardio?.level ? `nivel ${e.rx.cardio.level}` : null].filter(Boolean).join(" · ") || "Cardio";
  return [`${e.rx.sets} × ${e.rx.repMin === e.rx.repMax ? e.rx.repMin : `${e.rx.repMin}–${e.rx.repMax}`}`, e.rx.targetRir != null ? `RIR ${e.rx.targetRir}` : null, `${e.rx.restSeconds} s`].filter(Boolean).join(" · ");
}

const fmtSetRow = (s: WorkoutSet, unit: "kg" | "lb") =>
  s.duration_s != null
    ? [`${Math.round(s.duration_s / 60)} min`, s.distance_km ? `${s.distance_km} km` : null, s.level ? `nivel ${s.level}` : null, s.kcal ? `${s.kcal} kcal` : null].filter(Boolean).join(" · ")
    : formatSet({ weightKg: s.weight_kg ?? 0, reps: s.reps ?? 0, drops: s.drops }, unit);

function ExerciseCard({ e, busy, items, similar, onLog, onDelete, onSwap, onRemove }: {
  e: SessionExercise;
  busy: boolean;
  items: PickerItem[];
  similar: string[];
  onLog: (input: Parameters<typeof logSetAction>[2]) => void;
  onDelete: (setId: string) => void;
  onSwap: (id: string) => void;
  onRemove: () => void;
}) {
  const unit = e.unit;
  const last = e.sets.at(-1);
  const startKg = last?.weight_kg ?? e.suggestion?.weightKg ?? e.rx.weightKg ?? null;
  const [weight, setWeight] = useState(startKg != null && startKg > 0 ? String(shown(startKg, unit)) : "");
  const [reps, setReps] = useState(String(last?.reps ?? e.suggestion?.reps ?? e.rx.repMin));
  const [rpe, setRpe] = useState("");
  const [drops, setDrops] = useState<{ weight: string; reps: string }[]>([]);
  const [minutes, setMinutes] = useState(String(e.rx.cardio?.minutes ?? ""));
  const [distance, setDistance] = useState("");
  const [level, setLevel] = useState("");
  const [kcal, setKcal] = useState("");
  const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  const target = e.cardio ? 1 : e.rx.sets;
  const best = e.sets.reduce((m, s) => Math.max(m, e1rm(s.weight_kg ?? 0, s.reps ?? 0)), 0);

  const submit = () => {
    if (e.cardio) {
      const m = n(minutes);
      onLog({ durationS: m != null ? Math.round(m * 60) : null, distanceKm: n(distance), level: n(level), kcal: n(kcal) });
      return;
    }
    const wv = n(weight);
    const parsedDrops: SetDrop[] = drops.map((d) => ({ weightKg: fromUnit(n(d.weight) ?? 0, unit), reps: n(d.reps) ?? 0 })).filter((d) => d.reps > 0);
    onLog({ weightKg: wv != null ? fromUnit(wv, unit) : 0, reps: n(reps), rpe: n(rpe), drops: parsedDrops });
    setDrops([]);
    setRpe("");
  };

  return (
    <section className="panel">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <Link href={`/entreno/ejercicio/${e.exercise.id}`} className="title">
            {e.exercise.name}
          </Link>
          <div className="small muted">
            {rxLine(e)} · <span className={e.sets.length >= target ? "green" : ""}>{e.sets.length}/{target}</span>
            {best ? ` · e1RM ${formatWeight(best, unit)}` : ""}
          </div>
        </div>
        <Sheet title={`Cambiar ${e.exercise.name}`} triggerClassName="btn ghost sm icon-only" trigger={<Repeat size={14} />}>
          {(close) => (
            <ExercisePicker
              items={items}
              highlight={similar}
              busy={busy}
              onPick={(id) => {
                onSwap(id);
                close();
              }}
            />
          )}
        </Sheet>
        <button
          className="btn ghost sm icon-only"
          disabled={busy}
          aria-label="Quitar de la sesión"
          onClick={() => {
            if (window.confirm(`¿Quitar ${e.exercise.name} de la sesión?`)) onRemove();
          }}
        >
          <X size={14} />
        </button>
      </div>

      {e.suggestion && e.sets.length === 0 ? <p className="small blue" style={{ marginTop: 6 }}>{e.suggestion.reason}</p> : null}
      {e.previous ? (
        <p className="tiny muted" style={{ marginTop: 4 }}>
          La vez pasada: {e.previous.sets.map((s) => fmtSetRow(s, unit)).join(", ")}
        </p>
      ) : null}
      {e.rx.notes ? <p className="tiny amber" style={{ marginTop: 4 }}>{e.rx.notes}</p> : null}

      {e.sets.length ? (
        <div className="rows" style={{ marginTop: 8 }}>
          {e.sets.map((s, i) => (
            <div key={s.id} className="row" style={{ padding: "6px 0" }}>
              <span className="mono tiny muted" style={{ width: 22 }}>
                {i + 1}
              </span>
              <span className="grow num sm" style={{ fontWeight: 500 }}>
                {fmtSetRow(s, unit)}
              </span>
              {s.rpe != null ? <span className="tiny muted">RPE {s.rpe}</span> : null}
              <button className="btn ghost sm icon-only" disabled={busy} onClick={() => onDelete(s.id)} aria-label="Borrar serie">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <form
        className="inner"
        style={{ marginTop: 10, display: "grid", gap: 8 }}
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        {e.cardio ? (
          <div className="form-row">
            <Field label="Minutos" value={minutes} onChange={setMinutes} />
            <Field label="Km" value={distance} onChange={setDistance} />
            <Field label="Nivel" value={level} onChange={setLevel} />
            <Field label="Kcal" value={kcal} onChange={setKcal} />
          </div>
        ) : (
          <>
            <div className="row wrap" style={{ alignItems: "flex-end" }}>
              <Field label={`Peso (${unit})`} value={weight} onChange={setWeight} />
              <Field label="Reps" value={reps} onChange={setReps} numeric />
              <Field label="RPE" value={rpe} onChange={setRpe} />
            </div>
            {drops.map((d, i) => (
              <div key={i} className="row wrap" style={{ alignItems: "flex-end" }}>
                <span className="tiny muted mono" style={{ width: 54 }}>
                  Bajada
                </span>
                <Field label={unit} value={d.weight} onChange={(v) => setDrops(drops.map((x, j) => (j === i ? { ...x, weight: v } : x)))} />
                <Field label="Reps" value={d.reps} onChange={(v) => setDrops(drops.map((x, j) => (j === i ? { ...x, reps: v } : x)))} numeric />
                <button type="button" className="btn ghost sm icon-only" onClick={() => setDrops(drops.filter((_, j) => j !== i))} aria-label="Quitar bajada">
                  <X size={13} />
                </button>
              </div>
            ))}
          </>
        )}
        <div className="row">
          <button type="submit" className="btn accent" disabled={busy}>
            <Check size={15} /> Anotar serie
          </button>
          {!e.cardio ? (
            <button type="button" className="btn ghost sm" onClick={() => setDrops([...drops, { weight: weight ? String(Math.round(Number(weight.replace(",", ".")) * 0.75)) : "", reps: "" }])}>
              + Bajada
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <label className="field" style={{ width: 92 }}>
      <span>{label}</span>
      <input className="input num-input" inputMode={numeric ? "numeric" : "decimal"} value={value} onChange={(ev) => onChange(ev.target.value)} />
    </label>
  );
}
