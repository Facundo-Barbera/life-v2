import type { PulsoApi as LifeClient } from "@/data/api";
import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useEngine } from "@/data/session";
import { describeError } from "@/data/errors";
import "../debug";
import { askHealth, healthAnswered } from "../access";
import { healthAvailable, READ_ACCESS } from "../healthkit";
import { healthKitSource } from "./healthkit-source";
import { runHealthSync, type SyncResult, type SyncStore } from "./run";

// Salud → the Mac on the phone: one sync at a time, on launch and every return
// to the foreground (as the SwiftUI app's Hoy did), and on demand («Sincronizar
// ahora», pull to refresh). `useHealthSync()` is what a screen reads.

export type HealthSyncStatus = {
  available: boolean;
  syncing: boolean;
  /** epoch ms of the last sync that finished; null before the first on this pairing. */
  lastSyncAt: number | null;
  lastResult: SyncResult | null;
  /** Spanish, for the person; null when the last sync went through. */
  error: string | null;
};

/** A foreground closer than this to the last sync doesn't start another. */
const MIN_INTERVAL_MS = 5 * 60_000;

let status: HealthSyncStatus = { available: healthAvailable(), syncing: false, lastSyncAt: null, lastResult: null, error: null };
const listeners = new Set<() => void>();
const set = (next: Partial<HealthSyncStatus>) => {
  status = { ...status, ...next };
  for (const listener of listeners) listener();
};

const options: SecureStore.SecureStoreOptions = { keychainService: "pulso.healthsync", keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** Anchors per user: another account on this phone starts from the full windows again. */
function keychainStore(deviceId: string): SyncStore {
  const key = (k: string) => `${deviceId}.${k}`.replace(/[^A-Za-z0-9._-]/g, "_");
  return {
    get: (k) => SecureStore.getItemAsync(key(k), options),
    set: (k, v) => (v === null ? SecureStore.deleteItemAsync(key(k), options) : SecureStore.setItemAsync(key(k), v, options)),
  };
}

let running: Promise<void> | null = null;
let lastClient: { client: LifeClient; deviceId: string } | null = null;
// Debug builds: a sync from the Hermes inspector (`await __pulsoHealthSync()`), for checks without tapping.
if (__DEV__)
  (globalThis as Record<string, unknown>).__pulsoHealthSync = async () => {
    if (lastClient) await syncHealth(lastClient.client, lastClient.deviceId);
    return status;
  };
let loadedFor: string | null = null;

async function loadLast(deviceId: string) {
  if (loadedFor === deviceId) return;
  loadedFor = deviceId;
  const at = await keychainStore(deviceId).get("lastSyncAt");
  set({ lastSyncAt: at ? Number(at) : null, lastResult: null, error: null });
}

/** Runs one sync (or joins the one running). Never throws: the outcome is in the status. */
export function syncHealth(client: LifeClient, deviceId: string): Promise<void> {
  lastClient = { client, deviceId };
  if (running) return running;
  if (!status.available) return Promise.resolve();
  running = (async () => {
    // Not answered yet: the sheet waits until nothing is presented (askHealth); the sync waits with it.
    if (!(await healthAnswered(READ_ACCESS))) await askHealth(READ_ACCESS).catch(() => false);
    set({ syncing: true });
    try {
      await loadLast(deviceId);
      const store = keychainStore(deviceId);
      const lastResult = await runHealthSync(healthKitSource, client, store);
      const lastSyncAt = Date.now();
      await store.set("lastSyncAt", String(lastSyncAt));
      set({ lastSyncAt, lastResult, error: null });
    } catch (error) {
      set({ error: describeError(error) });
    } finally {
      running = null;
      set({ syncing: false });
    }
  })();
  return running;
}

/** The sync status, and `sync()` for «Sincronizar ahora». */
export function useHealthSync(): HealthSyncStatus & { sync(): Promise<void> } {
  const { client, credentials } = useEngine();
  const current = useSyncExternalStore(
    (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    () => status,
  );
  return { ...current, sync: () => (client && credentials ? syncHealth(client, credentials.deviceId) : Promise.resolve()) };
}

/** Mount once at the root: syncs when the Mac answers, and on every return to the foreground. */
export function useHealthAutoSync() {
  const { client, credentials, reachability } = useEngine();
  useEffect(() => {
    if (!client || !credentials || reachability !== "online" || !status.available) return;
    const deviceId = credentials.deviceId;
    const maybe = () => {
      void loadLast(deviceId).then(() => {
        if (!status.lastSyncAt || Date.now() - status.lastSyncAt > MIN_INTERVAL_MS) void syncHealth(client, deviceId);
      });
    };
    maybe();
    const subscription = AppState.addEventListener("change", (state) => state === "active" && maybe());
    return () => subscription.remove();
  }, [client, credentials, reachability]);
}
