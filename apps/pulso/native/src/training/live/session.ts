import type { CardioLog, LiveSession as WireSession } from "@/contract";
import { cues, newClock, pauseClock, startClock } from "../cardio";
import type { Segment } from "../drops";
import type { Group } from "../superset";
import { KG, type UnitOf, type WeightUnit } from "../units";
import { activityState } from "./activity";
import * as L from "./state";
import { apply, changeKey, changes, wins, type Edit } from "./sync";

// The session on screen (SwiftUI's LiveSession.swift): wraps the pure state with
// what a value can't do — saving on every change, syncing with the engine (so
// the Coach can change it) with the same version/conflict rules, the rest and
// cardio timers with their haptics and notifications, the Coach's undo. The
// platform (disk, network, Live Activity, Watch, notifications) comes in as
// `LiveEffects`, so the logic runs the same under `bun test`.

export type PutResult = { session: WireSession; conflict: boolean };

export type LiveApi = {
  put(session: WireSession, baseVersion: number): Promise<PutResult>;
  get(): Promise<WireSession | null>;
  /** `end_live_session`; `discard` saves nothing. */
  end(discard: boolean): Promise<void>;
};

export type LiveEffects = {
  /** The engine, or null while unpaired. */
  api(): LiveApi | null;
  unit: UnitOf;
  now(): number;
  /** Write the session to disk (null removes it). */
  save(state: L.LiveState | null): void;
  /** After every change: the Live Activity and the Watch follow. */
  changed?(session: LiveSession): void;
  haptic?(kind: "success" | "warning" | "coach"): void;
  /** One notification for a phone in the pocket when the rest ends; null cancels it. */
  restNotice?(notice: { after: number; title: string; body: string } | null): void;
  /** The cardio cues still ahead (seconds from now); an empty list cancels them. */
  cardioNotices?(notices: { after: number; title: string; body: string }[]): void;
  /** Bounded waits, shortened by tests. */
  delays?: Partial<typeof DELAYS>;
};

const DELAYS = { push: 700, resume: 2000, undo: 6000, coachWait: 100 };

type Timer = ReturnType<typeof setTimeout>;

export class LiveSession {
  private current: L.LiveState;
  /** The session before the Coach's last change, while «Deshacer» is offered. */
  coachUndo: L.LiveState | null = null;
  /** "El Coach saltó Remo en máquina". */
  coachSummary: string | null = null;
  /** Bumped when the Coach changed the session. */
  coachChanges = 0;

  /** Set, rest and cardio keys → when they last changed here: a Watch edit older than that loses. */
  private stamps = new Map<string, number>();
  private stampOverride: number | null = null;
  private dirty = false;
  private pushing = false;
  private closedFlag = false;
  private conflicts = 0;
  private timers: { push?: Timer; rest?: Timer; undo?: Timer; cardio: Timer[] } = { cardio: [] };
  private listeners = new Set<() => void>();
  private delays: typeof DELAYS;
  /** Bumped on every change, for `useSyncExternalStore`. */
  revision = 0;

  constructor(
    state: L.LiveState,
    private fx: LiveEffects,
  ) {
    this.current = state;
    this.delays = { ...DELAYS, ...fx.delays };
    fx.save(state);
  }

