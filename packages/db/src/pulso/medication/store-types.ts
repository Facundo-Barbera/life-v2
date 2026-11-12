import type { MedicationKind } from "../../types";
import { type DayFacts, type DoseEvent, type DoseMoment, type DoseWindow, type Med, resolveSlots, slotKey, type TrainingSlot } from "./schedule";

export type SlotStatus = "tomada" | "omitida" | "pospuesta" | "pendiente";

/** One expected dose on one day, with what happened to it. */
export type DoseSlot = {
  medicationId: string;
  name: string;
  kind: MedicationKind;
  dose: number;
  unit: string;
  instructions: string | null;
  date: string;
  /** "HH:MM" or a moment key (entreno, desayuno, comida, cena, dormir, manana, tarde, noche, dia). */
  slot: string;
  moment: DoseMoment;
  time: string | null;
  training: TrainingSlot | null;
  window: DoseWindow | null;
  remindAt: string | null;
  status: SlotStatus;
  /** The logged dose row, null while pending. */
  doseId: string | null;
  takenAt: number | null;
};

/** Every slot of each date with its status, resolved against that date's facts. Pure. */
export function slotsOn(meds: Med[], dates: string[], events: DoseEvent[], factsOf: (date: string) => DayFacts, today: string, now: string): DoseSlot[] {
  const bySlot = new Map(events.filter((e) => e.scheduledTime).map((e) => [slotKey(e.medicationId, e.date, e.scheduledTime!), e]));
  return dates.flatMap((date) =>
    meds
      .flatMap((med) =>
        resolveSlots(med, date, factsOf(date), today, now).map((r): DoseSlot => {
          const event = bySlot.get(slotKey(med.id, date, r.slot));
          return {
            medicationId: med.id,
            name: med.name,
            kind: med.kind,
            dose: med.dose,
            unit: med.unit,
            instructions: med.instructions,
            date,
            ...r,
            status: event?.status ?? "pendiente",
            doseId: event?.id ?? null,
            takenAt: event?.takenAt ?? null,
          };
        }),
      )
      .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || a.name.localeCompare(b.name)),
  );
}
