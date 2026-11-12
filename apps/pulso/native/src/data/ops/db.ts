import { PulsoError } from "@life/db/pulso";
import type { Ctx } from "./types";

// Small helpers over supabase-js for the operations.

export const P = (ctx: Ctx) => ctx.db.schema("pulso");

type Err = { message: string; code?: string } | null;
type Data<R> = R extends { data: infer D } ? NonNullable<D> : never;

/** The rows, or a Spanish error. */
export function rows<R extends { data: unknown; error: Err }>(result: R): Data<R> {
  if (result.error) throw new PulsoError(`No se pudo leer: ${result.error.message}`);
  return (result.data ?? []) as Data<R>;
}

/** One row (or null). */
export function maybe<R extends { data: unknown; error: Err }>(result: R): Data<R> | null {
  if (result.error) throw new PulsoError(`No se pudo leer: ${result.error.message}`);
  return (result.data ?? null) as Data<R> | null;
}

/** One row that must exist. */
export function one<R extends { data: unknown; error: Err }>(result: R, what = "Eso"): Data<R> {
  if (result.error) {
    if (result.error.code === "PGRST116") throw new PulsoError(`${what} ya no existe.`, "not_found");
    throw new PulsoError(`No se pudo guardar: ${result.error.message}`);
  }
  if (result.data == null) throw new PulsoError(`${what} ya no existe.`, "not_found");
  return result.data as Data<R>;
}

/** A write without a returned row. */
export function ok(result: { error: { message: string } | null }): void {
  if (result.error) throw new PulsoError(`No se pudo guardar: ${result.error.message}`);
}

export const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);
export const iso = (epochMs: number): string => new Date(epochMs).toISOString();
export const n = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v));
export const nn = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v));
