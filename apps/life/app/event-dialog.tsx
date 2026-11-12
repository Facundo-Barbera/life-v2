"use client";

import { useEffect, useRef } from "react";
import { Bell, CalendarDays, Clock, Lock, MapPin, Trash2, Users, Video, X } from "lucide-react";
import { CALENDARS, type CalendarEvent, type CalendarId } from "@/lib/sample-events";
import { atMinute, fmtDuration, minOfDay } from "@/lib/date";
import { Avatars, Button, Check, DateField, IconButton, Segmented, Select, Switch, TextField, TimeField } from "@/components/ui";

type Kind = NonNullable<CalendarEvent["kind"]>;

const KINDS = [
  { id: "event" as const, label: "Evento", icon: <CalendarDays size={13} /> },
  { id: "reminder" as const, label: "Recordatorio", icon: <Bell size={13} /> },
  { id: "focus" as const, label: "Enfoque", icon: <Lock size={13} /> },
];

const CAL_OPTIONS = (Object.keys(CALENDARS) as CalendarId[]).map((id) => ({ id, label: CALENDARS[id].label, color: CALENDARS[id].color }));

export function EventDialog({
  event,
  isNew,
  now,
  onChange,
  onDelete,
  onClose,
}: {
  event: CalendarEvent;
  isNew: boolean;
  now: Date;
  onChange: (patch: Partial<CalendarEvent>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const kind: Kind = event.kind ?? "event";
  const reminder = kind === "reminder";
  const sMin = minOfDay(event.start);
  const duration = reminder ? 0 : (+event.end - +event.start) / 60_000;

  const setKind = (k: Kind) => {
    if (k === kind) return;
    if (k === "reminder") onChange({ kind: k, end: event.start, done: false });
    else onChange({ kind: k, end: reminder ? new Date(+event.start + 30 * 60_000) : event.end, done: undefined });
  };
  const setDate = (d: Date) => onChange({ start: atMinute(d, sMin), end: atMinute(d, sMin + duration) });
  const setStart = (m: number) => {
    const s = Math.min(m, 1440 - Math.max(duration, 15));
    onChange({ start: atMinute(event.start, s), end: atMinute(event.start, s + duration) });
  };
  const setEnd = (m: number) => onChange({ end: atMinute(event.start, Math.max(m, sMin + 15)) });
  const setAllDay = (on: boolean) =>
    on
      ? onChange({ allDay: true, start: atMinute(event.start, 0), end: atMinute(event.start, 23 * 60 + 59) })
      : onChange({ allDay: false, start: atMinute(event.start, 9 * 60), end: atMinute(event.start, reminder ? 9 * 60 : 10 * 60) });

  return (
    <div className="dlg-backdrop" onPointerDown={onClose}>
      <div
        className="dlg"
        role="dialog"
        aria-label={event.title || "Nuevo evento"}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ ["--c" as string]: CALENDARS[event.calendar].color }}
      >
        <header className="dlg-head">
          <Segmented size="sm" value={kind} options={KINDS} onChange={setKind} />
          <IconButton label="Cerrar" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>

        <div className="dlg-title">
          {reminder && <Check done={!!event.done} overdue={!event.done && event.end < now} onToggle={() => onChange({ done: !event.done })} size={20} />}
          <TextField
            ref={titleRef}
            variant="title"
            className={event.done ? "is-done" : ""}
            value={event.title}
            placeholder={reminder ? "Nuevo recordatorio" : kind === "focus" ? "Bloque de enfoque" : "Nuevo evento"}
            onChange={(e) => onChange({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onClose()}
          />
        </div>

        <div className="dlg-rows">
          <div className="dlg-row">
            <Clock size={15} className="dlg-row-icon" />
            <div className="dlg-row-body">
              <div className="dlg-inline">
                <DateField value={event.start} onChange={setDate} />
                {!event.allDay && (
                  <>
                    <TimeField label="Inicio" value={sMin} onChange={setStart} />
                    {!reminder && (
                      <>
                        <span className="muted">→</span>
                        <TimeField label="Fin" value={minOfDay(event.end) || 1440} relativeTo={sMin} onChange={setEnd} />
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="dlg-inline dlg-sub">
                <Switch checked={!!event.allDay} onChange={setAllDay} label="Todo el día" />
                {!event.allDay && !reminder && <span className="muted">{fmtDuration(duration)}</span>}
              </div>
            </div>
          </div>

          <div className="dlg-row">
            <span className="dot dlg-row-icon" style={{ margin: "5px 4px" }} />
            <div className="dlg-row-body">
              <Select label="Calendario" value={event.calendar} options={CAL_OPTIONS} onChange={(calendar) => onChange({ calendar })} />
            </div>
          </div>

          {!reminder && (
            <div className="dlg-row">
              <MapPin size={15} className="dlg-row-icon" />
              <div className="dlg-row-body">
                <TextField variant="plain" value={event.location ?? ""} placeholder="Agregar lugar" onChange={(e) => onChange({ location: e.target.value || undefined })} />
              </div>
            </div>
          )}

          {event.video && (
            <div className="dlg-row">
              <Video size={15} className="dlg-row-icon" />
              <div className="dlg-row-body">Videollamada</div>
            </div>
          )}

          {event.people?.length ? (
            <div className="dlg-row">
              <Users size={15} className="dlg-row-icon" />
              <div className="dlg-row-body dlg-inline">
                <Avatars people={event.people} max={6} />
                <span className="muted">{event.people.join(", ")}</span>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="dlg-foot">
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={onDelete}>
            Eliminar
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Listo
          </Button>
        </footer>
      </div>
    </div>
  );
}
