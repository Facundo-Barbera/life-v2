"use client";

import { useEffect, useRef } from "react";
import { Lock, Video } from "lucide-react";
import { CALENDARS, type CalendarEvent } from "@/lib/sample-events";
import { fmt, hoursOf, sameDay, wd } from "@/lib/date";
import { Avatars } from "./ui";

const HOUR_START = 6;
const HOUR_END = 24;
const HOUR_PX = 56;

export function TimeGrid({
  days,
  now,
  events,
  onSelect,
}: {
  days: Date[];
  now: Date;
  events: CalendarEvent[];
  onSelect: (e: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasToday = days.some((d) => sameDay(d, now));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const nowTop = (hoursOf(now) - HOUR_START) * HOUR_PX;
  const showNow = hasToday && nowTop >= 0;
  const allDay = days.map((d) => events.filter((e) => e.allDay && sameDay(e.start, d)));
  const hasAllDay = allDay.some((l) => l.length);

  // Scroll to "now" (or the morning) when the range changes.
  const rangeKey = `${days[0]?.toDateString()}-${days.length}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = hasToday ? hoursOf(now) - 2 : 7.5;
    el.scrollTop = Math.max(0, (target - HOUR_START) * HOUR_PX);
  }, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card tg" style={{ ["--days" as string]: days.length, ["--hour" as string]: `${HOUR_PX}px` }}>
      <div className="tg-row tg-head">
        <div className="tg-gutter" />
        {days.map((d) => (
          <div key={d.toISOString()} className={`tg-day ${sameDay(d, now) ? "is-today" : ""}`}>
            <span className="tg-wd">{wd(d)}</span>
            <span className="tg-dn">{d.getDate()}</span>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div className="tg-row tg-allday">
          <div className="tg-gutter tg-allday-label">Todo el día</div>
          {allDay.map((list, i) => (
            <div key={i} className="tg-allday-cell">
              {list.map((e) => (
                <button key={e.id} className="chip" style={{ ["--c" as string]: CALENDARS[e.calendar].color }} onClick={() => onSelect(e)}>
                  {e.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-row tg-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="tg-gutter tg-hours">
            {hours.slice(1).map((h) => (
              <span key={h} style={{ top: (h - HOUR_START) * HOUR_PX }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
            {showNow && (
              <span className="tg-now-pill" style={{ top: nowTop }}>
                {fmt.time.format(now)}
              </span>
            )}
          </div>

          {days.map((d) => {
            const today = sameDay(d, now);
            return (
              <div key={d.toISOString()} className={`tg-col ${today ? "is-today" : ""}`}>
                {layout(events.filter((e) => !e.allDay && sameDay(e.start, d))).map(({ e, lane, lanes }) => (
                  <EventBlock key={e.id} e={e} lane={lane} lanes={lanes} past={e.end < now} onSelect={onSelect} />
                ))}
                {showNow && <div className={`tg-now ${today ? "strong" : ""}`} style={{ top: nowTop }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventBlock({
  e,
  lane,
  lanes,
  past,
  onSelect,
}: {
  e: CalendarEvent;
  lane: number;
  lanes: number;
  past: boolean;
  onSelect: (e: CalendarEvent) => void;
}) {
  const s = Math.max(hoursOf(e.start), HOUR_START);
  const top = (s - HOUR_START) * HOUR_PX;
  const height = Math.max((hoursOf(e.end) - s) * HOUR_PX - 3, 20);
  const compact = height < 40;
  const focus = e.kind === "focus";
  const time = `${fmt.time.format(e.start)} – ${fmt.time.format(e.end)}`;

  return (
    <button
      className={`ev ${focus ? "ev-focus" : ""} ${compact ? "ev-compact" : ""} ${past ? "ev-past" : ""}`}
      style={{
        top: top + 1,
        height,
        left: `calc(${(lane / lanes) * 100}% + 3px)`,
        width: `calc(${100 / lanes}% - 6px)`,
        ["--c" as string]: CALENDARS[e.calendar].color,
      }}
      onClick={() => onSelect(e)}
      title={`${e.title} · ${time}`}
    >
      <span className="ev-title">
        {focus && <Lock size={11} strokeWidth={2.4} />}
        <span className="ev-name">{e.title}</span>
        {compact && <span className="ev-time">{fmt.time.format(e.start)}</span>}
        {e.video && <Video className="ev-video" size={13} />}
      </span>
      {!compact && <span className="ev-time">{time}</span>}
      {!compact && height > 84 && e.people?.length ? (
        <span className="ev-people">
          <Avatars people={e.people} max={3} />
        </span>
      ) : null}
    </button>
  );
}

// Overlap layout: each event takes the first free lane in its cluster.
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
