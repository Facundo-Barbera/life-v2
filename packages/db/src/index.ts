import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type { Database } from "./types";
export type * from "./types";

export type LifeClient = SupabaseClient<Database>;

export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function createLifeClient(
  url: string,
  anonKey: string,
  options?: Parameters<typeof createClient<Database>>[2],
): LifeClient {
  return createClient<Database>(url, anonKey, options);
}

/** Browser / server client. Returns null if env vars are not set yet. */
export function tryCreateLifeClient(
  options?: Parameters<typeof createClient<Database>>[2],
): LifeClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createLifeClient(env.url, env.anonKey, options);
}
