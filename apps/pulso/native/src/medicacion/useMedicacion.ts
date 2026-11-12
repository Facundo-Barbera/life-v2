import type { DoseEvent, DoseSlot, Medication, ScheduleNudge } from "@/contract";
import { useCallback, useMemo, useState } from "react";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { useOperation } from "@/data/queries";
import { useDoseDay, useTakeDose } from "@/features/hoy/doses";
import { haptics } from "@/ui/haptics";
import { useToast } from "@/ui/Toast";
import { addDays, dateKey, draftInput, HISTORY_DAYS, sortHistory, type MedicationDraft } from "./model";
import { useAskForReminders } from "./reminders";
import { loadMemory, saveMemory } from "./storage";

/** Everything Medicación reads: the cabinet (paused ones too), today, adherence, the last 60 days and the suggestions. */
export function useMedicacion() {
  const today = dateKey(new Date());
  const medications = useOperation("get_medications", { all: true });
  const day = useDoseDay();
  const adherence = useOperation("get_adherence_report", { date: today });
  const doses = useOperation("list_doses", { from: addDays(today, -(HISTORY_DAYS - 1)), to: today });
  const suggested = useOperation("list_schedule_nudges", { date: today });
  const [dismissed, setDismissed] = useState(() => new Set(loadMemory().dismissedNudges));

  const history = useMemo(() => sortHistory(doses.data?.doses ?? []), [doses.data]);
  const nudges = useMemo(() => (suggested.data?.nudges ?? []).filter((n) => !dismissed.has(n.medicationId)), [suggested.data, dismissed]);
  const meds = medications.data?.medications ?? [];

  /** «Ahora no»: hides a suggestion on this phone for good. */
  const dismiss = useCallback((n: ScheduleNudge) => {
    const next = saveMemory((m) => ({ ...m, dismissedNudges: [...new Set([...m.dismissedNudges, n.medicationId])] }));
    setDismissed(new Set(next.dismissedNudges));
  }, []);

  const refetch = () => Promise.all([medications.refetch(), day.refetch(), adherence.refetch(), doses.refetch(), suggested.refetch()]);

  return {
    today,
    medications: meds,
    active: meds.filter((m) => m.active),
    lowStock: meds.filter((m) => m.active && m.lowStock),
    day: day.data,
    adherence: adherence.data,
    history,
    nudges,
    dismiss,
    loaded: medications.data !== undefined,
    error: medications.isError ? medications.error : null,
    refreshing: medications.isRefetching || day.isRefetching,
    refetch,
  };
}

/** Taking, skipping and undoing doses; adding, editing and deleting medications. Each one toasts, with «Deshacer» where it can. */
export function useMedicationActions() {
  const { run, busy } = useAction();
  const toast = useToast();
  const take = useTakeDose();
  const askForReminders = useAskForReminders();
  const fail = (e: unknown) => toast.show({ message: describeError(e), tone: "error" });

  const skip = async (slot: DoseSlot) => {
    try {
      const event = await run("record_dose", { medicationId: slot.medicationId, date: slot.date, scheduledTime: slot.slot, status: "omitida" });
      haptics.tap();
      toast.show({ message: `${slot.name} omitida`, icon: "xmark.circle", undo: () => run("undo_dose", { id: event.id }) });
    } catch (e) {
      fail(e);
    }
  };

  /** Back to pending; a taken dose goes back to stock. */
  const undo = async (slot: DoseSlot) => {
    if (!slot.eventId) return;
    try {
      await run("undo_dose", { id: slot.eventId });
      haptics.tap();
    } catch (e) {
      fail(e);
    }
  };

  /** An as-needed (or extra) intake, now. */
  const takeNow = async (m: Medication) => {
    try {
      const event = await run("record_dose", { medicationId: m.id, date: dateKey(new Date()), scheduledTime: null, status: "tomada", takenAt: Date.now() });
      haptics.success();
      toast.show({ message: `${m.name} tomada`, icon: "pills.fill", undo: () => run("undo_dose", { id: event.id }) });
    } catch (e) {
      fail(e);
    }
  };

  /** Removes one logged dose (a mistaken tap, a duplicate). */
  const removeEvent = async (e: DoseEvent) => {
    try {
      await run("undo_dose", { id: e.id });
      toast.show({ message: "Registro eliminado", icon: "trash" });
    } catch (error) {
      fail(error);
    }
  };

  const save = async (draft: MedicationDraft, id: string | null): Promise<boolean> => {
    try {
      const input = draftInput(draft);
      if (id) await run("edit_medication", { id, ...input });
      else await run("create_medication", input);
      haptics.success();
      toast.show({ message: id ? `${input.name} guardado` : `${input.name} añadido`, icon: "checkmark.circle.fill" });
      if (!draft.schedule.asNeeded) void askForReminders();
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const remove = async (m: Medication): Promise<boolean> => {
    try {
      await run("delete_medication", { id: m.id });
      toast.show({ message: `${m.name} eliminado`, icon: "trash" });
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  return { take, skip, undo, takeNow, removeEvent, save, remove, busy };
}
