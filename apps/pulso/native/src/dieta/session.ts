import type { PlanSlot } from "@/contract";

// «Lo cambié por…»: while a planned meal is being replaced, every entry logged
// (by the register sheet, a snack, a dish or the barcode screen) is noted, and
// when the person is done they become that meal's real meal, with Deshacer.

type Replacing = { slot: PlanSlot; ids: string[] };
let replacing: Replacing | null = null;

export const beginReplacing = (slot: PlanSlot) => void (replacing = { slot, ids: [] });
export const currentReplacing = () => replacing?.slot ?? null;
/** Every logging path calls this with the entries it created. */
export const noteLogged = (ids: string[]) => void replacing?.ids.push(...ids);
/** Ends the flow: the slot and what was logged, or null when nothing was. */
export function finishReplacing(): Replacing | null {
  const r = replacing;
  replacing = null;
  return r?.ids.length ? r : null;
}
