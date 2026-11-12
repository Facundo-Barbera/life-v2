import { requireOptionalNativeModule, type EventSubscription } from "expo";
import { z } from "zod";
import {
  WatchMetrics,
  ActivityAttributes,
  ActivityContentState,
  decodeWatchMessage,
  encodeWatchMessage,
  type WatchMessage,
  type WorkoutStage,
} from "./messages";

/** What WCSession says about the Watch. */
export type WatchState = { supported: boolean; activated: boolean; paired: boolean; installed: boolean; reachable: boolean };
/** Which road a message came by. */
export type Via = "message" | "userInfo" | "context" | "mirror";

type Native = {
  state(): WatchState;
  send(json: string): boolean;
  deliver(json: string): boolean;
  publish(json: string): boolean;
  startWatchApp(): Promise<void>;
  activitiesEnabled(): boolean;
  activityIds(): string[];
  startActivity(attributesJson: string, stateJson: string): Promise<string>;
  updateActivity(id: string, stateJson: string): Promise<void>;
  endActivity(id: string | null): Promise<void>;
  watchRecording(): boolean;
  workoutFollow(stageJson: string, paused: boolean, sinceMs: number, stageSinceMs: number | null): Promise<void>;
  workoutFinish(save: boolean): Promise<void>;
  workoutRecover(): Promise<void>;
  workoutMetrics(): string | null;
  widgetsMirrorPairing(baseUrl: string | null, token: string | null): void;
  widgetsRead(): string | null;
  widgetsWrite(json: string): boolean;
  widgetsClear(): void;
  widgetsReload(): void;
  addListener(event: "onWorkout", listener: (payload: { json: string | null }) => void): EventSubscription;
  addListener(event: "onMessage", listener: (payload: { json: string; via: Via }) => void): EventSubscription;
  addListener(event: "onState", listener: (state: WatchState) => void): EventSubscription;
};

// Optional: Expo Go and tests have no such module; everything answers "no Watch".
const native = requireOptionalNativeModule<Native>("PulsoWatch");
const NO_WATCH: WatchState = { supported: false, activated: false, paired: false, installed: false, reachable: false };

export const watchAvailable = native !== null;

export const Watch = {
  state: (): WatchState => native?.state() ?? NO_WATCH,
  /** Now, if the Watch is reachable; false otherwise. */
  send: (message: WatchMessage): boolean => native?.send(encodeWatchMessage(message)) ?? false,
  /** Queued by the system until it reaches the Watch, in order. */
  deliver: (message: WatchMessage): boolean => native?.deliver(encodeWatchMessage(message)) ?? false,
  /** The Watch gets this one, or a later one, whenever it can. */
  publish: (message: WatchMessage): boolean => native?.publish(encodeWatchMessage(message)) ?? false,
  startWatchApp: (): Promise<void> => native?.startWatchApp() ?? Promise.reject(new Error("Sin Apple Watch")),
  /** Every message from the Watch, decoded; ones that don't parse are dropped. */
  onMessage(listener: (message: WatchMessage, via: Via) => void): () => void {
    const subscription = native?.addListener("onMessage", ({ json, via }) => {
      const message = decodeWatchMessage(json);
      if (message) listener(message, via);
    });
    return () => subscription?.remove();
  },
  onState(listener: (state: WatchState) => void): () => void {
    const subscription = native?.addListener("onState", listener);
    return () => subscription?.remove();
  },
};

export const LiveActivity = {
  enabled: (): boolean => native?.activitiesEnabled() ?? false,
  ids: (): string[] => native?.activityIds() ?? [],
  start: (attributes: ActivityAttributes, state: ActivityContentState): Promise<string> =>
    native
      ? native.startActivity(JSON.stringify(z.encode(ActivityAttributes, attributes)), JSON.stringify(z.encode(ActivityContentState, state)))
      : Promise.reject(new Error("Sin Live Activities")),
  update: (id: string, state: ActivityContentState): Promise<void> =>
    native?.updateActivity(id, JSON.stringify(z.encode(ActivityContentState, state))) ?? Promise.resolve(),
  /** Ends `id`, or every one with none. */
  end: (id?: string): Promise<void> => native?.endActivity(id ?? null) ?? Promise.resolve(),
};

const decodeMetrics = (json: string | null): WatchMetrics | null => {
  if (!json) return null;
  const parsed = WatchMetrics.safeDecode(JSON.parse(json));
  return parsed.success ? parsed.data : null;
};

/**
 * The phone's own workout recording (Swift's `WorkoutManager`, unchanged), raw.
 * Use `PhoneWorkout` (src/health/workout.ts): it orders the calls and keeps
 * one workout per session.
 */
export const NativeWorkout = native
  ? {
      /** The Watch is recording this session's workout (mirrored to the phone). */
      watchRecording: (): boolean => native.watchRecording(),
      follow: (stage: WorkoutStage, paused: boolean, since: Date, stageSince: Date | null): Promise<void> =>
        native.workoutFollow(JSON.stringify(stage), paused, since.getTime(), stageSince?.getTime() ?? null),
      finish: (save: boolean): Promise<void> => native.workoutFinish(save),
      recover: (): Promise<void> => native.workoutRecover(),
      metrics: (): WatchMetrics | null => decodeMetrics(native.workoutMetrics()),
      onMetrics(listener: (metrics: WatchMetrics | null) => void): () => void {
        const subscription = native.addListener("onWorkout", ({ json }) => listener(decodeMetrics(json)));
        return () => subscription.remove();
      },
    }
  : null;
export type NativeWorkout = NonNullable<typeof NativeWorkout>;

/**
 * The App Group the unchanged PulsoWidgets read (Shared/WidgetSnapshot.swift,
 * SharedCredentials.swift): the snapshot file and the pairing mirrored into the
 * `.shared` Keychain group, so their timelines and buttons reach the Mac too.
 */
export const WidgetStore = {
  /** null forgets it (unpaired). */
  mirrorPairing: (pairing: { baseUrl: string; token: string } | null): void => native?.widgetsMirrorPairing(pairing?.baseUrl ?? null, pairing?.token ?? null),
  /** The stored snapshot's JSON (WidgetSnapshot, dates in epoch ms). */
  read: (): string | null => native?.widgetsRead() ?? null,
  /** Validated by the Swift type before it's written; false when it didn't decode. */
  write: (json: string): boolean => native?.widgetsWrite(json) ?? false,
  clear: (): void => native?.widgetsClear(),
  /** Every Pulso widget redraws from the snapshot. */
  reload: (): void => native?.widgetsReload(),
};
