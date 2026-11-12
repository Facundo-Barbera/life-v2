"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDuration, parseTime, toHHMM } from "@/lib/date";
import { usePopover } from "./popover";

/**
 * Time input: type freely ("9", "930", "21:15") or pick from a 15-minute list.
 * With `relativeTo`, the list starts there and shows durations (for end times).
 */
export function TimeField({
  value,
  onChange,
  relativeTo,
  label,
}: {
  value: number; // minutes from midnight
  onChange: (m: number) => void;
  relativeTo?: number;
  label: string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const [text, setText] = useState(toHHMM(value));
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setText(toHHMM(value)), [value]);

  const start = relativeTo !== undefined ? relativeTo + 15 : 0;
  const end = relativeTo !== undefined ? Math.min(1440, relativeTo + 24 * 60) : 1440 - 15;
  const options: number[] = [];
  for (let m = start; m <= end; m += 15) if (relativeTo === undefined || m <= 1440) options.push(m);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>("[aria-selected=true]") ?? listRef.current?.querySelector<HTMLElement>("[data-near=true]");
    el?.scrollIntoView({ block: "center" });
  }, [open]);

  const commit = () => {
    const m = parseTime(text);
    if (m === null) setText(toHHMM(value));
    else if (m !== value) onChange(m);
  };
  const near = options.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a), options[0] ?? 0);

  return (
    <div className="ui-pop-anchor" ref={ref}>
      <input
        className="ui-chip-input ui-time"
        aria-label={label}
        value={text}
        inputMode="numeric"
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const next = Math.min(1440, Math.max(0, value + (e.key === "ArrowDown" ? 15 : -15)));
            onChange(next);
          }
        }}
      />
      {open && (
        <div className="ui-pop ui-time-list" ref={listRef}>
          {options.map((m) => (
            <button
              key={m}
              type="button"
              aria-selected={m === value}
              data-near={m === near}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
            >
              <span>{m === 1440 ? "24:00" : toHHMM(m)}</span>
              {relativeTo !== undefined && <span className="muted">{fmtDuration(m - relativeTo)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
