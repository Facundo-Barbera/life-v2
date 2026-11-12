import type { HrZoneRange, LoadSuggestion, ProgramDay } from "@/contract";
import type { WatchMessage, WatchMetrics, WatchSync, WorkoutStage } from "pulso-watch";
import type { LiveSession } from "./live/session";
import { runningCardio, toWire, type LiveState } from "./live/state";
import { fromWireEdit, recording, HK } from "./live/sync";
import type { WeightUnit } from "./units";

// The phone's side of the Watch (SwiftUI's WatchLink.swift). The session is
// one: the phone owns it and the Watch keeps a copy it can change on its own.
// - every change of the session (and the next day's plan) is published to the Watch;
// - the Watch's edits are applied (the latest wins) and acknowledged;
// - starting a session opens Pulso on the Watch, which records the workout and sends its numbers;
// - without a Watch answering in 10 s, the iPhone records it itself (unless turned off).
// One device records each session; what it recorded, the phone doesn't write to Salud again.

export type Recorder = "watch" | "phone";

/** What was recorded live for a session: kept on disk, so a relaunch before «Terminar» still knows. */
export type Recorded = { sessionId: string; by: Recorder | null; strength: boolean; cardio: string[] };

/** The Watch's side of the bridge (pulso-watch's `Watch`), injectable for tests. */
export type WatchPort = {
  send(message: WatchMessage): boolean;
  publish(message: WatchMessage): boolean;
  startWatchApp(): Promise<void>;
  onMessage(listener: (message: WatchMessage) => void): () => void;
  onState(listener: (state: { reachable: boolean }) => void): () => void;
};

/** The iPhone's own recording (salud-nativo's PhoneWorkout). */
export type PhoneRecorder = {
  available: boolean;
  follow(sessionId: string, stage: WorkoutStage, options: { paused: boolean; since: Date; stageSince: Date | null }): Promise<void>;
  finish(sessionId: string, save: boolean): Promise<void>;
  recover(): Promise<void>;
  metrics(): WatchMetrics | null;
  onMetrics(listener: (metrics: WatchMetrics | null) => void): () => void;
};

export type WatchPlan = { day: ProgramDay; programId: string | null; suggestions: Record<string, LoadSuggestion> };

/** What the link needs from the training store. */
export type WatchHost = {
  live(): LiveSession | null;
  /** What «Empezar» on the Watch starts when there's no session. */
  plan(): WatchPlan | null;
  unit(exerciseId: string): WeightUnit;
  hrZones(): HrZoneRange[] | null;
  adoptFromWatch(state: LiveState): void;
  setUnit(exerciseId: string, unit: WeightUnit): void;
  finish(): Promise<void>;
  discard(): Promise<void>;
};

/** Kept across launches (UserDefaults in SwiftUI). */
export type WatchMemory = { applied: string[]; recorded: Recorded | null; phoneRecords: boolean };

export type WatchLinkOptions = {
  watch: WatchPort;
  phone: PhoneRecorder;
  host: WatchHost;
  memory: { load(): WatchMemory; save(memory: WatchMemory): void };
  /** How long a new session waits for the Watch before the iPhone records. */
  watchWaitMs?: number;
  publishDelayMs?: number;
};

export class WatchLink {
  /** The Watch's latest numbers; null while it isn't recording (or not heard from). */
  metrics: WatchMetrics | null = null;
  /** Who records the session in progress; null while waiting to hear from the Watch. */
  recorder: Recorder | null = null;
  private recorded: Recorded | null;
  private applied: string[];
  private phoneRecordsSetting: boolean;
  /** The last session that ended, told to the Watch so it ends its recording too. */
  private closed: { id: string; saved: boolean } | null = null;
  private deciding?: ReturnType<typeof setTimeout>;
  private publishing?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private stops: (() => void)[] = [];
  revision = 0;

