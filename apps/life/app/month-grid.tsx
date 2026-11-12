"use client";

import { CALENDARS, type CalendarEvent } from "@/lib/sample-events";
import { addDays, fmt, sameDay, startOfWeek, wd } from "@/lib/date";

export function MonthGrid({
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
  const gridStart = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="card mg">
      <div className="mg-head">
        {cells.slice(0, 7).map((d) => (
          <div key={d.toISOString()}>{wd(d)}</div>
        ))}
      </div>
      <div className="mg-grid">
        {cells.map((d) => {
          const list = events
            .filter((e) => sameDay(e.start, d))
            .sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || +a.start - +b.start);
          const out = d.getMonth() !== cursor.getMonth();
          return (
            <div key={d.toISOString()} className={`mg-cell ${out ? "is-out" : ""} ${sameDay(d, now) ? "is-today" : ""}`}>
              <button className="mg-num" onClick={() => onPickDay(d)} aria-label={fmt.long.format(d)}>
                {d.getDate()}
              </button>
              <div className="mg-events">
                {list.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    className={`mg-ev ${e.allDay ? "is-allday" : ""} ${e.kind === "focus" ? "is-focus" : ""}`}
                    style={{ ["--c" as string]: CALENDARS[e.calendar].color }}
                    onClick={() => onSelect(e)}
                  >
                    {!e.allDay && <span className="dot" />}
                    {!e.allDay && <span className="mg-time">{fmt.time.format(e.start)}</span>}
                    <span className="mg-title">{e.title}</span>
                  </button>
                ))}
                {list.length > 3 && (
                  <button className="mg-more" onClick={() => onPickDay(d)}>
                    +{list.length - 3} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
