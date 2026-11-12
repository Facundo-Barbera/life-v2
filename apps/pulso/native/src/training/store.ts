import type { PulsoApi as LifeClient } from "@/data/api";
import type { ActiveProgramResponse, PersonalRecord, ProgramDay, SessionInput, TrainingSession, TrainingSettings, WeightUnit } from "@/contract";
import { useSyncExternalStore } from "react";
import { FILES, loadJSON, removeFile, saveJSON, setAside } from "./files";
import { LiveSession, type LiveApi, type LiveEffects } from "./live/session";
import * as L from "./live/state";
import type { WatchLink, WatchPlan } from "./watch";

// The Entreno tab's model (SwiftUI's TrainingStore.swift): the program as the
// engine returns it, recent sessions, units, the live session and its start,
// finish and discard, the upload queue of finished sessions (on disk before
// anything can fail), and what the Watch link needs from all that.

/** The end of a session as the summary shows it; `prs` and `uploaded` fill in once the Mac answers. */
export type Summary = {
  session: SessionInput;
  prs: PersonalRecord[];
  uploadFailed: boolean;
  uploaded: boolean;
  skipped: string[];
  cutShort: string[];
  savedToHealth: boolean;
  /** Library id → name of what was done (exercises added today aren't in the program). */
  names: Record<string, string>;
};

/** Small state kept across launches. */
type Memory = { closedIds: string[] };

/** Writes Salud's copy of a finished session when nothing recorded it live (salud-nativo's HealthKit write). */
export type HealthSaver = (session: SessionInput, blocks: { log: NonNullable<L.LiveExercise["cardioLog"]>; modality: string | null; speedKmh: number | null }[], strength: boolean) => Promise<boolean>;

export type Platform = Omit<LiveEffects, "api" | "unit" | "save" | "now"> & {
  /** The Live Activity follows the session; null ends it. */
  activity?(session: LiveSession | null): void;
  saveToHealth?: HealthSaver;
};

const DEFAULT_SETTINGS: TrainingSettings = { preferredEquipment: [], defaultUnit: "kg", exerciseUnits: {} };

class TrainingStore {
  client: LifeClient | null = null;
  program: ActiveProgramResponse | null = null;
  sessions: TrainingSession[] = [];
  settings: TrainingSettings = loadJSON<TrainingSettings>(FILES.settings) ?? DEFAULT_SETTINGS;
  live: LiveSession | null = null;
  summary: Summary | null = null;
  finishing = false;
  /** A session came back (a relaunch, the engine's copy, the Watch): the live screen should open. */
  requested = false;
  link: WatchLink | null = null;
  private platform: Platform = {};
  private listeners = new Set<() => void>();
  private memory: Memory = loadJSON<Memory>(FILES.memory) ?? { closedIds: [] };
  private uploading = false;
  revision = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  emit = () => {
    this.revision++;
    for (const l of this.listeners) l();
  };

  /** Once at launch: the platform's effects, the Watch link, and the session left on disk. */
  boot(platform: Platform, link: WatchLink | null) {
    this.platform = platform;
    this.link = link;
    const stored = loadJSON<Parameters<typeof L.fromWire>[0]>(FILES.live);
    if (stored && !this.live) {
      try {
        this.live = this.wire(LiveSession.resume(L.fromWire(stored), this.effects(), true));
        this.requested = true;
      } catch {
        setAside(FILES.live);
      }
    }
    link?.activate();
    this.emit();
  }

  attach(client: LifeClient | null) {
    if (this.client === client) return;
    this.client = client;
    if (client) void this.load();
  }

  // ── Effects the live session gets ──

  private api(): LiveApi | null {
    const client = this.client;
    if (!client) return null;
    return {
      put: (session, baseVersion) => client.call("put_live_session", { session, baseVersion }),
      get: async () => (await client.call("get_live_session", {})).session,
      end: async (discard) => void (await client.call("end_live_session", { discard })),
    };
  }

  private effects(): LiveEffects {
    return {
      ...this.platform,
      api: () => this.api(),
      unit: (id) => this.unit(id),
      now: Date.now,
      save: (state) => (state ? saveJSON(FILES.live, L.toWire(state)) : removeFile(FILES.live)),
      changed: (session) => {
        this.platform.changed?.(session);
        this.platform.activity?.(session);
        this.link?.publish();
      },
    };
  }

