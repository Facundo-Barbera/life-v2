import type { LifeClient } from "../index";

/** The `pulso` schema of a client: `pulso(client).from("meals")`. */
export const pulso = (client: LifeClient) => client.schema("pulso");

/** The `life` schema of a client. */
export const life = (client: LifeClient) => client.schema("life");

/** Thrown by data functions; `message` is Spanish and safe to show. */
export class PulsoError extends Error {
  constructor(
    message: string,
    readonly code: "auth" | "not_found" | "invalid" | "conflict" | "db" = "db",
  ) {
    super(message);
    this.name = "PulsoError";
  }
}

/** Unwraps a supabase-js result; any error becomes a PulsoError. */
export function must<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) {
    const conflict = result.error.code === "23505";
    throw new PulsoError(conflict ? "Ya existe." : `No se pudo guardar: ${result.error.message}`, conflict ? "conflict" : "db");
  }
  if (result.data === null) throw new PulsoError("No encontrado.", "not_found");
  return result.data;
}

/** The signed-in user's id (from the local session; RLS still checks every row). */
export async function userId(client: LifeClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new PulsoError("Inicia sesión para continuar.", "auth");
  return id;
}
