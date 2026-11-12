// Supersets (SwiftUI's Superset.swift, the engine's training/superset.ts): two
// or more consecutive strength exercises sharing a `supersetId`, done
// alternating (a set of each, then the rest).

/** A half-open range of exercise indices, `[start, end)`. */
export type Group = { start: number; end: number };

export const range = (g: Group) => Array.from({ length: g.end - g.start }, (_, i) => g.start + i);
export const contains = (g: Group, i: number) => i >= g.start && i < g.end;

export const newSupersetId = () => "s" + Math.random().toString(16).slice(2, 8);

/** Keeps an id only on a run of 2+ consecutive strength exercises; a lone member, cardio, or a later run reusing an id gets null. */
export function normalize(ids: (string | null)[], cardio: boolean[]): (string | null)[] {
  const clean = ids.map((id, i) => (cardio[i] ? null : id?.trim() || null));
  const out: (string | null)[] = clean.map(() => null);
  const used = new Set<string>();
  for (let i = 0; i < clean.length; ) {
    const id = clean[i];
    if (id == null) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < clean.length && clean[end] === id) end++;
    if (end - i >= 2 && !used.has(id)) {
      out.fill(id, i, end);
      used.add(id);
    }
    i = end;
  }
  return out;
}

/** The group around `index`, if it is in one. */
export function groupOf(index: number, ids: (string | null)[]): Group | null {
  const id = ids[index];
  if (index < 0 || index >= ids.length || id == null) return null;
  let start = index;
  while (start > 0 && ids[start - 1] === id) start--;
  let end = index + 1;
  while (end < ids.length && ids[end] === id) end++;
  return end - start >= 2 ? { start, end } : null;
}

/** Pairs `a` and `b` (adjacent, either order), joining a group either is in; null when they aren't next to each other or one is cardio. */
export function pair(a: number, b: number, ids: (string | null)[], cardio: boolean[]): (string | null)[] | null {
  const [low, high] = [Math.min(a, b), Math.max(a, b)];
  if (high - low !== 1 || high >= ids.length || cardio[low] || cardio[high]) return null;
  const next = [...ids];
  const id = ids[low] ?? ids[high] ?? newSupersetId();
  next[low] = id;
  next[high] = id;
  return normalize(next, cardio);
}

/** Takes `index` out of its group; the rest stay paired if still 2+ together. */
export function unpair(index: number, ids: (string | null)[], cardio: boolean[]): (string | null)[] {
  if (index < 0 || index >= ids.length) return ids;
  const next = [...ids];
  next[index] = null;
  return normalize(next, cardio);
}

/** "Superserie 1", "Superserie 2"… by order in the list. */
export function labels(ids: (string | null)[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of ids) if (id != null && !out.has(id)) out.set(id, out.size + 1);
  return out;
}