  private wire(session: LiveSession) {
    session.subscribe(this.emit);
    return session;
  }

  // ── Loading ──

  async load() {
    const client = this.client;
    if (!client) return;
    await this.uploadPending();
    await this.restoreFromEngine();
    try {
      const [program, list] = await Promise.all([client.call("get_training_program", {}), client.call("list_training_sessions", {})]);
      this.apply(program);
      this.sessions = list.sessions;
    } catch {}
    this.emit();
  }

  /** The program as the engine returns it after a load or an edit. */
  apply(response: ActiveProgramResponse) {
    this.program = response;
    if (response.settings) this.adopt(response.settings);
    this.link?.publish();
    this.emit();
  }

  setSessions(sessions: TrainingSession[]) {
    this.sessions = sessions;
    this.emit();
  }

  /** Siguiente's day: the template of the first pending dated session from today on; null with no program or nothing pending. */
  get nextDay(): ProgramDay | null {
    const p = this.program;
    if (!p?.program) return null;
    if (!p.blocks?.length) return p.program.days.find((d) => d.id === p.nextDayId) ?? p.program.days[0] ?? null;
    return p.program.days.find((d) => d.id === p.nextDayId) ?? null;
  }

  /** What starting `day` uses: the Coach's adjusted copy when one applies. */
  dayToStart(day: ProgramDay): { day: ProgramDay; suggestions: ActiveProgramResponse["suggestions"] } {
    const a = this.program?.adjustment;
    if (a && a.dayId === day.id && a.status === "ready" && !a.noChange && !a.dismissed && a.changes.length) return { day: a.day, suggestions: a.suggestions };
    return { day, suggestions: this.program?.suggestions ?? {} };
  }

  /** What «Empezar» on the Watch starts: the next day, as `start` would. */
  watchPlan(): WatchPlan | null {
    const day = this.nextDay;
    if (this.live || !day) return null;
    const plan = this.dayToStart(day);
    return { day: plan.day, programId: this.program?.program?.id ?? null, suggestions: plan.suggestions };
  }

  // ── Units ──

  unit(exerciseId: string): WeightUnit {
    return this.settings.exerciseUnits[exerciseId] ?? this.settings.defaultUnit;
  }

  /** New settings; the live session's open sets move onto any exercise's new unit. */
  private adopt(next: TrainingSettings) {
    const old = this.settings;
    this.settings = next;
    saveJSON(FILES.settings, next);
    const unitOf = (s: TrainingSettings, id: string) => s.exerciseUnits[id] ?? s.defaultUnit;
    this.live?.snapOpenSets((id) => (unitOf(next, id) !== unitOf(old, id) ? unitOf(next, id) : null));
    this.link?.publish();
    this.emit();
  }

  /** The unit of one exercise's machine: applies at once (open sets snap), reverted if the Mac refuses. */
  async setUnit(exerciseId: string, unit: WeightUnit) {
    const client = this.client;
    if (unit === this.unit(exerciseId) || !client) return;
    const old = this.settings;
    this.adopt({ ...old, exerciseUnits: { ...old.exerciseUnits, [exerciseId]: unit } });
    try {
      this.adopt(await client.call("set_exercise_unit", { exerciseId, unit }));
    } catch (error) {
      this.adopt(old);
      throw error;
    }
  }

  async setDefaultUnit(unit: WeightUnit) {
    const client = this.client;
    if (unit === this.settings.defaultUnit || !client) return;
    const old = this.settings;
    this.adopt({ ...old, defaultUnit: unit });
    try {
      this.adopt(await client.call("set_training_preferences", { defaultUnit: unit }));
    } catch (error) {
      this.adopt(old);
      throw error;
    }
  }

  /** The load of the last set logged for an exercise, to prefill a swapped or added one. */
  lastWeight(exerciseId: string): number | null {
    const latest = this.sessions.filter((s) => s.sets.some((x) => x.exerciseId === exerciseId)).sort((a, b) => b.startedAt - a.startedAt)[0];
    const sets = latest?.sets.filter((x) => x.exerciseId === exerciseId).sort((a, b) => b.doneAt - a.doneAt);
    return sets?.[0]?.weightKg ?? null;
  }

