"use client";

import { CALENDARS, type CalendarEvent } from "@/lib/sample-events";
import { addDays, fmt, sameDay, startOfWeek, wd } from "@/lib/date";
import { Check } from "@/components/ui";

export function MonthGrid({
  cursor,
  now,
  events,
  onSelect,
  onToggle,
  onPickDay,
}: {
  cursor: Date;
  now: Date;
  events: CalendarEvent[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
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
                {list.slice(0, 3).map((e) => {
                  const reminder = e.kind === "reminder";
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      className={`mg-ev ${e.allDay && !reminder ? "is-allday" : ""} ${e.kind === "focus" ? "is-focus" : ""} ${e.done ? "is-done" : ""}`}
                      style={{ ["--c" as string]: CALENDARS[e.calendar].color }}
                      onClick={() => onSelect(e.id)}
                      onKeyDown={(k) => k.key === "Enter" && onSelect(e.id)}
                    >
                      {reminder ? (
                        <Check done={!!e.done} overdue={!e.done && e.end < now} onToggle={() => onToggle(e.id)} size={13} />
                      ) : (
                        !e.allDay && <span className="dot" />
                      )}
                      {!e.allDay && <span className="mg-time">{fmt.time.format(e.start)}</span>}
                      <span className="mg-title">{e.title}</span>
                    </div>
                  );
                })}
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
