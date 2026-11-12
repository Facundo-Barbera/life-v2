import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// While a workout is live and the person browses other tabs, the rail turns
// into the session's control: what's on (title, subtitle), a big timer and
// «VOLVER». The live-session feature drives it; the rail only renders it.

export type RailTimer =
  /** Counts down to `endsAt` (a rest), epoch ms; shows 0:00 after. */
  | { mode: "down"; endsAt: number }
  /** Counts up from `startedAt` (the session clock), epoch ms; frozen at `pausedAt` when paused. */
  | { mode: "up"; startedAt: number; pausedAt?: number | null };

export type RailSession = {
  /** «TORSO A · 7/18» */
  title: string;
  /** «DESCANSO», «SERIE 3 DE 4» */
  subtitle?: string;
  timer?: RailTimer;
  /** «VOLVER»: back to the live screen. */
  onReturn: () => void;
};

type RailState = {
  session: RailSession | null;
  /** Show (or replace) the session control on the rail. */
  setSession(session: RailSession | null): void;
  /** Hide the rail entirely (a full-screen flow inside the tabs). */
  hidden: boolean;
  setHidden(hidden: boolean): void;
};

export const RailContext = createContext<RailState | null>(null);

export function RailProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<RailSession | null>(null);
  const [hidden, setHidden] = useState(false);
  const value = useMemo(() => ({ session, setSession, hidden, setHidden }), [session, hidden]);
  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

export function useRail(): RailState {
  const rail = useContext(RailContext);
  if (!rail) throw new Error("useRail outside RailProvider");
  return rail;
}

/**
 * Keeps the rail's session control in step with a live session: pass the
 * current state (null when no session is live) from the live-session feature,
 * e.g. `useSessionRail(live ? { title, subtitle, timer, onReturn } : null)`.
 * Clears it on unmount.
 */
export function useSessionRail(session: RailSession | null) {
  const { setSession } = useRail();
  const key = session ? JSON.stringify({ ...session, onReturn: undefined }) : null;
  const onReturn = session?.onReturn;
  useEffect(() => setSession(session), [key, onReturn, setSession]);
  useEffect(() => () => setSession(null), [setSession]);
}

/** Hides the rail while the calling screen is mounted (and focused, if you pass `active`). */
export function useHideRail(active = true) {
  const { setHidden } = useRail();
  useEffect(() => {
    setHidden(active);
    return () => setHidden(false);
  }, [active, setHidden]);
}

/** Formats a rail timer at `now`: «1:26», «23:41», «1:02:10». */
export function formatTimer(timer: RailTimer, now: number): string {
  const ms = timer.mode === "down" ? Math.max(0, timer.endsAt - now) : Math.max(0, (timer.pausedAt ?? now) - timer.startedAt);
  const total = timer.mode === "down" ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Re-renders every second while `on`, returning now (epoch ms). */
export function useNow(on = true): number {
  const [now, setNow] = useState(Date.now);
  const tick = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    if (!on) return;
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [on, tick]);
  return now;
}
