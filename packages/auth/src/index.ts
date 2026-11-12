import type { LifeClient } from "@life/db";

/** Current user from the Supabase session, or null if signed out. */
export async function getSessionUser(client: LifeClient) {
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Start a passkey (WebAuthn) sign-in. Enable passkeys on the Supabase project
 * (Authentication → sign-in methods) before calling this from the app.
 * The actual UI wiring lives in each app; this package stays free of React.
 */
export async function signInWithPasskey(client: LifeClient) {
  const auth = client.auth as LifeClient["auth"] & {
    signInWithWebAuthn?: (args?: Record<string, unknown>) => Promise<unknown>;
  };
  if (typeof auth.signInWithWebAuthn !== "function") {
    throw new Error(
      "Passkeys are not available on this Supabase client. Enable them in the project and use a client that supports signInWithWebAuthn.",
    );
  }
  return auth.signInWithWebAuthn();
}

export async function signOut(client: LifeClient) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
