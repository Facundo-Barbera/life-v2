import * as Notifications from "expo-notifications";
import { LiveActivity, Watch } from "pulso-watch";
import { whenHealthAnswered } from "@/health/access";
import { WATCH_ACCESS } from "@/health/healthkit";
import { saveFinishedWorkout } from "@/health/save-workout";
import { PhoneWorkout } from "@/health/workout";
import { haptics } from "@/ui/haptics";
import { FILES, loadJSON, saveJSON } from "./files";
import { liveActivityState } from "./live/activity";
import type { LiveSession } from "./live/session";
import { training, type Platform } from "./store";
import { WatchLink, type WatchMemory } from "./watch";

// The live session's effects on a real iPhone: haptics, the rest and cardio
// notifications for a phone in the pocket, the Live Activity, the Watch link.
// Booted once at launch (`bootTraining`), before any screen needs the session.

const REST = "pulso.training.rest";
const CARDIO = Array.from({ length: 48 }, (_, i) => `pulso.training.cardio.${i}`);
const OURS = new Set([REST, ...CARDIO]);

// In front, our own cues are a haptic, not a banner (as UNUserNotificationCenter without a delegate);
// anything else keeps the system's default presentation.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const ours = OURS.has(n.request.identifier);
    return { shouldShowBanner: !ours, shouldShowList: !ours, shouldPlaySound: !ours, shouldSetBadge: false };
  },
});

const timeInterval = (seconds: number): Notifications.TimeIntervalTriggerInput => ({
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds: Math.max(1, Math.round(seconds)),
  repeats: false,
});

function schedule(identifier: string, notice: { after: number; title: string; body: string }) {
  void Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: notice.title, body: notice.body, sound: true, interruptionLevel: "timeSensitive" },
    trigger: timeInterval(notice.after),
  }).catch(() => {});
}

const cancel = (ids: string[]) => ids.forEach((id) => void Notifications.cancelScheduledNotificationAsync(id).catch(() => {}));

// ── The Live Activity ────────────────────────────────────────────────────────

type ActivityMemory = { id: string; sessionId: string } | null;
let activity: ActivityMemory = loadJSON<{ activity: ActivityMemory }>("live-activity.json")?.activity ?? null;
let starting: Promise<void> | null = null;
const rememberActivity = (next: ActivityMemory) => {
  activity = next;
  saveJSON("live-activity.json", { activity: next });
};

/**
 * Adopts the activity this session left running (a relaunch keeps it on the
 * lock screen) and brings it up to date, or starts one; any other is ended, so
 * there is never a duplicate. null ends them all.
 */
function followActivity(session: LiveSession | null) {
  if (!session || session.closed) {
    rememberActivity(null);
    void LiveActivity.end();
    return;
  }
  const state = liveActivityState(session.state, training.program?.hrZones, (id) => training.unit(id));
  const ids = LiveActivity.ids();
  if (activity && activity.sessionId === session.state.id && ids.includes(activity.id)) {
    for (const other of ids) if (other !== activity.id) void LiveActivity.end(other);
    void LiveActivity.update(activity.id, state).catch(() => {});
    return;
  }
  if (starting || !LiveActivity.enabled()) return;
  for (const other of ids) void LiveActivity.end(other);
  const sessionId = session.state.id;
  starting = LiveActivity.start({ sessionName: session.state.name, startedAt: new Date(session.state.startedAt) }, state)
    .then((id) => rememberActivity({ id, sessionId }))
    .catch(() => {})
    .finally(() => {
      starting = null;
    });
}

// ── Boot ─────────────────────────────────────────────────────────────────────

const platform: Platform = {
  haptic: (kind) => (kind === "success" ? haptics.success() : kind === "warning" ? haptics.warning() : haptics.press()),
  restNotice: (notice) => (notice ? schedule(REST, notice) : cancel([REST])),
  cardioNotices: (notices) => {
    cancel(CARDIO);
    notices.forEach((notice, i) => schedule(CARDIO[i]!, notice));
  },
  activity: followActivity,
  // Nothing recorded it live (no Watch, the phone didn't): Salud gets the strength workout and each cardio block.
  saveToHealth: (session, blocks, strength) => saveFinishedWorkout(session, blocks, strength),
};

let booted = false;

export function bootTraining() {
  if (booted) return;
  booted = true;
  const link = new WatchLink({
    watch: {
      send: (m) => Watch.send(m),
      publish: (m) => Watch.publish(m),
      // Starting a session presents /sesion: a native Health sheet now would collide with it.
      startWatchApp: () => whenHealthAnswered(WATCH_ACCESS, () => Watch.startWatchApp()),
      onMessage: (listener) => Watch.onMessage((m) => listener(m)),
      onState: (listener) => Watch.onState(listener),
    },
    phone: PhoneWorkout,
    host: {
      live: () => training.live,
      plan: () => training.watchPlan(),
      unit: (id) => training.unit(id),
      hrZones: () => training.program?.hrZones ?? null,
      adoptFromWatch: (state) => training.adoptFromWatch(state),
      setUnit: (id, unit) => void training.setUnit(id, unit).catch(() => {}),
      finish: () => training.finish(),
      discard: () => training.discard(),
    },
    memory: {
      load: () => loadJSON<WatchMemory>(FILES.watch) ?? { applied: [], recorded: null, phoneRecords: true },
      save: (memory) => saveJSON(FILES.watch, memory),
    },
  });
  training.boot(platform, link);
}

/** Asked once a session starts: the rest and cardio cues reach a locked phone. */
export function askForNotifications() {
  void Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } }).catch(() => {});
}
