import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database, LifeClient } from "@life/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getMembership } from "@life/auth";
import { supabaseEnv } from "./env";

/** A Supabase client acting as the signed-in person (their cookies), or null without env. */
export async function serverClient(): Promise<LifeClient | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  }) as unknown as LifeClient;
}

/**
 * The signed-in member and a client for them. Redirects to /entrar without a
 * session and to /sin-invitacion without a member row. Cached per request.
 */
export const requireMember = cache(async () => {
  const client = await serverClient();
  if (!client) redirect("/configurar");
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) redirect("/entrar");
  const member = await getMembership(client, user.id);
  if (!member) redirect("/sin-invitacion");
  return { client, user, member };
});
