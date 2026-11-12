import { PulsoError } from "@life/db/pulso";

// What a failed call means to the person, in Spanish. Two kinds the UI tells
// apart: no connection, and a session that ended (sign in again).

export class UnreachableError extends Error {
  constructor(cause?: unknown) {
    super("Sin conexión. Revisa tu internet.", { cause });
    this.name = "UnreachableError";
  }
}

/** Something the phone doesn't do yet (it lived on the Mac engine, or only the web has it). */
export class NotAvailableError extends Error {
  constructor(what = "Esto") {
    super(`${what} todavía no está en el teléfono. Hazlo en pulso.bixku.online.`);
    this.name = "NotAvailableError";
  }
}

export const isNotAvailable = (error: unknown): boolean => error instanceof NotAvailableError;

export const isUnpaired = (error: unknown): boolean =>
  (error instanceof PulsoError && error.code === "auth") || (error as { status?: number } | null)?.status === 401;

export const isUnreachable = (error: unknown): boolean =>
  error instanceof UnreachableError || (error instanceof TypeError && /network|fetch/i.test(error.message));

export function describeError(error: unknown): string {
  if (isUnreachable(error)) return "Sin conexión. Revisa tu internet.";
  if (isUnpaired(error)) return "Tu sesión terminó. Vuelve a entrar.";
  if (error instanceof Error && error.message) return error.message;
  return "Algo salió mal.";
}
