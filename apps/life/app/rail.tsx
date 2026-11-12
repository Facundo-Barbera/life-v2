"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Video } from "lucide-react";
import { CALENDARS, type CalendarEvent } from "@/lib/sample-events";
import { addDays, cap, fmt, sameDay, startOfWeek } from "@/lib/date";
import { Avatars, Check } from "@/components/ui";

const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

export function MiniMonth({
  cursor,
  now,
  events,
  highlightWeek,
  onPick,
}: {
  cursor: Date;
  now: Date;
  events: CalendarEvent[];
  highlightWeek: boolean;
  onPick: (d: Date) => void;
}) {
  const [month, setMonth] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => setMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor]);

  const gridStart = startOfWeek(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekStart = startOfWeek(cursor);
  const busy = new Set(events.map((e) => e.start.toDateString()));

  return (
    <section className="mini">
      <header className="mini-head">
        <span className="mini-title">{cap(fmt.monthYear.format(month))}</span>
        <span className="mini-nav">
          <button className="icon-btn" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft size={15} />
          </button>
          <button className="icon-btn" aria-label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight size={15} />
          </button>
        </span>
      </header>
      <div className="mini-grid">
        {LETTERS.map((l) => (
          <span key={l} className="mini-wd">
            {l}
          </span>
        ))}
        {cells.map((d) => {
          const inWeek = highlightWeek && d >= weekStart && d < addDays(weekStart, 7);
          const cls = [
            "mini-day",
            d.getMonth() !== month.getMonth() && "is-out",
            sameDay(d, now) && "is-today",
            sameDay(d, cursor) && "is-cursor",
            inWeek && "in-week",
            busy.has(d.toDateString()) && "has-ev",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={d.toISOString()} className={cls} onClick={() => onPick(d)}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function Reminders({
  events,
  now,
  weekStart,
  onSelect,
  onToggle,
}: {
  events: CalendarEvent[];
  now: Date;
  weekStart: Date;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const weekEnd = addDays(weekStart, 7);
  const all = events.filter((e) => e.kind === "reminder");
  // Overdue from any week, plus everything due in the visible week.
  const list = all
    .filter((e) => (!e.done && e.end < now) || (e.start >= weekStart && e.start < weekEnd))
    .sort((a, b) => Number(!!a.done) - Number(!!b.done) || +a.start - +b.start);
  const doneCount = list.filter((e) => e.done).length;
  return (
    <section>
      <h3 className="rail-label rail-label-row">
        Recordatorios
        <span className="muted">
          {doneCount}/{list.length}
        </span>
      </h3>
      {list.length === 0 && <p className="empty">Sin recordatorios esta semana.</p>}
      <div className="rem-list">
        {list.map((e) => {
          const overdue = !e.done && e.end < now;
          return (
            <div
              key={e.id}
              role="button"
              tabIndex={0}
              className={`rem-item ${e.done ? "is-done" : ""}`}
              style={{ ["--c" as string]: CALENDARS[e.calendar].color }}
              onClick={() => onSelect(e.id)}
              onKeyDown={(k) => k.key === "Enter" && onSelect(e.id)}
            >
              <Check done={!!e.done} overdue={overdue} onToggle={() => onToggle(e.id)} size={16} />
              <span className="rem-title">{e.title}</span>
              <span className={`rem-when ${overdue ? "overdue" : ""}`}>
                {sameDay(e.start, now) ? "Hoy" : `${fmt.weekday.format(e.start).replace(".", "")} ${e.start.getDate()}`}
                {!e.allDay && ` · ${fmt.time.format(e.start)}`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Upcoming({ events, now, onSelect }: { events: CalendarEvent[]; now: Date; onSelect: (id: string) => void }) {
  const list = events.filter((e) => !e.allDay && e.kind !== "reminder" && e.end > now).slice(0, 5);
  return (
    <section className="upcoming">
      <h3 className="rail-label">Próximos</h3>
      {list.length === 0 && <p className="empty">Nada pendiente.</p>}
      <div className="up-list">
        {list.map((e) => {
          const live = e.start <= now;
          return (
            <button key={e.id} className="up-item" onClick={() => onSelect(e.id)} style={{ ["--c" as string]: CALENDARS[e.calendar].color }}>
              <span className={`date-tile ${sameDay(e.start, now) ? "is-today" : ""}`}>
                <span>{fmt.weekday.format(e.start).replace(".", "").toUpperCase()}</span>
                <strong>{e.start.getDate()}</strong>
              </span>
              <span className="up-body">
                <span className="up-time">
                  {fmt.time.format(e.start)} – {fmt.time.format(e.end)}
                  {live && <span className="live">Ahora</span>}
                </span>
                <span className="up-title">
                  <span className="dot" />
                  {e.title}
                  {e.video && <Video size={12} className="muted-icon" />}
                </span>
              </span>
              {e.people?.length ? <Avatars people={e.people} max={3} /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