  constructor(private o: WatchLinkOptions) {
    const memory = o.memory.load();
    this.recorded = memory.recorded;
    this.applied = memory.applied;
    this.phoneRecordsSetting = memory.phoneRecords;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  private emit() {
    this.revision++;
    for (const l of this.listeners) l();
  }
  private remember() {
    this.o.memory.save({ applied: this.applied, recorded: this.recorded, phoneRecords: this.phoneRecordsSetting });
  }

  /** Ajustes → «Grabar en el iPhone»: without a Watch, the iPhone records the workout. */
  get phoneRecords() {
    return this.phoneRecordsSetting;
  }
  set phoneRecords(on: boolean) {
    this.phoneRecordsSetting = on;
    this.remember();
    this.emit();
  }

  /** The numbers of whatever records the session: the Watch, or this iPhone. */
  get live(): WatchMetrics | null {
    return this.recorder === "phone" ? this.o.phone.metrics() : this.metrics;
  }

  /** At launch: listens to the Watch, and carries on a recording the iPhone had when the app was killed. */
  activate() {
    if (this.stops.length) return;
    this.stops.push(this.o.watch.onMessage((m) => this.handle(m)));
    this.stops.push(this.o.watch.onState((s) => s.reachable && this.publish()));
    this.stops.push(this.o.phone.onMetrics(() => this.recorder === "phone" && this.emit()));
    if (this.recorded?.by === "phone") {
      this.recorder = "phone";
      void this.o.phone.recover();
    } else if (this.recorded?.by === "watch") this.recorder = "watch";
    this.publish();
  }

  stop() {
    for (const s of this.stops) s();
    this.stops = [];
    clearTimeout(this.deciding);
    clearTimeout(this.publishing);
  }

  // ── Session lifecycle ──

  /** The session began. Started here, it opens Pulso on the Watch; started on the Watch (`launch` false), the Watch already records. */
  began(sessionId: string, launch: boolean) {
    this.recorded = { sessionId, by: launch ? null : "watch", strength: false, cardio: [] };
    this.recorder = this.recorded.by;
    this.closed = null;
    this.metrics = null;
    this.remember();
    this.publish();
    this.emit();
    if (!launch) return;
    // No Watch, Pulso not installed on it, or no permission: the phone carries on alone.
    this.o.watch.startWatchApp().catch(() => {});
    // The Watch answering with its numbers takes the recording; silence, and the iPhone does.
    clearTimeout(this.deciding);
    this.deciding = setTimeout(() => {
      if (this.recorder == null && this.recorded?.sessionId === sessionId) this.decide(this.phoneRecordsSetting && this.o.phone.available ? "phone" : null);
    }, this.o.watchWaitMs ?? 10_000);
  }

  private decide(by: Recorder | null) {
    clearTimeout(this.deciding);
    this.recorder = by;
    if (this.recorded) this.recorded = { ...this.recorded, by };
    this.remember();
    this.publish();
    this.emit();
  }

  /** The session ended (saved or thrown away): the Watch ends its recording. Returns what was recorded live, so the phone writes only the rest to Salud. */
  ended(sessionId: string, saved: boolean): Recorded | null {
    const done = this.recorded?.sessionId === sessionId ? this.recorded : null;
    if (this.recorder === "phone") void this.o.phone.finish(sessionId, saved);
    clearTimeout(this.deciding);
    this.recorder = null;
    this.closed = { id: sessionId, saved };
    this.recorded = null;
    this.remember();
    this.publish();
    this.emit();
    return done;
  }

  // ── To the Watch ──

  /** The session (or the plan, without one), soon: changes in a burst go as one. */
  publish() {
    clearTimeout(this.publishing);
    this.publishing = setTimeout(() => this.publishNow(), this.o.publishDelayMs ?? 250);
  }

  /** The sync the Watch gets now. */
  sync(): WatchSync {
    const { host } = this.o;
    const state = host.live()?.state ?? null;
    const plan = state ? null : host.plan();
    const ids = state ? state.exercises.map((e) => e.exerciseId) : (plan?.day.exercises.map((e) => e.exerciseId) ?? []);
    const units = Object.fromEntries(ids.map((id) => [id, host.unit(id)]));
    return {
      state: state ? toWire(state) : null,
      closed: this.closed,
      applied: this.applied.slice(-200),
      units,
      plan: plan ? { day: plan.day, programId: plan.programId, suggestions: plan.suggestions } : null,
      hrZones: host.hrZones(),
      recorder: this.recorder,
    };
  }

  private publishNow() {
    const sync = this.sync();
    this.o.watch.send({ kind: "sync", sync });
    this.o.watch.publish({ kind: "sync", sync });
    const state = this.o.host.live()?.state;
    if (state) this.record(state);
  }

  /** The iPhone's recording follows the session as the Watch does: the running cardio block's kind, else strength, from the session's start. */
  private record(state: LiveState) {
    const recorded = this.recorded;
    if (this.recorder !== "phone" || !recorded || recorded.sessionId !== state.id) return;
    const r = recording(state);
    void this.o.phone.follow(state.id, r.stage, { paused: r.paused, since: new Date(state.startedAt), stageSince: r.stageSince != null ? new Date(r.stageSince) : null });
    this.noteRecorded(state, r.stage.activity === HK.traditionalStrengthTraining);
  }

  /** Only what is actually recorded counts: then the phone won't save it again. */
  private noteRecorded(state: LiveState, strength: boolean) {
    const recorded = this.recorded;
    if (!recorded) return;
    const block = runningCardio(state);
    const next: Recorded = strength
      ? { ...recorded, strength: true }
      : block && !recorded.cardio.includes(block.id)
        ? { ...recorded, cardio: [...recorded.cardio, block.id] }
        : recorded;
    if (next !== recorded) {
      this.recorded = next;
      this.remember();
    }
  }

  // ── From the Watch ──

  handle(message: WatchMessage) {
    switch (message.kind) {
      case "metrics":
        return this.receive(message.metrics);
      case "stopped":
        this.metrics = null;
        return this.emit();
      case "edits":
        return void this.apply(message.edits);
      case "sync":
        return;
    }
  }

  private async apply(edits: Extract<WatchMessage, { kind: "edits" }>["edits"]) {
    const fresh = edits.filter((e) => !this.applied.includes(e.id));
    if (!fresh.length) return this.publish();
    this.applied = [...this.applied, ...fresh.map((e) => e.id)].slice(-300);
    this.remember();
    const { host } = this.o;
    for (const wire of fresh) {
      const edit = fromWireEdit(wire);
      const change = edit.change;
      if (change.kind === "start") host.adoptFromWatch(change.state);
      else if (change.kind === "unit") host.setUnit(change.exerciseId, change.unit);
      else if (change.kind === "finish") {
        if (host.live()?.state.id !== edit.sessionId) continue;
        await (change.save ? host.finish() : host.discard());
      } else host.live()?.applyWatch(edit);
    }
    this.publish();
  }

  private receive(metrics: WatchMetrics) {
    // The iPhone took the recording (the Watch was late): the Watch stops its own on the next sync.
    if (this.recorder === "phone") return;
    this.metrics = metrics;
    if (this.recorder == null && this.recorded) this.decide("watch");
    const live = this.o.host.live();
    if (live && this.recorded?.sessionId === live.state.id) this.noteRecorded(live.state, metrics.stage.activity === HK.traditionalStrengthTraining);
    this.emit();
  }

  /** What the Watch (or this iPhone) recorded for `sessionId` so far. */
  recordedFor(sessionId: string): Recorded | null {
    return this.recorded?.sessionId === sessionId ? this.recorded : null;
  }
}
