import { useEffect, useSyncExternalStore } from "react";
import { Watch, type Via, type WatchMessage, type WatchState } from "pulso-watch";

// The phone's side of the Watch, as far as the foundation goes: it listens
// from launch, keeps the Watch's state and its latest message, and lets a
// screen publish the session. What the SwiftUI app's WatchLink also does
// (who records, applying the Watch's edits to the live session, acknowledging
// them) arrives with the Entreno port; the messages are already typed.

type Snapshot = { state: WatchState; last: { message: WatchMessage; via: Via; at: number } | null };

let snapshot: Snapshot = { state: Watch.state(), last: null };
const listeners = new Set<() => void>();
const set = (next: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
};

let started = false;
function start() {
  if (started) return;
  started = true;
  Watch.onState((state) => set({ state }));
  Watch.onMessage((message, via) => set({ last: { message, via, at: Date.now() } }));
  set({ state: Watch.state() });
}

/** Mount once at the root: the bridge buffers until this listens. */
export function useWatchLink() {
  useEffect(start, []);
}

export function useWatch(): Snapshot {
  return useSyncExternalStore(
    (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    () => snapshot,
  );
}
