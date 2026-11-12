import "server-only";
import type { ActionResult } from "@/components/client";

/** Runs a mutation for <ActionForm>; any thrown error becomes its Spanish message. */
export async function attempt(fn: () => Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Algo salió mal." };
  }
}

/** FormData readers. Empty strings are null. */
export const str = (d: FormData, k: string): string | null => {
  const v = d.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
export const num = (d: FormData, k: string): number | null => {
  const v = str(d, k);
  if (v == null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
export const bool = (d: FormData, k: string): boolean => {
  const v = d.get(k);
  return v === "on" || v === "true" || v === "1";
};
export function req<T>(v: T | null, what: string): T {
  if (v == null) throw new Error(`Falta ${what}.`);
  return v;
}
