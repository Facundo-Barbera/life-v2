import { Check as CheckIcon } from "lucide-react";

/** Round completion checkbox for reminders. Stops pointer events so it never starts a drag. */
export function Check({ done, overdue, onToggle, size = 14 }: { done: boolean; overdue?: boolean; onToggle: () => void; size?: number }) {
  return (
    <button
      type="button"
      className={`rcheck ${done ? "on" : ""} ${overdue ? "overdue" : ""}`}
      style={{ width: size, height: size }}
      aria-label={done ? "Marcar como pendiente" : "Marcar como completado"}
      aria-pressed={done}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {done && <CheckIcon size={size - 5} strokeWidth={3.2} />}
    </button>
  );
}
