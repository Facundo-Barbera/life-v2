"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CALENDARS, type CalendarEvent, type CalendarId, getSampleEvents } from "@/lib/sample-events";
import { addDays, cap, fmt, fmtDuration, isoWeek, mon, sameDay, startOfDay, startOfWeek } from "@/lib/date";
import { type SleepSession, asleepMinutes, getSampleSleep } from "@/lib/sleep";
import { clearStore, loadItems, loadSleep, newId, saveItems, saveSleep } from "@/lib/store";
import { Sidebar } from "./sidebar";
import { TimeGrid } from "./time-grid";
import { MonthGrid } from "./month-grid";
import { MiniMonth, Reminders, Upcoming } from "./rail";
import { EventDialog } from "./event-dialog";

export type View = "day" | "week" | "month";

const VIEWS: { id: View; label: string }[] = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

function shift(c: Date, view: View, dir: number): Date {
  if (view === "day") return addDays(c, dir);
  if (view === "week") return addDays(c, 7 * dir);
  return new Date(c.getFullYear(), c.getMonth() + dir, 1);
}

export function CalendarApp() {
  // Client-only: "today" and the generated data follow the viewer's clock.
  const [now, setNow] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);
  const [view, setView] = useState<View>("week");
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [showSleep, setShowSleep] = useState(true);
  const [hidden, setHidden] = useState<Set<CalendarId>>(new Set());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; isNew: boolean } | null>(null);
  const [place, setPlace] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const n = new Date();
    setNow(n);
    setCursor(n);
    setItems(loadItems() ?? getSampleEvents(n));
    const s = loadSleep();
    if (s) setShowSleep(s.show);
    if (window.innerWidth < 720) setView("day");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    setPlace(tz.split("/").pop()?.replace(/_/g, " ") ?? "");
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (items) saveItems(items);
  }, [items]);
  useEffect(() => {
    if (now) saveSleep({ show: showSleep });
  }, [showSleep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recorded sleep (sample data for now; HealthKit later). Not editable.
  const sleep = useMemo(() => (now ? getSampleSleep(now) : []), [now?.toDateString(), now && now.getHours()]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => (items ?? []).slice().sort((a, b) => +a.start - +b.start), [items]);
  const events = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((e) => !hidden.has(e.calendar) && (!q || e.title.toLowerCase().includes(q)));
  }, [all, hidden, query]);

  // ---------- mutations ----------
  const update = useCallback((id: string, patch: Partial<CalendarEvent>) => {
    setItems((list) => list && list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);
  const toggle = useCallback((id: string) => {
    setItems((list) => list && list.map((e) => (e.id === id ? { ...e, done: !e.done } : e)));
  }, []);
  const create = useCallback((start: Date, end: Date) => {
    const id = newId();
    setItems((list) => [...(list ?? []), { id, title: "", start, end, calendar: "personal", kind: "event" }]);
    setSelected({ id, isNew: true });
  }, []);
  const remove = useCallback((id: string) => {
    setItems((list) => list && list.filter((e) => e.id !== id));
    setSelected(null);
  }, []);
  const closeDialog = useCallback(() => {
    setSelected((sel) => {
      if (sel) {
        setItems((list) =>
          list &&
          list.map((e) => (e.id === sel.id && !e.title.trim() ? { ...e, title: e.kind === "reminder" ? "Nuevo recordatorio" : "Nuevo evento" } : e)),
        );
      }
      return null;
    });
  }, []);
  const select = useCallback((id: string) => setSelected({ id, isNew: false }), []);
  const reset = useCallback(() => {
    if (!confirm("¿Restablecer los datos de ejemplo? Se pierden los cambios locales.")) return;
    clearStore();
    setItems(getSampleEvents(new Date()));
    setShowSleep(true);
    setSelected(null);
  }, []);

  const step = useCallback((dir: number) => setCursor((c) => (c ? shift(c, view, dir) : c)), [view]);
  const goToday = useCallback(() => setCursor(new Date()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const t = e.target as HTMLElement;
      if (selected || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "t") goToday();
      else if (k === "d") setView("day");
      else if (k === "w") setView("week");
      else if (k === "m") setView("month");
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, goToday, selected]);

  if (!now || !cursor || !items) return <div className="app" />;

  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const days = view === "day" ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const inWeek = (e: CalendarEvent) => e.start >= weekStart && e.start < addDays(weekStart, 7);

  const counts = Object.fromEntries(
    (Object.keys(CALENDARS) as CalendarId[]).map((id) => [id, all.filter((e) => e.calendar === id && inWeek(e)).length]),
  ) as Record<CalendarId, number>;

  const upcoming = events.filter((e) => !e.allDay && e.kind !== "reminder" && e.end > now);
  const selectedEvent = selected ? items.find((e) => e.id === selected.id) : undefined;

  let title: string;
  let subtitle: string;
  if (view === "day") {
    title = sameDay(cursor, now) ? "Hoy" : cap(fmt.weekdayLong.format(cursor));
    subtitle = cap(fmt.long.format(cursor));
  } else if (view === "week") {
    title = now >= weekStart && now < addDays(weekStart, 7) ? "Esta semana" : `Semana ${isoWeek(cursor)}`;
    subtitle =
      weekStart.getMonth() === weekEnd.getMonth()
        ? `${weekStart.getDate()} – ${weekEnd.getDate()} ${mon(weekEnd)} ${weekEnd.getFullYear()}`
        : `${weekStart.getDate()} ${mon(weekStart)} – ${weekEnd.getDate()} ${mon(weekEnd)} ${weekEnd.getFullYear()}`;
  } else {
    title = cap(fmt.monthYear.format(cursor));
    subtitle = `${events.filter((e) => e.start.getMonth() === cursor.getMonth() && e.start.getFullYear() === cursor.getFullYear()).length} elementos`;
  }
  if (place) subtitle += ` · ${place}`;

  return (
    <div className="app">
      <Sidebar
        view={view}
        onView={setView}
        onToday={() => {
          goToday();
          setView("day");
        }}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        hidden={hidden}
        onToggle={(id) =>
          setHidden((h) => {
            const n = new Set(h);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        counts={counts}
        next={upcoming[0]}
        now={now}
        onSelect={select}
        lastNight={sleep[sleep.length - 1]}
        showSleep={showSleep}
        onShowSleep={setShowSleep}
        onReset={reset}
      />

      <main className="main">
        <header className="main-head">
          <div className="heading">
            <div className="title-row">
              <h1>{title}</h1>
              <span className="badge">W{isoWeek(cursor)}</span>
            </div>
            <p className="subtitle">{subtitle}</p>
          </div>
          <div className="head-actions">
            <div className="btn-group">
              <button className="icon-btn" aria-label="Anterior" onClick={() => step(-1)}>
                <ChevronLeft size={16} />
              </button>
              <button className="today-btn" onClick={goToday}>
                Hoy
              </button>
              <button className="icon-btn" aria-label="Siguiente" onClick={() => step(1)}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="seg" role="tablist">
              {VIEWS.map((v) => (
                <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {view === "week" && <WeekStats events={events.filter(inWeek)} weekStart={weekStart} sleep={sleep} now={now} />}

        <div className="main-body">
          {view === "month" ? (
            <MonthGrid
              cursor={cursor}
              now={now}
              events={events}
              onSelect={select}
              onToggle={toggle}
              onPickDay={(d) => {
                setCursor(d);
                setView("day");
              }}
            />
          ) : (
            <TimeGrid
              days={days}
              now={now}
              events={events}
              sleep={showSleep ? sleep : null}
              onSelect={select}
              onChange={update}
              onCreate={create}
              onToggle={toggle}
            />
          )}
        </div>
      </main>

      <aside className="rail">
        <MiniMonth cursor={cursor} now={now} events={events} highlightWeek={view === "week"} onPick={setCursor} />
        <Reminders events={events} now={now} weekStart={weekStart} onSelect={select} onToggle={toggle} />
        <Upcoming events={upcoming} now={now} onSelect={select} />
      </aside>

      {selectedEvent && selected && (
        <EventDialog
          key={selectedEvent.id}
          event={selectedEvent}
          isNew={selected.isNew}
          now={now}
          onChange={(patch) => update(selectedEvent.id, patch)}
          onDelete={() => remove(selectedEvent.id)}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

function WeekStats({ events, weekStart, sleep, now }: { events: CalendarEvent[]; weekStart: Date; sleep: SleepSession[]; now: Date }) {
  const timed = events.filter((e) => !e.allDay && e.kind !== "reminder");
  const meetings = timed.filter((e) => e.kind !== "focus");
  const focus = timed.filter((e) => e.kind === "focus");
  const focusMin = focus.reduce((s, e) => s + (+e.end - +e.start) / 60_000, 0);
  const reminders = events.filter((e) => e.kind === "reminder");
  const remDone = reminders.filter((e) => e.done).length;
  const overdue = reminders.filter((e) => !e.done && e.end < now).length;
  // Nights that ended inside this week.
  const nights = sleep.filter((n) => n.end >= weekStart && n.end < addDays(weekStart, 7));
  const avgSleep = nights.length ? nights.reduce((a, n) => a + asleepMinutes(n), 0) / nights.length : 0;

  // Meeting-free time inside working hours (Mon–Fri, 09–18).
  let busyMin = 0;
  for (let i = 0; i < 5; i++) {
    const d = addDays(weekStart, i);
    const ws = new Date(d).setHours(9, 0, 0, 0);
    const we = new Date(d).setHours(18, 0, 0, 0);
    const spans = meetings
      .filter((e) => sameDay(e.start, d))
      .map((e) => [Math.max(+e.start, ws), Math.min(+e.end, we)] as const)
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let curEnd = ws;
    for (const [a, b] of spans) {
      const from = Math.max(a, curEnd);
      if (b > from) busyMin += (b - from) / 60_000;
      curEnd = Math.max(curEnd, b);
    }
  }
  const freeMin = 5 * 9 * 60 - busyMin;

  return (
    <div className="stats">
      <div className="stat">
        <span className="stat-label">Eventos</span>
        <span className="stat-row">
          <strong>{meetings.length}</strong>
          <span className="pill">{fmtDuration(freeMin)} sin reuniones</span>
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">Enfoque protegido</span>
        <span className="stat-row">
          <strong>{fmtDuration(focusMin)}</strong>
          <span className="pill pill-green">{focus.length} bloques</span>
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">Recordatorios</span>
        <span className="stat-row">
          <strong>
            {remDone}/{reminders.length}
          </strong>
          {overdue > 0 ? <span className="pill pill-red">{overdue} vencido{overdue > 1 ? "s" : ""}</span> : <span className="pill pill-green">al día</span>}
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">Sueño promedio</span>
        <span className="stat-row">
          <strong>{nights.length ? fmtDuration(avgSleep) : "—"}</strong>
          <span className="pill pill-violet">
            {nights.length} noche{nights.length === 1 ? "" : "s"}
          </span>
        </span>
      </div>
    </div>
  );
}
