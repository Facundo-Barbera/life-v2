"use client";

import { useEffect } from "react";
import { Clock, Lock, MapPin, Video, X } from "lucide-react";
import { CALENDARS, type CalendarEvent } from "@/lib/sample-events";
import { cap, fmt, fmtDuration } from "@/lib/date";
import { Avatars } from "./ui";

export function EventDialog({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const cal = CALENDARS[event.calendar];
  const minutes = (+event.end - +event.start) / 60_000;

  return (
    <div className="dlg-backdrop" onClick={onClose}>
      <div className="dlg" role="dialog" aria-label={event.title} onClick={(e) => e.stopPropagation()} style={{ ["--c" as string]: cal.color }}>
        <header className="dlg-head">
          <span className="dlg-cal">
            <span className="dot" />
            {cal.label}
            {event.kind === "focus" && (
              <span className="tag">
                <Lock size={11} /> Enfoque
              </span>
            )}
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>
        <h2>{event.title}</h2>
        <ul className="dlg-meta">
          <li>
            <Clock size={15} />
            <span>
              {cap(fmt.long.format(event.start))}
              <br />
              <span className="muted">
                {event.allDay ? "Todo el día" : `${fmt.time.format(event.start)} – ${fmt.time.format(event.end)} · ${fmtDuration(minutes)}`}
              </span>
            </span>
          </li>
          {event.location && (
            <li>
              <MapPin size={15} />
              <span>{event.location}</span>
            </li>
          )}
          {event.video && (
            <li>
              <Video size={15} />
              <span>Videollamada</span>
            </li>
          )}
        </ul>
        {event.people?.length ? (
          <div className="dlg-people">
            <Avatars people={event.people} max={6} />
            <span className="muted">{event.people.join(", ")}</span>
          </div>
        ) : null}
        <p className="dlg-note">Evento de ejemplo · solo lectura</p>
      </div>
    </div>
  );
}
