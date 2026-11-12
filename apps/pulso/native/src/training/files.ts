import { Directory, File, Paths } from "expo-file-system";

// JSON files under Documents/Training (SwiftUI's TrainingFiles): the live
// session (written on every change, so a killed app resumes where it was),
// finished sessions waiting for the Mac, and the small bits of state the
// Watch link and the live session keep across launches. Synchronous on
// purpose: a write that waits is one a kill can lose.

const directory = () => new Directory(Paths.document, "Training");
const file = (name: string) => new File(Paths.document, "Training", name);

export const FILES = {
  live: "live-session.json",
  pending: "pending-sessions.json",
  settings: "training-settings.json",
  memory: "training-memory.json",
  watch: "watch-link.json",
} as const;

export function saveJSON(name: string, value: unknown): boolean {
  try {
    const dir = directory();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const f = file(name);
    if (!f.exists) f.create({ intermediates: true });
    f.writeSync(JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[training] couldn't write ${name}`, error);
    return false;
  }
}

export function loadJSON<T>(name: string): T | null {
  try {
    const f = file(name);
    return f.exists ? (JSON.parse(f.textSync()) as T) : null;
  } catch {
    return null;
  }
}

export function removeFile(name: string) {
  try {
    const f = file(name);
    if (f.exists) f.delete();
  } catch {}
}

/** A file that no longer reads is set aside rather than written over. */
export function setAside(name: string) {
  try {
    const f = file(name);
    if (f.exists) f.rename(name.replace(/\.json$/, `.unreadable-${Date.now()}.json`));
  } catch {}
}
