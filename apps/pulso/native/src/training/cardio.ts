import type { CardioIntervals, CardioTarget, HrZoneRange } from "@/contract";

// Cardio blocks (SwiftUI's CardioClock.swift): the stopwatch, interval phases,
// words and the cues for a locked phone. Times are epoch ms, durations seconds.

/** The stopwatch of the cardio block being done. Elapsed = accumulated + (now − runningSince) while running. */
export type CardioClock = { exerciseId: string; runningSince: number | null; accumulated: number };

export const newClock = (exerciseId: string): CardioClock => ({ exerciseId, runningSince: null, accumulated: 0 });
export const isRunning = (clock: CardioClock | null | undefined) => clock?.runningSince != null;

/** Seconds on the clock at `now`. */
export const elapsed = (clock: CardioClock, now = Date.now()) =>
  clock.accumulated + (clock.runningSince != null ? Math.max(0, (now - clock.runningSince) / 1000) : 0);

export const startClock = (clock: CardioClock, now = Date.now()): CardioClock => (clock.runningSince != null ? clock : { ...clock, runningSince: now });

export function pauseClock(clock: CardioClock, now = Date.now()): CardioClock {
  if (clock.runningSince == null) return clock;
  return { ...clock, accumulated: clock.accumulated + Math.max(0, (now - clock.runningSince) / 1000), runningSince: null };
}

/** The instant it would read 0 had it never paused: its whole seconds turn from here. Null while paused. */
export const origin = (clock: CardioClock): number | null => (clock.runningSince != null ? clock.runningSince - clock.accumulated * 1000 : null);

/**
 * Seconds that turn together on every screen: a timer that ticks from when the
 * view appeared reads up to a second late (the Watch read 7 while the phone read 9),
 * so tick from the clock's own origin, moved back by whole seconds so it isn't in the future.
 */
export function ticksFrom(originMs: number, now = Date.now()): number {
  const ahead = originMs - now;
  return ahead > 0 ? originMs - Math.ceil(ahead / 1000) * 1000 : originMs;
}

/** Milliseconds until the next whole second of a count that started at `originMs` (for a timer that ticks with it). */
export function untilNextTick(originMs: number, now = Date.now()): number {
  const into = (((now - originMs) % 1000) + 1000) % 1000;
  return 1000 - into;
}

/** One part of an interval block: work or recovery of one round. `start`/`length` in seconds from the block's start. */
export type CardioPhase = { index: number; round: number; rounds: number; work: boolean; label: string; start: number; length: number; end: number };

/** Work then recovery for every round; a zero-length part is left out. */
export function phases(intervals: CardioIntervals): CardioPhase[] {
  const work = intervals.workLabel || "Rápido";
  const rest = intervals.restLabel || "Suave";
  const rounds = Math.max(1, intervals.rounds);
  const out: CardioPhase[] = [];
  let at = 0;
  for (let round = 1; round <= rounds; round++) {
    for (const [isWork, seconds] of [
      [true, intervals.workSeconds],
      [false, intervals.restSeconds],
    ] as const) {
      if (seconds <= 0) continue;
      out.push({ index: out.length, round, rounds, work: isWork, label: isWork ? work : rest, start: at, length: seconds, end: at + seconds });
      at += seconds;
    }
  }
  return out;
}

/** The phase `elapsedSeconds` in; null once the intervals are over. */
export const phaseAt = (elapsedSeconds: number, intervals: CardioIntervals) => phases(intervals).find((p) => elapsedSeconds < p.end) ?? null;

/** The block's planned length in seconds: the intervals' total, else the duration. */
export function totalSeconds(target: CardioTarget | null | undefined): number | null {
  if (!target) return null;
  if (target.intervals) return phases(target.intervals).at(-1)?.end ?? null;
  return target.durationMinutes != null ? target.durationMinutes * 60 : null;
}

/** "Z2 · 118–137 ppm", or "Z2" when the person's zones aren't known. */
export function zoneText(zone: number | null | undefined, zones: HrZoneRange[] | null | undefined): string | null {
  if (zone == null) return null;
  const band = zones?.find((z) => z.zone === zone);
  return band ? `Z${zone} · ${band.minBpm}–${band.maxBpm} ppm` : `Z${zone}`;
}

