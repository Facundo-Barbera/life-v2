"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CALENDARS,
  type CalendarEvent,
  getSampleEvents,
  startOfWeek,
} from "@/lib/sample-events";

type View = "week" | "month";

const HOUR_START = 6;
const HOUR_END = 24;
const HOUR_PX = 48;

const fmtTime = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtWeekday = new Intl.DateTimeFormat("es", { weekday: "short" });
const fmtMonthYear = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" });
const fmtLong = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" });

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Calendar() {
  // Render only on the client so "today" and the fake data match the viewer's clock.
  const [now, setNow] = useState<Date | null>(null);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    const n = new Date();
    setNow(n);
    setCursor(n);
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const events = useMemo(() => (now ? getSampleEvents(now) : []), [now?.toDateString()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!now || !cursor) return <div className="shell" />;

  const step = (dir: -1 | 1) => {
    if (view === "week") setCursor(addDays(cursor, 7 * dir));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
  };

  const weekStart = startOfWeek(cursor);
  const title =
    view === "month"
      ? capitalize(fmtMonthYear.format(cursor))
      : capitalize(fmtMonthYear.format(addDays(weekStart, 3)));

  return (
    <div className="shell">
      <header className="toolbar">
        <div className="brand">Life</div>
        <div className="nav">
          <button className="btn" onClick={() => setCursor(new Date())}>Hoy</button>
          <button className="btn icon" aria-label="Anterior" onClick={() => step(-1)}>‹</button>
          <button className="btn icon" aria-label="Siguiente" onClick={() => step(1)}>›</button>
          <h1 className="title">{title}</h1>
        </div>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={view === "week"} onClick={() => setView("week")}>Semana</button>
          <button role="tab" aria-selected={view === "month"} onClick={() => setView("month")}>Mes</button>
        </div>
      </header>

      <div className="legend">
        {Object.entries(CALENDARS).map(([id, c]) => (
          <span key={id} className="legend-item">
            <span className="dot" style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
        <span className="legend-note">Datos de ejemplo</span>
      </div>

      <main className="body">
        {view === "week" ? (
          <WeekView weekStart={weekStart} now={now} events={events} onSelect={setSelected} />
        ) : (
          <MonthView cursor={cursor} now={now} events={events} onSelect={setSelected} onPickDay={(d) => { setCursor(d); setView("week"); }} />
        )}
      </main>

      {selected && <EventSheet event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function WeekView({
  weekStart,
  now,
  events,
  onSelect,
}: {
  weekStart: Date;
  now: Date;
  events: CalendarEvent[];
  onSelect: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const nowTop = ((now.getHours() + now.getMinutes() / 60) - HOUR_START) * HOUR_PX;

  return (
    <div className="week">
      <div className="week-head">
        <div className="gutter" />
        {days.map((d) => (
          <div key={d.toISOString()} className={`day-head ${sameDay(d, now) ? "today" : ""}`}>
            <span className="wd">{fmtWeekday.format(d).replace(".", "")}</span>
            <span className="dn">{d.getDate()}</span>
          </div>
        ))}
      </div>

      <div className="allday-row">
        <div className="gutter label">todo el día</div>
        {days.map((d) => (
          <div key={d.toISOString()} className="allday-cell">
            {events
              .filter((e) => e.allDay && sameDay(e.start, d))
              .map((e) => (
                <button key={e.id} className="chip" style={{ ["--c" as string]: CALENDARS[e.calendar].color }} onClick={() => onSelect(e)}>
                  {e.title}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="grid-scroll">
        <div className="grid" style={{ height: hours.length * HOUR_PX }}>
          <div className="gutter hours">
            {hours.map((h) => (
              <div key={h} className="hour-label" style={{ top: (h - HOUR_START) * HOUR_PX }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayEvents = events.filter((e) => !e.allDay && sameDay(e.start, d));
            return (
              <div key={d.toISOString()} className={`col ${sameDay(d, now) ? "today" : ""}`}>
                {hours.map((h) => (
                  <div key={h} className="slot" style={{ top: (h - HOUR_START) * HOUR_PX, height: HOUR_PX }} />
                ))}
                {layout(dayEvents).map(({ e, lane, lanes }) => {
                  const s = e.start.getHours() + e.start.getMinutes() / 60;
                  const en = e.end.getHours() + e.end.getMinutes() / 60;
                  const top = (Math.max(s, HOUR_START) - HOUR_START) * HOUR_PX;
                  const height = Math.max((en - Math.max(s, HOUR_START)) * HOUR_PX - 2, 18);
                  return (
                    <button
                      key={e.id}
                      className="event"
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        ["--c" as string]: CALENDARS[e.calendar].color,
                      }}
                      onClick={() => onSelect(e)}
                    >
                      <span className="ev-title">{e.title}</span>
                      {height > 30 && (
                        <span className="ev-time">
                          {fmtTime.format(e.start)}–{fmtTime.format(e.end)}
                        </span>
                      )}
                    </button>
                  );
                })}
                {sameDay(d, now) && nowTop >= 0 && <div className="now-line" style={{ top: nowTop }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Simple overlap layout: assign each event to the first free lane in its cluster.
function layout(evts: CalendarEvent[]) {
  const sorted = [...evts].sort((a, b) => +a.start - +b.start || +b.end - +a.end);
  const out: { e: CalendarEvent; lane: number; lanes: number }[] = [];
  let cluster: { e: CalendarEvent; lane: number }[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => out.push({ ...c, lanes }));
    cluster = [];
  };
  for (const e of sorted) {
    if (cluster.length && +e.start >= clusterEnd) flush();
    const laneEnds: number[] = [];
    cluster.forEach((c) => (laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? 0, +c.e.end)));
    let lane = laneEnds.findIndex((end) => end <= +e.start);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ e, lane });
    clusterEnd = Math.max(clusterEnd, +e.end);
  }
  if (cluster.length) flush();
  return out;
}

function MonthView({
  cursor,
  now,
  events,
  onSelect,
  onPickDay,
}: {
  cursor: Date;
  now: Date;
  events: CalendarEvent[];
  onSelect: (e: CalendarEvent) => void;
  onPickDay: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekdays = cells.slice(0, 7);

  return (
    <div className="month">
      <div className="month-head">
        {weekdays.map((d) => (
          <div key={d.toISOString()}>{fmtWeekday.format(d).replace(".", "")}</div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((d) => {
          const dayEvents = events
            .filter((e) => sameDay(e.start, d))
            .sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || +a.start - +b.start);
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={d.toISOString()} className={`cell ${inMonth ? "" : "muted"} ${sameDay(d, now) ? "today" : ""}`}>
              <button className="cell-num" onClick={() => onPickDay(d)}>{d.getDate()}</button>
              <div className="cell-events">
                {dayEvents.slice(0, 3).map((e) => (
                  <button key={e.id} className={`mini ${e.allDay ? "filled" : ""}`} style={{ ["--c" as string]: CALENDARS[e.calendar].color }} onClick={() => onSelect(e)}>
                    {!e.allDay && <span className="dot" style={{ background: CALENDARS[e.calendar].color }} />}
                    {!e.allDay && <span className="mini-time">{fmtTime.format(e.start)}</span>}
                    <span className="mini-title">{e.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && <span className="more">+{dayEvents.length - 3} más</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const cal = CALENDARS[event.calendar];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={event.title}>
        <div className="sheet-bar" style={{ background: cal.color }} />
        <h2>{event.title}</h2>
        <p>{capitalize(fmtLong.format(event.start))}</p>
        <p>{event.allDay ? "Todo el día" : `${fmtTime.format(event.start)} – ${fmtTime.format(event.end)}`}</p>
        {event.location && <p>{event.location}</p>}
        <p className="sheet-cal">
          <span className="dot" style={{ background: cal.color }} /> {cal.label}
        </p>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