  /** «Cambiar ejercicio» para siempre: the program day swaps it too, keeping the program exercise's id and targets. */
  async persistSwap(programExerciseId: string, exerciseId: string) {
    const client = this.client;
    const dayId = this.live?.state.dayId;
    const day = this.program?.program?.days.find((d) => d.id === dayId);
    if (!client || !day || !day.exercises.some((e) => e.id === programExerciseId)) return;
    const exercises = day.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.id === programExerciseId ? exerciseId : e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRpe: e.targetRpe,
      targetRir: e.targetRir,
      restSeconds: e.restSeconds,
      notes: e.notes,
      cardio: e.cardio,
      // A hand-set load belongs to the old exercise.
      weightKg: e.id === programExerciseId ? null : (e.weightKg ?? null),
      supersetId: e.supersetId,
    }));
    this.apply(await client.call("edit_program_day", { dayId: day.id, scope: "always", exercises }));
  }

  // ── The live session ──

  /**
   * Opens the live session for `day` (the Coach's adjusted copy when one applies) and hands it to the
   * engine, as its dated session `instanceId` (by default Siguiente's, when `day` is its day).
   */
  start(day: ProgramDay, instanceId?: string | null) {
    if (this.live) return this.live;
    const plan = this.dayToStart(day);
    const dated = instanceId !== undefined ? instanceId : day.id === this.program?.nextDayId ? (this.program?.nextInstanceId ?? null) : null;
    const session = this.wire(new LiveSession(L.fromDay(plan.day, this.program?.program?.id ?? null, plan.suggestions, Date.now(), dated), this.effects()));
    this.live = session;
    this.begin(session, true);
    return session;
  }

  /** A session started on the Watch: the phone takes it over (the Watch is already recording). */
  adoptFromWatch(state: L.LiveState) {
    if (this.live || this.memory.closedIds.includes(state.id)) return;
    const session = this.wire(new LiveSession(state, this.effects()));
    this.live = session;
    this.requested = true;
    this.begin(session, false);
  }

  private begin(session: LiveSession, launchWatch: boolean) {
    this.platform.activity?.(session);
    this.link?.began(session.state.id, launchWatch);
    session.begin();
    this.emit();
  }

  /** A session in progress on the engine that this phone has no file for (a reinstall), unless closed here or abandoned. */
  async restoreFromEngine() {
    const api = this.api();
    if (this.live || !api) return;
    let remote;
    try {
      remote = await api.get();
    } catch {
      return;
    }
    if (!remote || this.live) return;
    const state = L.fromWire(remote);
    const closed = new Set([...this.memory.closedIds, ...this.queue().map((s) => s.id)]);
    if (!LiveSession.shouldRestore(state, closed, Date.now())) return;
    this.live = this.wire(LiveSession.resume(state, this.effects(), false));
    this.platform.activity?.(this.live);
    this.requested = true;
    this.emit();
  }

  private rememberClosed(id: string) {
    this.memory = { closedIds: [...this.memory.closedIds.filter((x) => x !== id), id].slice(-20) };
    saveJSON(FILES.memory, this.memory);
  }

  private close(session: LiveSession) {
    this.rememberClosed(session.state.id);
    session.close();
    this.platform.activity?.(null);
    this.live = null;
    this.emit();
  }

  /** Drops the session here and on the engine, saving nothing. */
  async discard() {
    const live = this.live;
    if (!live) return;
    this.link?.ended(live.state.id, false);
    this.close(live);
    try {
      await this.api()?.end(true);
    } catch {}
  }

  /**
   * Ends the live session. The finished session is on disk (the upload queue)
   * before anything can fail or be killed; then it goes to the Mac, and only once
   * the Mac has it is the engine's live copy dropped. The summary shows at once.
   */
  async finish() {
    const live = this.live;
    if (!live || this.finishing) return;
    this.finishing = true;
    try {
      const state = live.state;
      const session = L.finishedSession(state, Date.now());
      // Recorded live (by the Watch or this iPhone), the session is one workout in Salud already.
      const recordedLive = this.link?.ended(state.id, true)?.by != null;
      const blocks = recordedLive
        ? []
        : state.exercises.flatMap((ex) => (ex.cardioLog ? [{ log: ex.cardioLog, modality: ex.modality, speedKmh: ex.cardio?.speedKmh ?? null }] : []));
      const work = L.hasWork(state);
      if (work) this.enqueue(session);
      this.close(live);
      this.summary = {
        session,
        prs: [],
        uploadFailed: false,
        uploaded: false,
        skipped: L.skippedNames(state),
        cutShort: state.exercises.flatMap((ex) => L.cutShortSummary(ex) ?? []),
        savedToHealth: false,
        names: Object.fromEntries(state.exercises.map((ex) => [ex.exerciseId, ex.name])),
      };
      this.emit();
      if (!work) {
        await this.api()?.end(true).catch(() => {});
        return;
      }
      void this.platform.saveToHealth?.(session, blocks, !recordedLive).then((saved) => {
        if (saved && this.summary?.session.id === session.id) {
          this.summary = { ...this.summary, savedToHealth: true };
          this.emit();
        }
      });
      if (!(await this.upload(session))) return;
      // A session started meanwhile is the engine's live copy now: leave that one.
      if (!this.live) await this.api()?.end(false).catch(() => {});
      await this.load();
    } finally {
      this.finishing = false;
      this.emit();
    }
  }

  dismissSummary() {
    this.summary = null;
    this.emit();
  }

  /** «Reintentar» on the summary of a session the Mac didn't get. */
  async retryUpload() {
    const summary = this.summary;
    if (!summary || summary.uploaded) return;
    this.summary = { ...summary, uploadFailed: false };
    this.emit();
    if (await this.upload(summary.session)) await this.load();
  }

  // ── Upload queue ──

  private queue(): SessionInput[] {
    const items = loadJSON<SessionInput[]>(FILES.pending);
    return Array.isArray(items) ? items : [];
  }

  private writeQueue(items: SessionInput[]) {
    if (items.length) saveJSON(FILES.pending, items);
    else removeFile(FILES.pending);
  }

  private enqueue(session: SessionInput) {
    this.writeQueue([...this.queue().filter((s) => s.id !== session.id), session]);
  }

  /** Posts one finished session (the engine upserts by id); it leaves the queue only once the Mac has it. */
  private async upload(session: SessionInput): Promise<boolean> {
    const client = this.client;
    const mine = () => this.summary?.session.id === session.id;
    if (!client) {
      if (mine()) this.summary = { ...this.summary!, uploadFailed: true };
      this.emit();
      return false;
    }
    try {
      const saved = await client.call("save_training_session", session);
      this.writeQueue(this.queue().filter((s) => s.id !== session.id));
      if (mine()) this.summary = { ...this.summary!, prs: saved.prs, uploaded: true, uploadFailed: false };
      this.emit();
      return true;
    } catch (error) {
      console.warn(`[training] session ${session.id} didn't reach the Mac`, error);
      if (mine()) this.summary = { ...this.summary!, uploadFailed: true };
      this.emit();
      return false;
    }
  }

  /** Sends the sessions still queued, oldest first; stops at the first failure. */
  async uploadPending() {
    if (this.uploading) return;
    this.uploading = true;
    try {
      for (const session of this.queue()) if (!(await this.upload(session))) return;
    } finally {
      this.uploading = false;
    }
  }

  // ── The app's lifecycle ──

  /** Back in front: timers re-armed (they don't run in the background), the engine's copy checked, the queue sent. */
  foreground() {
    this.live?.rearm();
    if (this.live) this.platform.activity?.(this.live);
    void this.live?.pull();
    void this.uploadPending();
  }

  /** Going to the background: what the debounce hasn't sent yet. */
  background() {
    void this.live?.flush();
  }

  /** Something changed in Salud on the Mac (the change feed): the Coach may have changed the session in progress. */
  saludChanged() {
    void this.live?.coachChanged();
  }
}

export const training = new TrainingStore();

/** The store, re-rendering on every change. */
export function useTraining() {
  useSyncExternalStore(training.subscribe, () => training.revision);
  return training;
}

/** The live session (null without one), re-rendering on every change of it. */
export function useLive(): LiveSession | null {
  useSyncExternalStore(training.subscribe, () => training.revision);
  return training.live;
}
