import type { PulsoApi as LifeClient } from "@/data/api";
import { useEffect } from "react";
import { AppState } from "react-native";
import { WidgetStore } from "pulso-watch";
import { useEngine } from "@/data/session";
import { useHealthSync } from "@/health/sync";
import { dayKey } from "@/health/sync/days";
import { applying, clockTime, dosesOf, isEmpty, macrosOf, recoveryOf, workoutOf, type Update, type WidgetSnapshot } from "./snapshot";

// The app's side of the widgets (the SwiftUI app's WidgetSync): mark the
// extension as signed in, rewrite the snapshot, reload every timeline. In
// life-v2 the widgets never fetch on their own: the app keeps the snapshot.

const attempt = <T,>(work: Promise<T>): Promise<T | undefined> => work.catch(() => undefined);

function stored(): WidgetSnapshot | null {
  try {
    const json = WidgetStore.read();
    return json ? (JSON.parse(json) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
}

let running = false;

export async function refreshWidgets(client: LifeClient | null, signedIn: { url: string } | null, now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!client || !signedIn) {
      WidgetStore.mirrorPairing(null);
      WidgetStore.clear();
      return;
    }
    // The extension only checks that a "pairing" exists; no token is shared.
    WidgetStore.mirrorPairing({ baseUrl: signedIn.url, token: "signed-in" });
    const date = dayKey(now);
    const [readiness, nutrition, medication, program] = await Promise.all([
      attempt(client.call("get_readiness", {})),
      attempt(client.call("get_nutrition_day", { date })),
      attempt(client.call("get_medication_day", { date, time: clockTime(now) })),
      attempt(client.call("get_training_program", {})),
    ]);
    const update: Update = {
      recovery: readiness && recoveryOf(readiness),
      macros: nutrition && macrosOf(nutrition),
      doses: medication && dosesOf(medication),
      workout: program === undefined ? undefined : workoutOf(program),
    };
    if (!isEmpty(update)) WidgetStore.write(JSON.stringify(applying(update, stored(), now)));
  } finally {
    running = false;
    WidgetStore.reload();
  }
}

/** Mount once at the root: on sign-in changes, after each Salud sync, and when Pulso goes to the background. */
export function useWidgetSync() {
  const { client, credentials } = useEngine();
  const { lastSyncAt } = useHealthSync();
  useEffect(() => {
    if (credentials === undefined) return;
    const signedIn = credentials && client ? { url: "https://pulso.bixku.online" } : null;
    void refreshWidgets(client, signedIn);
    const subscription = AppState.addEventListener("change", (state) => state === "background" && void refreshWidgets(client, signedIn));
    return () => subscription.remove();
  }, [client, credentials, lastSyncAt]);
}
