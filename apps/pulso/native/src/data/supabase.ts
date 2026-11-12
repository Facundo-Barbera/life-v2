import { createLifeClient, type LifeClient } from "@life/db";
import * as SecureStore from "expo-secure-store";

// The phone's Supabase client. The session lives in the Keychain (SecureStore,
// after first unlock); SecureStore values are limited to ~2 KB, so long values
// are split into chunks.

const CHUNK = 1800;
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export const chunkedStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safe(key);
    const count = await SecureStore.getItemAsync(`${k}.n`, OPTIONS);
    if (count == null) return SecureStore.getItemAsync(k, OPTIONS);
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`, OPTIONS);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safe(key);
    await this.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), OPTIONS);
    await SecureStore.setItemAsync(`${k}.n`, String(n), OPTIONS);
  },
  async removeItem(key: string): Promise<void> {
    const k = safe(key);
    const count = await SecureStore.getItemAsync(`${k}.n`, OPTIONS);
    for (let i = 0; i < Number(count ?? 0); i++) await SecureStore.deleteItemAsync(`${k}.${i}`, OPTIONS);
    await SecureStore.deleteItemAsync(`${k}.n`, OPTIONS);
    await SecureStore.deleteItemAsync(k, OPTIONS);
  },
};

/** URL and anon key from `.env.local` (EXPO_PUBLIC_*, inlined at build time). */
export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

let client: LifeClient | null | undefined;

/** The one client, or null when the build has no Supabase settings. */
export function supabase(): LifeClient | null {
  if (client !== undefined) return client;
  const config = supabaseConfig();
  client = config
    ? createLifeClient(config.url, config.anonKey, {
        auth: { storage: chunkedStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;
  return client;
}