  get state(): L.LiveState {
    return this.current;
  }
  get closed() {
    return this.closedFlag;
  }
  get unitOf(): UnitOf {
    return this.fx.unit ?? KG;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  private emit() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  private commit(next: L.LiveState) {
    const old = this.current;
    this.current = next;
    this.fx.save(next);
    const at = this.stampOverride ?? this.fx.now();
    for (const change of changes(old, next)) this.stamps.set(changeKey(change), at);
    this.fx.changed?.(this);
    this.emit();
  }

  /** The session left on disk when the app was last killed: it may hold changes the engine never got, so it is pushed again. */
  static resume(state: L.LiveState, fx: LiveEffects, unsent: boolean): LiveSession {
    const session = new LiveSession(state, fx);
    if (L.restEndedWhileAway(session.state, fx.now())) session.mutate((s) => L.advanceIfDone(s));
    session.armRest();
    session.armCardio();
    if (unsent) {
      session.dirty = true;
      session.schedulePush(session.delays.resume);
    }
    return session;
  }

  /** A session older than this on the engine was abandoned, not interrupted. */
  static abandonedAfter = 12 * 60 * 60 * 1000;

  /** Whether the engine's session is one to resume on a phone that has none: not closed here and touched recently. */
  static shouldRestore(remote: L.LiveState, closed: Set<string>, now: number) {
    return !closed.has(remote.id) && now - remote.updatedAt < LiveSession.abandonedAfter;
  }

  /** Gives the engine the new session (base version 0). */
  begin() {
    this.dirty = true;
    this.schedulePush(0);
  }

  /** Every local edit: applied, saved, and pushed to the engine shortly after. */
  mutate(change: (draft: L.LiveState) => void) {
    if (this.closedFlag) return;
    const next = L.produce(this.current, change);
    if (L.equal(next, this.current)) return;
    next.updatedAt = this.fx.now();
    this.commit(next);
    this.dirty = true;
    this.schedulePush();
  }

  private moveOnIfRested() {
    if (!L.resting(this.current, this.fx.now())) this.mutate((s) => L.advanceIfDone(s));
  }

  unit = (e: number): WeightUnit => this.unitOf(this.current.exercises[e]?.exerciseId ?? "");

  // ── Sets ──

  toggle(e: number, set: number) {
    this.mutate((s) => L.toggle(s, e, set, this.fx.now(), this.unit(e)));
    this.armRest();
    // No rest to wait for (0 s or the session's last set): move on now.
    this.moveOnIfRested();
  }

  completeAll(e: number) {
    this.mutate((s) => L.completeAll(s, e, this.fx.now(), this.unit(e)));
    this.armRest();
    this.moveOnIfRested();
  }

  /** A superset round's «Hecho», or its check to undo it. */
  toggleRound(group: Group, r: number) {
    if (L.roundDone(this.current, group, r)) this.mutate((s) => L.undoRound(s, group, r));
    else this.mutate((s) => L.completeRound(s, group, r, this.fx.now(), this.unit));
    this.armRest();
    this.moveOnIfRested();
  }

  addRound = (group: Group) => this.mutate((s) => L.addRound(s, group));
  removeRound = (group: Group) => this.mutate((s) => L.removeRound(s, group));
  removeLastSet = (e: number) => this.mutate((s) => L.removeLastSet(s, e));
  splitSuperset = (group: Group) => this.mutate((s) => L.splitSuperset(s, group));

  /** The rest running now, and its exercise's for today, set to `seconds`. */
  setRest(seconds: number) {
    this.mutate((s) => L.setRest(s, seconds, this.fx.now()));
    this.armRest();
    this.moveOnIfRested();
  }

  setEffort = (e: number, value: number | null) => this.mutate((s) => L.setEffort(s, e, value));
  stepWeight = (e: number, set: number, up: boolean) => this.mutate((s) => L.stepWeight(s, e, set, up, this.unit(e)));
  adjustReps = (e: number, set: number, delta: number) => this.mutate((s) => L.adjustReps(s, e, set, delta));
  /** `value` as typed, in the exercise's unit. */
  setWeight = (e: number, set: number, value: number) => this.mutate((s) => L.setWeight(s, e, set, value, this.unit(e)));
  setReps = (e: number, set: number, reps: number) => this.mutate((s) => L.setReps(s, e, set, reps));
  addSet = (e: number) => this.mutate((s) => L.addSet(s, e));
  removeSet = (e: number, set: number) => this.mutate((s) => L.removeSet(s, e, set));

  /** A drop added to the set just done restarts its rest. */
  addDrop(e: number, set: number, drop: Segment) {
    this.mutate((s) => L.addDrop(s, e, set, drop, this.fx.now(), this.unit(e)));
    this.armRest();
  }
  nextDrop = (e: number, set: number) => L.nextDrop(this.current, e, set, this.unit(e));
  removeDrop = (e: number, set: number, d: number) => this.mutate((s) => L.removeDrop(s, e, set, d));
  stepDropWeight = (e: number, set: number, d: number, up: boolean) => this.mutate((s) => L.stepDropWeight(s, e, set, d, up, this.unit(e)));
  setDropWeight = (e: number, set: number, d: number, value: number) => this.mutate((s) => L.setDropWeight(s, e, set, d, value, this.unit(e)));
  setDropReps = (e: number, set: number, d: number, reps: number) => this.mutate((s) => L.setDropReps(s, e, set, d, reps));

  /** After a unit change: each exercise `unitOf` names gets its open sets on that unit's steps. */
  snapOpenSets(unitOf: (exerciseId: string) => WeightUnit | null) {
    this.mutate((s) =>
      s.exercises.forEach((ex, e) => {
        const unit = unitOf(ex.exerciseId);
        if (unit) L.snapOpenSets(s, e, unit);
      }),
    );
  }

  /** +15 s or −15 s; a rest cut to nothing ends (and moves on if the exercise is done). */
  extendRest(seconds: number) {
    this.mutate((s) => L.extendRest(s, seconds, this.fx.now()));
    this.armRest();
    this.moveOnIfRested();
  }

  skipRest() {
    this.mutate((s) => {
      L.skipRest(s);
      L.advanceIfDone(s);
    });
    this.armRest();
  }

  // ── Focus and editing (solo hoy) ──

  setFocus = (index: number) => this.mutate((s) => L.setFocus(s, index));
  move = (source: number[], destination: number) => this.mutate((s) => L.move(s, source, destination));

  /** Skipping a block stops its clock (and its cues); with nothing left the rest ends too. */
  setSkipped(index: number, skipped: boolean) {
    this.mutate((s) => L.setSkipped(s, index, skipped));
    this.armRest();
    this.armCardio();
  }

  remove(index: number) {
    this.mutate((s) => L.remove(s, index));
    this.armRest();
    this.armCardio();
  }

  updateTarget = (index: number, target: L.TargetEdit) => this.mutate((s) => L.updateTarget(s, index, target));

  updateCardioTarget(index: number, target: L.LiveExercise["cardio"]) {
    this.mutate((s) => {
      const ex = s.exercises[index];
      if (ex) ex.cardio = target;
    });
    this.armCardio();
  }

  /** Adds a library exercise at the end, its sets at `weightKg` (the last load logged for it). */
  add = (library: L.Library, weightKg: number) => this.mutate((s) => void L.add(s, library, weightKg));

  /** «Cambiar ejercicio» for today. */
  swap(index: number, library: L.Library, weightKg: number) {
    this.mutate((s) => void L.swap(s, index, library, weightKg));
    this.armCardio();
  }

  /** «Personalizar lista» saved: the draft's exercises on top of whatever was logged since it was copied. */
  applyDraft(draft: L.LiveState) {
    const merged = L.merge(draft, this.current).state;
    this.mutate((s) => {
      s.exercises = merged.exercises;
      s.cardioClock = merged.cardioClock;
      L.setFocus(s, merged.focus);
      L.stopWhatEnded(s);
    });
    this.armRest();
    this.armCardio();
  }

  // ── Cardio ──

  /** Starts or resumes a block's stopwatch; another block's is dropped. One instant for every screen. */
  startCardio(index: number) {
    const ex = this.current.exercises[index];
    if (!ex) return;
    const clock = this.current.cardioClock?.exerciseId === ex.id ? this.current.cardioClock : newClock(ex.id);
    const next = startClock(clock, this.fx.now());
    this.mutate((s) => {
      s.cardioClock = next;
      L.skipRest(s);
    });
    this.armRest();
    this.armCardio();
  }

  /** Pauses as an interval: the time so far is banked, the clock stands still. */
  pauseCardio() {
    this.mutate((s) => {
      if (s.cardioClock) s.cardioClock = pauseClock(s.cardioClock, this.fx.now());
    });
    this.armCardio();
  }

  /** Logs the block, stops its stopwatch and moves on. */
  finishCardio(index: number, log: CardioLog) {
    if (!this.current.exercises[index]) return;
    this.mutate((s) => {
      L.logCardio(s, index, log);
      L.advanceIfDone(s);
    });
    this.armCardio();
  }

  reopenCardio = (index: number) => this.mutate((s) => L.clearCardioLog(s, index));

  // ── Watch ──

  /** One of the Watch's edits, unless this phone changed the same thing later (equal values never clash). */
  applyWatch(edit: Edit) {
    if (edit.sessionId !== this.current.id || this.closedFlag) return;
    if (!wins(edit.at, this.stamps.get(changeKey(edit.change)))) return;
    this.stampOverride = edit.at;
    this.mutate((s) => void apply(s, edit.change));
    this.stampOverride = null;
    this.armRest();
    this.armCardio();
    this.moveOnIfRested();
  }

  // ── Rest and cardio timers ──

  /** One timer for the foreground haptic (and moving on once the exercise is done), one notification for a phone in the pocket. */
  private armRest() {
    clearTimeout(this.timers.rest);
    this.fx.restNotice?.(null);
    const end = this.current.restEndsAt;
    const now = this.fx.now();
    if (end == null || end <= now) return;
    this.timers.rest = setTimeout(() => {
      if (this.closedFlag) return;
      this.fx.haptic?.("success");
      this.mutate((s) => L.advanceIfDone(s));
      this.fx.changed?.(this);
      this.emit();
    }, end - now);
    const next = activityState(this.current, { now: end, unit: this.unitOf });
    this.fx.restNotice?.({ after: Math.max(1, (end - now) / 1000), title: "Descanso terminado", body: next.target ? `${next.exerciseName} · ${next.target}` : next.exerciseName });
  }

  /** While a block runs: a notification per phase change (they reach a locked phone) and, in the foreground, a haptic and a Live Activity update at each. */
  private armCardio() {
    for (const t of this.timers.cardio) clearTimeout(t);
    this.timers.cardio = [];
    const clock = this.current.cardioClock;
    const ex = clock?.runningSince != null ? this.current.exercises.find((x) => x.id === clock.exerciseId) : undefined;
    if (!clock || !ex) return void this.fx.cardioNotices?.([]);
    const now = this.fx.now();
    const list = cues(ex, (now - clock.runningSince!) / 1000 + clock.accumulated);
    this.fx.cardioNotices?.(list);
    this.timers.cardio = list.map((cue) =>
      setTimeout(() => {
        if (this.closedFlag) return;
        this.fx.haptic?.("warning");
        this.fx.changed?.(this);
        this.emit();
      }, cue.after * 1000),
    );
  }

  /** Re-arms both after the app was away (timers don't run in the background). */
  rearm() {
    if (L.restEndedWhileAway(this.current, this.fx.now())) this.mutate((s) => L.advanceIfDone(s));
    this.armRest();
    this.armCardio();
  }

  // ── Sync with the engine ──

  private schedulePush(delay = this.delays.push) {
    if (this.closedFlag) return;
    clearTimeout(this.timers.push);
    this.timers.push = setTimeout(() => void this.push(), delay);
  }

  /**
   * Sends the local copy on top of the engine's version. The answer's version is
   * adopted and edits made meanwhile go out next; a conflict (the Coach changed it)
   * adopts the engine's copy. Offline, the change waits for the next one or the foreground.
   */
  async push(): Promise<void> {
    const api = this.fx.api();
    if (!this.dirty || this.pushing || this.closedFlag || !api) return;
    this.pushing = true;
    this.dirty = false;
    const sent = this.current;
    let result: PutResult;
    try {
      result = await api.put(L.toWire(sent), sent.version);
    } catch {
      this.pushing = false;
      this.dirty = true;
      return;
    }
    this.pushing = false;
    if (result.conflict) {
      this.conflicts++;
      // Keep trying on later changes, not in a tight loop.
      if (this.conflicts > 3) return void (this.dirty = true);
      if (this.dirty) return this.push();
      return this.reconcile(L.fromWire(result.session), api);
    }
    this.conflicts = 0;
    const saved = result.session;
    if (this.closedFlag || saved.id !== this.current.id) return;
    const next = L.clone(this.current);
    next.version = saved.version;
    next.updatedAt = saved.updatedAt;
    next.threadId = saved.threadId ?? this.current.threadId;
    this.commit(next);
    if (this.dirty) this.schedulePush();
  }

  /** Takes the engine's copy when it moved on (the Coach changed it). Unsent local changes go out first; a session the engine lost is given back. */
  async pull(): Promise<void> {
    this.conflicts = 0;
    const api = this.fx.api();
    if (this.closedFlag || this.pushing || !api) return;
    if (this.dirty) return this.push();
    let remote: WireSession | null;
    try {
      remote = await api.get();
    } catch {
      return;
    }
    return this.reconcile(remote ? L.fromWire(remote) : null, api);
  }

  /** The engine's copy against this phone's: the newer one wins. */
  private async reconcile(remote: L.LiveState | null, api: LiveApi): Promise<void> {
    if (this.closedFlag || this.pushing) return;
    if (!remote || remote.version < this.current.version) {
      this.dirty = true;
      return this.push();
    }
    if (remote.id !== this.current.id) {
      // A session left over on the engine (say, discarded offline): the one in progress is this phone's.
      if (this.conflicts >= 3) return;
      try {
        await api.end(true);
      } catch {
        return;
      }
      if (this.closedFlag) return;
      this.dirty = true;
      return this.push();
    }
    if (remote.version <= this.current.version && L.equal(remote.exercises, this.current.exercises)) return;
    this.adopt(remote);
  }

  private adopt(remote: L.LiveState) {
    const { state, keptLocal } = L.merge(remote, this.current);
    // A block the Coach ended or skipped comes back without its clock: that stops its cues.
    this.commit(state);
    this.armRest();
    this.armCardio();
    if (keptLocal) {
      this.dirty = true;
      this.schedulePush();
    }
  }

  /** Before the app is suspended: what the debounce hasn't sent yet. */
  flush(): Promise<void> {
    clearTimeout(this.timers.push);
    return this.push();
  }

  // ── Coach ──

  /** After the Coach changed the session: take the engine's copy, buzz, and offer «Deshacer» for a few seconds. */
  async coachChanged(): Promise<void> {
    const before = this.current;
    // A push in flight will meet the Coach's version (conflict) and adopt it; let it land first.
    for (let i = 0; i < 100 && this.pushing; i++) await new Promise((r) => setTimeout(r, this.delays.coachWait));
    await this.pull();
    if (L.equal(this.current.exercises, before.exercises) && this.current.focus === before.focus) return;
    this.coachChanges++;
    this.coachSummary = L.coachSummary(before, this.current);
    this.coachUndo = before;
    this.fx.haptic?.("coach");
    clearTimeout(this.timers.undo);
    this.timers.undo = setTimeout(() => this.dismissUndo(), this.delays.undo);
    this.emit();
  }

  /** Puts the exercises back as they were before the Coach's change, keeping sets checked since. */
  undoCoach() {
    const before = this.coachUndo;
    if (!before) return;
    clearTimeout(this.timers.undo);
    const restored = L.undoingCoach(before, this.current);
    this.coachUndo = null;
    this.mutate((s) => {
      s.exercises = restored.exercises;
      s.cardioClock = restored.cardioClock;
      L.setFocus(s, before.focus);
    });
    this.armRest();
    this.armCardio();
    this.emit();
  }

  dismissUndo() {
    clearTimeout(this.timers.undo);
    if (!this.coachUndo) return;
    this.coachUndo = null;
    this.emit();
  }

  // ── Closing ──

  /** Stops the timers and forgets the session on this phone; the engine's copy is the store's to drop. */
  close() {
    this.closedFlag = true;
    clearTimeout(this.timers.push);
    clearTimeout(this.timers.rest);
    clearTimeout(this.timers.undo);
    for (const t of this.timers.cardio) clearTimeout(t);
    this.fx.restNotice?.(null);
    this.fx.cardioNotices?.([]);
    this.fx.save(null);
    this.emit();
  }
}
