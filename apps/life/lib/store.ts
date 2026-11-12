// Per-browser persistence for the prototype. Everything stays local.
import type { CalendarEvent } from "./sample-events";

const ITEMS = "life-v2:items:v1";
const SLEEP = "life-v2:sleep-ui:v1";

export function loadItems(): CalendarEvent[] | null {
  try {
    const raw = localStorage.getItem(ITEMS);
    if (!raw) return null;
    return (JSON.parse(raw) as (Omit<CalendarEvent, "start" | "end"> & { start: string; end: string })[]).map((e) => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end),
    }));
  } catch {
    return null;
  }
}

export function saveItems(items: CalendarEvent[]) {
  try {
    localStorage.setItem(ITEMS, JSON.stringify(items));
  } catch {}
}

export function loadSleep(): { show: boolean } | null {
  try {
    const raw = localStorage.getItem(SLEEP);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSleep(v: { show: boolean }) {
  try {
    localStorage.setItem(SLEEP, JSON.stringify(v));
  } catch {}
}

export function clearStore() {
  try {
    localStorage.removeItem(ITEMS);
    localStorage.removeItem(SLEEP);
  } catch {}
}

// crypto.randomUUID needs a secure context; the tailnet URL is plain http.
export const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
