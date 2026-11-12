"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Lock, Moon, Video } from "lucide-react";
import { CALENDARS, type CalendarEvent } from "@/lib/sample-events";
import { fmt, fmtDuration, hoursOf, sameDay, startOfDay, toHHMM, wd } from "@/lib/date";
import { STAGES, type SleepSession, asleepMinutes, sleepForDay } from "@/lib/sleep";
import { Avatars, Check } from "@/components/ui";

const HOUR_START = 0;
const HOUR_END = 24;
const HOUR_PX = 52;
const SNAP = 15;
const REMINDER_PX = 24;

type DragType = "move" | "resize-start" | "resize-end";
type Drag =
  | { type: DragType; id: string; x: number; y: number; origStart: Date; origEnd: Date; pMin: number; moved: boolean; reminder: boolean }
  | { type: "pending"; x: number; y: number; day: number; min: number; touch: boolean; timer: number }
  | { type: "create"; day: number; anchor: number };

type Draft = { id: string; start: Date; end: Date };
type Ghost = { day: number; from: number; to: number };

const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const floorSnap = (m: number) => Math.floor(m / SNAP) * SNAP;
const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const atMin = (day: Date, m: number) => {
  const x = startOfDay(day);
  x.setMinutes(m);
  return x;
};
const yOf = (min: number) => (min / 60 - HOUR_START) * HOUR_PX;

