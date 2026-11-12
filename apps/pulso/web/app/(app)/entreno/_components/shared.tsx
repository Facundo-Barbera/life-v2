// Server-safe pieces shared by Entreno's pages.
import type { Exercise, LibraryExercise } from "@life/db";
import { fmtDay, fmtShortDate, STATUS_ES, WEEKDAY_SHORT, isoWeekday, type SessionStatus } from "@life/db/pulso";
import { Chip } from "@/components/ui";
import type { PickerItem } from "./picker";

export const STATUS_TONE: Record<SessionStatus, "green" | "amber" | "blue" | "red" | undefined> = {
  done: "green", partial: "amber", missed: "red", planned: undefined, skipped: undefined, in_progress: "blue",
};

export function StatusChip({ status }: { status: SessionStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_ES[status]}</Chip>;
}

/** «HOY · 18:00», «MAÑANA», «JUE 19 NOV». */
export function whenLabel(date: string | null, time: string | null, today: string): string {
  if (!date) return time ? `Sin fecha · ${time}` : "Sin fecha";
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const day = date === today ? "Hoy" : date === tomorrow ? "Mañana" : fmtDay(date);
  return time ? `${day} · ${time}` : day;
}

export const shortDay = (date: string | null) => (date ? `${WEEKDAY_SHORT[isoWeekday(date)]} ${fmtShortDate(date)}` : "—");

export function pickerItems(library: LibraryExercise[], personal: Exercise[]): PickerItem[] {
  const own = personal.filter((p) => !p.library_id).map((p) => ({ id: p.id, name: p.name, muscle: p.muscle_group ?? "full_body", equipment: p.equipment ?? "bodyweight", kind: p.kind ?? "compound", personal: true }));
  return [...own, ...library.map((l) => ({ id: l.id, name: l.name, muscle: String(l.muscle), equipment: String(l.equipment), kind: l.kind }))];
}

export const localTimeOf = (iso: string | null, tz: string) =>
  iso ? new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : null;
