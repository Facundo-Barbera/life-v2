import { File, Paths } from "expo-file-system";

// What Medicación remembers on this phone only (UserDefaults in Swift): the
// schedule suggestions dismissed with «Ahora no», and the post-workout
// catch-up reminders already sent, so a replan doesn't repeat them.

type Memory = { dismissedNudges: string[]; nudged: string[] };

const file = () => new File(Paths.document, "medicacion.json");

export function loadMemory(): Memory {
  try {
    const f = file();
    const raw = f.exists ? (JSON.parse(f.textSync()) as Partial<Memory>) : {};
    return { dismissedNudges: raw.dismissedNudges ?? [], nudged: raw.nudged ?? [] };
  } catch {
    return { dismissedNudges: [], nudged: [] };
  }
}

export function saveMemory(change: (m: Memory) => Memory): Memory {
  const next = change(loadMemory());
  try {
    const f = file();
    if (!f.exists) f.create();
    f.writeSync(JSON.stringify(next));
  } catch (error) {
    console.warn("[medicacion] couldn't write its memory", error);
  }
  return next;
}