export function TimeGrid({
  days,
  now,
  events,
  sleep,
  onSelect,
  onChange,
  onCreate,
  onToggle,
}: {
  days: Date[];
  now: Date;
  events: CalendarEvent[];
  sleep: SleepSession[] | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<CalendarEvent>) => void;
  onCreate: (start: Date, end: Date) => void;
  onToggle: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [ghost, setGhostState] = useState<Ghost | null>(null);
  const [dragging, setDragging] = useState(false);
  const setDraft = (d: Draft | null) => ((draftRef.current = d), setDraftState(d));
  const setGhost = (g: Ghost | null) => ((ghostRef.current = g), setGhostState(g));

  const hasToday = days.some((d) => sameDay(d, now));
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const nowTop = yOf(minOf(now));
  const shown = draft ? events.map((e) => (e.id === draft.id ? { ...e, start: draft.start, end: draft.end } : e)) : events;
  const allDay = days.map((d) => shown.filter((e) => e.allDay && sameDay(e.start, d)));
  const hasAllDay = allDay.some((l) => l.length);

  const rangeKey = `${days[0]?.toDateString()}-${days.length}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = hasToday ? hoursOf(now) - 2 : 7;
    el.scrollTop = Math.max(0, (target - HOUR_START) * HOUR_PX);
  }, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => detach(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- pointer helpers ----------
  function slotAt(cx: number, cy: number) {
    const body = bodyRef.current!;
    const r = body.getBoundingClientRect();
    let day = 0;
    body.querySelectorAll<HTMLElement>(".tg-col").forEach((c, i) => {
      if (cx >= c.getBoundingClientRect().left) day = i;
    });
    const min = clampN(((cy - r.top) / HOUR_PX + HOUR_START) * 60, 0, 1440);
    return { day, min };
  }

  function autoScroll(cy: number) {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (cy < r.top + 36) el.scrollTop -= 14;
    else if (cy > r.bottom - 36) el.scrollTop += 14;
  }

  function attach(d: Drag) {
    dragRef.current = d;
    document.documentElement.dataset.drag = d.type === "resize-start" || d.type === "resize-end" ? "resize" : d.type === "move" ? "move" : "create";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
  }
  function detach() {
    const d = dragRef.current;
    if (d?.type === "pending") clearTimeout(d.timer);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", cancel);
  }
  function cancel() {
    detach();
    delete document.documentElement.dataset.drag;
    dragRef.current = null;
    setDraft(null);
    setGhost(null);
    setDragging(false);
  }

  function startCreate(day: number, min: number) {
    const a = clampN(floorSnap(min), 0, 1440 - SNAP);
    dragRef.current = { type: "create", day, anchor: a };
    setGhost({ day, from: a, to: Math.min(1440, a + 30) });
    setDragging(true);
  }

  function onMove(ev: PointerEvent) {
    let d = dragRef.current;
    if (!d) return;
    if (d.type === "pending") {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 5) return;
      clearTimeout(d.timer);
      if (d.touch) return cancel(); // on touch, moving before the hold means scrolling
      startCreate(d.day, d.min);
      d = dragRef.current!;
    }
    autoScroll(ev.clientY);
    const p = slotAt(ev.clientX, ev.clientY);

    if (d.type === "create") {
      let from: number, to: number;
      if (p.min >= d.anchor) {
        from = d.anchor;
        to = Math.max(d.anchor + SNAP, Math.ceil(p.min / SNAP) * SNAP);
      } else {
        from = floorSnap(p.min);
        to = d.anchor + SNAP;
      }
      setGhost({ day: d.day, from, to: Math.min(1440, to) });
      return;
    }

    if (d.type === "pending") return;
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
      d.moved = true;
      setDragging(true);
    }
    const dMin = p.min - d.pMin;
    const sMin = minOf(d.origStart);
    const dur = d.reminder ? 0 : (+d.origEnd - +d.origStart) / 60_000;
    const origDay = startOfDay(d.origStart);
    if (d.type === "move") {
      const ns = clampN(snap(sMin + dMin), 0, 1440 - Math.max(dur, SNAP));
      setDraft({ id: d.id, start: atMin(days[p.day], ns), end: atMin(days[p.day], ns + dur) });
    } else if (d.type === "resize-end") {
      const ne = clampN(snap(sMin + dur + dMin), sMin + SNAP, 1440);
      setDraft({ id: d.id, start: d.origStart, end: atMin(origDay, ne) });
    } else {
      const ns = clampN(snap(sMin + dMin), 0, sMin + dur - SNAP);
      setDraft({ id: d.id, start: atMin(origDay, ns), end: d.origEnd });
    }
  }

  function onUp() {
    const d = dragRef.current;
    if (d?.type === "create" && ghostRef.current) {
      const g = ghostRef.current;
      onCreate(atMin(days[g.day], g.from), atMin(days[g.day], g.to));
    } else if (d && (d.type === "move" || d.type === "resize-start" || d.type === "resize-end")) {
      if (d.moved && draftRef.current) onChange(d.id, { start: draftRef.current.start, end: draftRef.current.end });
      else onSelect(d.id);
    }
    cancel();
  }

  function onColDown(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".ev")) return;
    const touch = e.pointerType !== "mouse";
    if (!touch) e.preventDefault();
    const p = slotAt(e.clientX, e.clientY);
    const timer = window.setTimeout(() => {
      if (dragRef.current?.type === "pending") startCreate(p.day, p.min);
    }, touch ? 380 : 200);
    attach({ type: "pending", x: e.clientX, y: e.clientY, day: p.day, min: p.min, touch, timer });
  }

  function onEventDown(e: RPointerEvent, ev: CalendarEvent, type: DragType) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const p = slotAt(e.clientX, e.clientY);
    attach({ type, id: ev.id, x: e.clientX, y: e.clientY, origStart: ev.start, origEnd: ev.end, pMin: p.min, moved: false, reminder: ev.kind === "reminder" });
  }

  return (
    <div
      className={`card tg ${dragging ? "is-dragging" : ""}`}
      style={{ ["--days" as string]: days.length, ["--hour" as string]: `${HOUR_PX}px` }}
    >
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
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  className={`chip ${e.kind === "reminder" ? "chip-reminder" : ""} ${e.done ? "is-done" : ""}`}
                  style={{ ["--c" as string]: CALENDARS[e.calendar].color }}
                  onClick={() => onSelect(e.id)}
                  onKeyDown={(k) => k.key === "Enter" && onSelect(e.id)}
                >
                  {e.kind === "reminder" && <Check done={!!e.done} overdue={!e.done && e.end < now} onToggle={() => onToggle(e.id)} />}
                  <span className="chip-text">{e.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-row tg-body" ref={bodyRef} style={{ height: hours.length * HOUR_PX }}>
          <div className="tg-gutter tg-hours">
            {hours.slice(1).map((h) => (
              <span key={h} style={{ top: (h - HOUR_START) * HOUR_PX }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
            {hasToday && (
              <span className="tg-now-pill" style={{ top: nowTop }}>
                {fmt.time.format(now)}
              </span>
            )}
          </div>

          {days.map((d, di) => {
            const today = sameDay(d, now);
            const timed = shown.filter((e) => !e.allDay && sameDay(e.start, d));
            return (
              <div key={d.toISOString()} className={`tg-col ${today ? "is-today" : ""}`} onPointerDown={onColDown}>
                {sleep &&
                  sleepForDay(sleep, d).map((p) => {
                    const top = yOf(p.from);
                    const h = yOf(p.to) - top;
                    const total = fmtDuration(asleepMinutes(p.session));
                    const tip = `Sueño ${total} · ${fmt.time.format(p.session.start)} → ${fmt.time.format(p.session.end)}`;
                    return (
                      <div key={p.session.id} className="sleep" style={{ top, height: h }} title={tip}>
                        <span className="hypno">
                          {p.samples.map((x, i) => (
                            <span
                              key={i}
                              style={{
                                top: yOf(x.from) - top,
                                height: Math.max(1, yOf(x.to) - yOf(x.from)),
                                left: STAGES[x.stage].lane * 4,
                                background: STAGES[x.stage].color,
                              }}
                            />
                          ))}
                        </span>
                        {h > 24 && p.hasEnd && (
                          <span className="sleep-label bottom">
                            <Moon size={11} /> {total}
                            <span className="muted">· {fmt.time.format(p.session.end)}</span>
                          </span>
                        )}
                        {h > 24 && p.hasStart && !p.hasEnd && (
                          <span className="sleep-label top">
                            <Moon size={11} /> {fmt.time.format(p.session.start)}
                          </span>
                        )}
                      </div>
                    );
                  })}

                {layout(timed).map(({ e, lane, lanes }) => (
                  <EventBlock
                    key={e.id}
                    e={e}
                    lane={lane}
                    lanes={lanes}
                    now={now}
                    active={draft?.id === e.id}
                    onDown={onEventDown}
                    onSelect={onSelect}
                    onToggle={onToggle}
                  />
                ))}

                {ghost?.day === di && (
                  <div className="ev ev-ghost" style={{ top: yOf(ghost.from) + 1, height: Math.max(yOf(ghost.to) - yOf(ghost.from) - 3, 18), left: 3, right: 3 }}>
                    <span className="ev-title">Nuevo evento</span>
                    <span className="ev-time">
                      {toHHMM(ghost.from)} – {toHHMM(ghost.to)}
                    </span>
                  </div>
                )}

                {hasToday && <div className={`tg-now ${today ? "strong" : ""}`} style={{ top: nowTop }} />}
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
  now,
  active,
  onDown,
  onSelect,
  onToggle,
}: {
  e: CalendarEvent;
  lane: number;
  lanes: number;
  now: Date;
  active: boolean;
  onDown: (ev: RPointerEvent, e: CalendarEvent, type: DragType) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const reminder = e.kind === "reminder";
  const focus = e.kind === "focus";
  const sMin = minOf(e.start);
  const top = yOf(sMin) + 1;
  const height = reminder ? REMINDER_PX : Math.max(yOf(minOf(e.end) || 1440) - yOf(sMin) - 3, 20);
  const compact = !reminder && height < 40;
  const time = `${fmt.time.format(e.start)} – ${fmt.time.format(e.end)}`;
  const cls = [
    "ev",
    focus && "ev-focus",
    reminder && "ev-reminder",
    reminder && e.done && "is-done",
    compact && "ev-compact",
    e.end < now && !active && "ev-past",
    active && "is-active",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="button"
      tabIndex={0}
      className={cls}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 3px)`,
        width: `calc(${100 / lanes}% - 6px)`,
        ["--c" as string]: CALENDARS[e.calendar].color,
      }}
      onPointerDown={(ev) => onDown(ev, e, "move")}
      onKeyDown={(k) => k.key === "Enter" && onSelect(e.id)}
      title={reminder ? `${e.title} · ${fmt.time.format(e.start)}` : `${e.title} · ${time}`}
    >
      {reminder ? (
        <span className="ev-title">
          <Check done={!!e.done} overdue={!e.done && e.start < now} onToggle={() => onToggle(e.id)} />
          <span className="ev-name">{e.title}</span>
          <span className="ev-time">{fmt.time.format(e.start)}</span>
        </span>
      ) : (
        <>
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
          <span className="ev-handle top" onPointerDown={(ev) => onDown(ev, e, "resize-start")} />
          <span className="ev-handle bottom" onPointerDown={(ev) => onDown(ev, e, "resize-end")} />
        </>
      )}
    </div>
  );
}

// Overlap layout: each event takes the first free lane in its cluster.
function layout(evts: CalendarEvent[]) {
  const endOf = (e: CalendarEvent) => (e.kind === "reminder" ? +e.start + 30 * 60_000 : +e.end);
  const sorted = [...evts].sort((a, b) => +a.start - +b.start || endOf(b) - endOf(a));
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
    cluster.forEach((c) => (laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? 0, endOf(c.e))));
    let lane = laneEnds.findIndex((end) => end <= +e.start);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ e, lane });
    clusterEnd = Math.max(clusterEnd, endOf(e));
  }
  if (cluster.length) flush();
  return out;
}
