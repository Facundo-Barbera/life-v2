"use client";

import type { RefObject } from "react";
import { Calendar, CalendarClock, CalendarDays, Check, LayoutGrid, Search, Sun, Video } from "lucide-react";
import { CALENDARS, type CalendarEvent, type CalendarId } from "@/lib/sample-events";
import { fmt, wd } from "@/lib/date";
import type { View } from "./calendar-app";
import { Avatars } from "./ui";

export function Sidebar({
  view,
  onView,
  onToday,
  query,
  onQuery,
  searchRef,
  hidden,
  onToggle,
  counts,
  next,
  now,
  onSelect,
}: {
  view: View;
  onView: (v: View) => void;
  onToday: () => void;
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  hidden: Set<CalendarId>;
  onToggle: (id: CalendarId) => void;
  counts: Record<CalendarId, number>;
  next?: CalendarEvent;
  now: Date;
  onSelect: (e: CalendarEvent) => void;
}) {
  const nav: { id: View; label: string; icon: typeof Sun; key: string }[] = [
    { id: "day", label: "Día", icon: CalendarClock, key: "D" },
    { id: "week", label: "Semana", icon: CalendarDays, key: "W" },
    { id: "month", label: "Mes", icon: LayoutGrid, key: "M" },
  ];

  return (
    <aside className="sidebar">
      <div className="ws">
        <span className="ws-logo">
          <Calendar size={17} strokeWidth={2.2} />
        </span>
        <span className="ws-text">
          <strong>Life</strong>
          <span>Personal</span>
        </span>
      </div>

      <label className="search">
        <Search size={15} />
        <input ref={searchRef} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar" />
        <kbd>⌘K</kbd>
      </label>

      <nav className="side-section">
        <h3 className="side-label">Calendario</h3>
        <button className="side-item" onClick={onToday}>
          <Sun size={16} /> Hoy <kbd>T</kbd>
        </button>
        {nav.map(({ id, label, icon: Icon, key }) => (
          <button key={id} className={`side-item ${view === id ? "is-active" : ""}`} onClick={() => onView(id)}>
            <Icon size={16} /> {label} <kbd>{key}</kbd>
          </button>
        ))}
      </nav>

      <div className="side-section">
        <h3 className="side-label">Mis calendarios</h3>
        {(Object.keys(CALENDARS) as CalendarId[]).map((id) => {
          const on = !hidden.has(id);
          return (
            <button key={id} className="side-item cal-item" onClick={() => onToggle(id)} aria-pressed={on} style={{ ["--c" as string]: CALENDARS[id].color }}>
              <span className={`check ${on ? "on" : ""}`}>{on && <Check size={11} strokeWidth={3} />}</span>
              {CALENDARS[id].label}
              <span className="count">{counts[id]}</span>
            </button>
          );
        })}
      </div>

      <div className="side-foot">
        {next && <NextUp e={next} now={now} onSelect={onSelect} />}
        <p className="side-note">
          <span className="dot" style={{ background: "var(--cal-health)" }} /> Datos de ejemplo · locales
        </p>
      </div>
    </aside>
  );
}

function NextUp({ e, now, onSelect }: { e: CalendarEvent; now: Date; onSelect: (e: CalendarEvent) => void }) {
  const mins = Math.round((+e.start - +now) / 60_000);
  const when =
    mins <= 0 ? "ahora" : mins < 60 ? `en ${mins} min` : mins < 24 * 60 ? `en ${Math.round(mins / 60)} h` : `${wd(e.start)} ${e.start.getDate()}`;
  return (
    <div className="next">
      <span className="next-label">
        <span className="pulse" /> Siguiente · {when}
      </span>
      <button className="next-card" onClick={() => onSelect(e)}>
        <strong>{e.title}</strong>
        <span className="muted">
          {fmt.time.format(e.start)} – {fmt.time.format(e.end)}
          {e.location ? ` · ${e.location}` : ""}
        </span>
        <span className="next-foot">
          {e.people?.length ? <Avatars people={e.people} max={3} /> : <span />}
          {e.video && (
            <span className="join">
              <Video size={13} /> Unirse
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
