"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePopover } from "./popover";

export type SelectOption<T extends string> = { id: T; label: string; color?: string; icon?: ReactNode };

/** Compact dropdown; options may carry a color dot (calendars) or an icon. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  label: string;
}) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const cur = options.find((o) => o.id === value) ?? options[0];
  const lead = (o: SelectOption<T>) => (o.color ? <span className="dot" style={{ background: o.color }} /> : o.icon);
  return (
    <div className="ui-pop-anchor" ref={ref}>
      <button type="button" className="ui-chip-input ui-select" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        {lead(cur)}
        {cur.label}
        <ChevronDown size={13} className="muted" />
      </button>
      {open && (
        <div className="ui-pop ui-menu" role="listbox">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {lead(o)}
              <span>{o.label}</span>
              {o.id === value && <Check size={13} className="ui-menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