/** "1:05", "1:02:03": floored, never rounded up. */
export function clockText(seconds: number): string {
  const total = Math.floor(Math.max(0, seconds));
  const [h, m, s] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

const LABELS: Record<string, string> = {
  treadmill: "Cinta",
  elliptical: "Elíptica",
  bike: "Bici estática",
  rower: "Remo",
  stairs: "Escaladora",
  run: "Carrera",
  walk: "Caminata",
  jump_rope: "Comba",
  hiit: "HIIT",
};
export const modalityLabel = (modality: string | null | undefined) => (modality && LABELS[modality]) || "Cardio";

const SYMBOLS: Record<string, string> = {
  treadmill: "figure.run.treadmill",
  elliptical: "figure.elliptical",
  bike: "figure.indoor.cycle",
  rower: "figure.rower",
  stairs: "figure.stair.stepper",
  run: "figure.run",
  walk: "figure.walk",
  jump_rope: "figure.jumprope",
  hiit: "figure.highintensity.intervaltraining",
};
export const modalitySymbol = (modality: string | null | undefined) => (modality && SYMBOLS[modality]) || "heart.circle";

type Block = { id: string; name: string; modality?: string | null; cardio: CardioTarget | null };

/** What the lock screen shows for a cardio block (`ContentState.Cardio`). Instants as Dates (the Swift side's). */
export function cardioStatus(block: Block, clock: CardioClock | null, zones: HrZoneRange[] | null | undefined, now = Date.now()) {
  const mine = clock?.exerciseId === block.id ? clock : null;
  const seconds = mine ? elapsed(mine, now) : 0;
  const running = isRunning(mine);
  const zone = zoneText(block.cardio?.zone, zones);
  const from = running ? now - seconds * 1000 : null;
  const at = (offset: number | null) => (from != null && offset != null ? new Date(from + offset * 1000) : null);
  const intervals = block.cardio?.intervals;
  const phase = intervals ? phaseAt(seconds, intervals) : null;
  if (phase) {
    return {
      phase: phase.label,
      detail: [`Ronda ${phase.round} de ${phase.rounds}`, zone].filter(Boolean).join(" · "),
      elapsedFrom: at(0),
      elapsedSeconds: seconds,
      phaseStartedAt: at(phase.start),
      phaseEndsAt: at(phase.end),
      work: phase.work,
    };
  }
  const total = totalSeconds(block.cardio);
  const detail = [total != null ? `${Math.round(total / 60)} min` : null, zone].filter(Boolean).join(" · ");
  const left = total != null && total > seconds;
  return {
    phase: modalityLabel(block.modality),
    detail: detail || (running ? "En marcha" : "En pausa"),
    elapsedFrom: at(0),
    elapsedSeconds: seconds,
    phaseStartedAt: left ? at(0) : null,
    phaseEndsAt: left ? at(total) : null,
    work: true,
  };
}
export type CardioStatus = ReturnType<typeof cardioStatus>;

export type Cue = { after: number; title: string; body: string };

/** One cue per phase change still ahead, plus one when the planned time is up; `after` is seconds from now. */
export function cues(block: Block, elapsedSeconds: number): Cue[] {
  const target = block.cardio;
  if (!target) return [];
  const out: Cue[] = [];
  if (target.intervals) {
    for (const p of phases(target.intervals)) {
      if (p.start > elapsedSeconds) out.push({ after: p.start - elapsedSeconds, title: `${p.label} · ${clockText(p.length)}`, body: `Ronda ${p.round} de ${p.rounds}` });
    }
  }
  const total = totalSeconds(target);
  if (total != null && total > elapsedSeconds) out.push({ after: total - elapsedSeconds, title: target.intervals ? "Intervalos terminados" : "Tiempo cumplido", body: block.name });
  // iOS keeps at most 64 pending notifications per app; leave room for others.
  return out.slice(0, 48);
}
