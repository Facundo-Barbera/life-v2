"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, cap, fmt, sameDay, startOfWeek } from "@/lib/date";
import { usePopover } from "./popover";

const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];
const fmtButton = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function DateField({ value, onChange, label = "Fecha" }: { value: Date; onChange: (d: Date) => void; label?: string }) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(month), i));

  return (
    <div className="ui-pop-anchor" ref={ref}>
      <button
        type="button"
        className="ui-chip-input"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
          setOpen(!open);
        }}
      >
        {cap(fmtButton.format(value).replace(/\./g, ""))}
      </button>
      {open && (
        <div className="ui-pop ui-cal">
          <div className="ui-cal-head">
            <span>{cap(fmt.monthYear.format(month))}</span>
            <span>
              <button type="button" className="icon-btn" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" className="icon-btn" aria-label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight size={14} />
              </button>
            </span>
          </div>
          <div className="ui-cal-grid">
            {LETTERS.map((l) => (
              <span key={l} className="ui-cal-wd">
                {l}
              </span>
            ))}
            {cells.map((d) => (
              <button
                key={d.toISOString()}
                type="button"
                className={[
                  "ui-cal-day",
                  d.getMonth() !== month.getMonth() && "is-out",
                  sameDay(d, today) && "is-today",
                  sameDay(d, value) && "is-selected",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onChange(d);
                  setOpen(false);
                }}
              >
                {d.getDate()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
