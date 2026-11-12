// Auth for every app of the suite: one Supabase Auth user (auth.users), one
// passkey, the same database. No React here; each app wires its own UI.
//
// First sign-in: the person enters the e-mail they were invited with and gets
// a one-time code (signInWithOtp). The project's Before User Created hook
// (life.before_user_created) refuses e-mails without an open invitation. Once
// signed in, they register a passkey; after that, the passkey is enough.
import type { Invitation, LifeClient, Member } from "@life/db";

/** Spanish message for an auth error, safe to show. */
export function authMessage(error: unknown): string {
  const e = error as { message?: string; code?: string; error_code?: string; status?: number } | null;
  const code = e?.code ?? e?.error_code ?? "";
  const message = e?.message ?? "";
  if (/invitaci[oó]n/i.test(message)) return "Necesitas una invitación para crear tu cuenta.";
  if (code === "otp_expired" || /expired|invalid.*(otp|token)/i.test(message)) return "El código no es válido o ya caducó. Pide otro.";
  if (code === "over_email_send_rate_limit" || e?.status === 429) return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  if (code === "ERROR_CEREMONY_ABORTED" || /NotAllowedError|abort|cancel/i.test(message)) return "Se canceló la passkey.";
  if (code === "webauthn_challenge_expired") return "Tardaste demasiado. Vuelve a intentarlo.";
  if (/passkey|webauthn|credential/i.test(message)) return "No se pudo usar la passkey en este dispositivo.";
  if (/signups? not allowed|user not found/i.test(message)) return "Necesitas una invitación para crear tu cuenta.";
  return message || "Algo salió mal. Inténtalo de nuevo.";
}

/** Current user from the Supabase session (validated with the server), or null. */
export async function getSessionUser(client: LifeClient) {
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}

/** Sign in with a passkey already registered on this account (WebAuthn in the browser). */
export async function signInWithPasskey(client: LifeClient, options?: { conditional?: boolean; signal?: AbortSignal }) {
  const { data, error } = await client.auth.signInWithPasskey({
    options: { mediation: options?.conditional ? "conditional" : undefined, signal: options?.signal },
  });
  if (error) throw new Error(authMessage(error));
  return data;
}

/** Register a passkey for the signed-in user. */
export async function registerPasskey(client: LifeClient) {
  const { data, error } = await client.auth.registerPasskey();
  if (error) throw new Error(authMessage(error));
  return data;
}

export async function listPasskeys(client: LifeClient) {
  const { data, error } = await client.auth.passkey.list();
  if (error) throw new Error(authMessage(error));
  return data ?? [];
}

export async function deletePasskey(client: LifeClient, passkeyId: string) {
  const { error } = await client.auth.passkey.delete({ passkeyId });
  if (error) throw new Error(authMessage(error));
}

/**
 * Send a one-time code to an invited e-mail. `redirectTo` is where the magic
 * link in the same e-mail lands (the code alone also works).
 */
export async function sendEmailCode(client: LifeClient, email: string, redirectTo?: string) {
  const { error } = await client.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(authMessage(error));
}

export async function verifyEmailCode(client: LifeClient, email: string, code: string) {
  const { data, error } = await client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error) throw new Error(authMessage(error));
  return data;
}

export async function signOut(client: LifeClient) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

/** The signed-in user's membership, or null when they have no invitation. */
export async function getMembership(client: LifeClient, userId: string): Promise<Member | null> {
  const { data } = await client.schema("life").from("members").select("*").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

export async function listInvitations(client: LifeClient): Promise<Invitation[]> {
  const { data, error } = await client.schema("life").from("invitations").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Invite an e-mail (owners only; RLS enforces it). */
export async function createInvitation(client: LifeClient, invitedBy: string, email: string, note?: string) {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error("Ese correo no parece válido.");
  const { data, error } = await client
    .schema("life")
    .from("invitations")
    .insert({ email: clean, invited_by: invitedBy, note: note?.trim() || null })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ese correo ya tiene una invitación abierta.");
    if (error.code === "42501") throw new Error("Solo quien administra puede invitar.");
    throw new Error(error.message);
  }
  return data;
}

export async function revokeInvitation(client: LifeClient, id: string) {
  const { error } = await client.schema("life").from("invitations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
