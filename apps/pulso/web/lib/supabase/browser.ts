"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database, LifeClient } from "@life/db";
import { supabaseEnv } from "./env";

let client: LifeClient | null = null;

/** The browser's Supabase client (session in cookies, shared with the server). */
export function browserClient(): LifeClient {
  if (client) return client;
  const env = supabaseEnv();
  if (!env) throw new Error("Falta conectar Supabase (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  client = createBrowserClient<Database>(env.url, env.anonKey) as unknown as LifeClient;
  return client;
}
