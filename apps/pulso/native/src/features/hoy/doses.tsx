import type { OutputOf } from "@/contract";
import { useAction } from "@/data/actions";
import { useOperation } from "@/data/queries";
import { Button } from "@/ui/Button";
import { ListRow } from "@/ui/ListRow";
import { useToast } from "@/ui/Toast";
import { haptics } from "@/ui/haptics";
import { clock, localDate } from "./format";

export type DoseSlot = OutputOf<"get_medication_day">["slots"][number];

const MOMENT: Record<string, string> = {
  entreno: "TRAS ENTRENAR",
  desayuno: "DESAYUNO",
  comida: "COMIDA",
  cena: "CENA",
  dormir: "AL DORMIR",
  manana: "MAÑANA",
  tarde: "TARDE",
  noche: "NOCHE",
  dia: "HOY",
};

const amount = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 2 }).replace(/,/g, " ");

/** Today's doses as of now: what the engine resolved for this minute. */
export function useDoseDay() {
  const now = new Date();
  return useOperation("get_medication_day", { date: localDate(now), time: clock(now) });
}

/** «Vitamina D · 2 000 UI» */
export const doseTitle = (s: DoseSlot) => `${s.name} · ${amount(s.dose)} ${s.unit}`;

/** «21:00 · CREATINA ✓ 09:02»: when it's due, then the day's taken ones. */
export function doseSubtitle(slot: DoseSlot, taken: DoseSlot[]): string {
  const when = slot.time ?? slot.training?.plannedAt ?? MOMENT[slot.moment] ?? slot.slot.toUpperCase();
  const done = taken
    .filter((t) => t.takenAt)
    .slice(0, 2)
    .map((t) => `${t.name} ✓ ${clock(new Date(t.takenAt!))}`);
  return [when, ...done].join(" · ");
}

/** «TOMAR»: records the dose, with «Deshacer» in the toast (undo_dose). */
export function useTakeDose() {
  const { run } = useAction();
  const toast = useToast();
  return async (slot: DoseSlot) => {
    try {
      const event = await run("record_dose", { medicationId: slot.medicationId, date: slot.date, scheduledTime: slot.slot, status: "tomada" });
      haptics.success();
      toast.show({ message: `${slot.name} tomada`, icon: "pills.fill", undo: () => run("undo_dose", { id: event.id }) });
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "No se pudo anotar la dosis.", tone: "error" });
    }
  };
}

/** A pending dose as a row with «TOMAR». */
export function DoseRow({ slot, taken, onTake }: { slot: DoseSlot; taken: DoseSlot[]; onTake: (s: DoseSlot) => void }) {
  return (
    <ListRow
      testID={`dose-${slot.medicationId}-${slot.slot}`}
      icon="pills.fill"
      title={doseTitle(slot)}
      subtitle={doseSubtitle(slot, taken)}
      trailing={<Button title="Tomar" onPress={() => onTake(slot)} testID="dose-take" />}
    />
  );
}
