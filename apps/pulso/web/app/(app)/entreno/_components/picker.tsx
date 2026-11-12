"use client";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EQUIPMENT_ES, MUSCLE_ES } from "@life/db/pulso";

export type PickerItem = { id: string; name: string; muscle: string; equipment: string; kind: string; personal?: boolean };

const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "full_body", "cardio", "forearms"];

/** Search the library (and your own exercises) by name, muscle and equipment; tap one to pick it. */
export function ExercisePicker({ items, onPick, highlight, busy }: { items: PickerItem[]; onPick: (id: string) => void; highlight?: string[]; busy?: boolean }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return items.filter((i) => (!muscle || i.muscle === muscle) && (!needle || i.name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(needle)));
  }, [items, q, muscle]);
  const top = highlight?.length ? items.filter((i) => highlight.includes(i.id)) : [];
  return (
    <div className="stack">
      <label className="row inner" style={{ padding: "4px 10px" }}>
        <Search size={15} className="muted" />
        <input className="input" style={{ border: 0, background: "transparent", minHeight: 32, padding: 0 }} placeholder="Buscar ejercicio" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <div className="row wrap" style={{ gap: 4 }}>
        {MUSCLES.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
            {MUSCLE_ES[m] ?? m}
          </button>
        ))}
      </div>
      {top.length && !q && !muscle ? (
        <>
          <span className="label">Parecidos</span>
          <List items={top} onPick={onPick} busy={busy} />
          <span className="label">Todos</span>
        </>
      ) : null}
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        <List items={shown} onPick={onPick} busy={busy} />
        {shown.length === 0 ? <p className="muted small">Nada con ese nombre.</p> : null}
      </div>
    </div>
  );
}

function List({ items, onPick, busy }: { items: PickerItem[]; onPick: (id: string) => void; busy?: boolean }) {
  return (
    <div className="rows">
      {items.map((i) => (
        <button key={i.id} type="button" disabled={busy} className="list-row" style={{ border: 0, background: "transparent", width: "100%", textAlign: "left", cursor: "pointer", paddingInline: 4, minHeight: 44 }} onClick={() => onPick(i.id)}>
          <div className="grow">
            <div className="truncate">{i.name}</div>
            <div className="sub">
              {[MUSCLE_ES[i.muscle] ?? i.muscle, EQUIPMENT_ES[i.equipment] ?? i.equipment, i.personal ? "Tuyo" : null].filter(Boolean).join(" · ")}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
