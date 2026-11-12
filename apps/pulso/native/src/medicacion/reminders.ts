import type { PulsoApi as LifeClient } from "@/data/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useCallback, useEffect } from "react";
import { useEngine } from "@/data/session";
import { allKey, operationKey } from "@/data/keys";
import { clockOf, dateKey, planReminders, reminderId, slotId, SNOOZE_MINUTES, staleReminders, type Reminder } from "./model";
import { loadMemory, saveMemory } from "./storage";

// Local dose reminders, as the SwiftUI app's MedicationNotifications: the next
// week of doses is planned from the engine's resolved slots (get_upcoming_doses)
// and re-planned whenever Salud changes, with «Tomada» and «Posponer 15 min»
// right on the notification. iOS keeps 64 pending requests; the plan caps at 56.

const CATEGORY = "pulso.medication.dose";
const TAKE = "pulso.medication.take";
const SNOOZE = "pulso.medication.snooze";

let categoryReady: Promise<unknown> | null = null;
function ensureCategory() {
  categoryReady ??= Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: TAKE, buttonTitle: "Tomada", options: { opensAppToForeground: false, isAuthenticationRequired: true } },
    { identifier: SNOOZE, buttonTitle: `Posponer ${SNOOZE_MINUTES} min`, options: { opensAppToForeground: false } },
  ]).catch(() => (categoryReady = null));
  return categoryReady;
}

/** The upcoming slots, keyed without the clock so the change feed refreshes one query; asked as of the moment it runs. */
const UPCOMING_KEY = operationKey("get_upcoming_doses", {});

/** Asks for notifications (quiet if already answered); once granted, plans the reminders right away. */
export function useAskForReminders() {
  const queries = useQueryClient();
  return useCallback(async () => {
    const granted = await askForReminders();
    if (granted) void queries.invalidateQueries({ queryKey: UPCOMING_KEY });
    return granted;
  }, [queries]);
}

/** Asks for notifications once a medication with a schedule is saved (as Swift did); quiet if already answered. */
export async function askForReminders(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || !current.canAskAgain) return current.granted;
    return (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })).granted;
  } catch {
    return false;
  }
}

const content = (r: Pick<Reminder, "title" | "body" | "medicationId" | "date" | "slot">): Notifications.NotificationContentInput => ({
  title: r.title,
  body: r.body,
  sound: true,
  categoryIdentifier: CATEGORY,
  data: { medicationId: r.medicationId, date: r.date, slot: r.slot },
});

/** Replaces the pending dose reminders with the plan for `slots`. Snoozes and catch-ups survive while their dose is still open. */
async function schedule(slots: Parameters<typeof planReminders>[0]) {
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) return;
  await ensureCategory();
  const memory = loadMemory();
  const plan = planReminders(slots, Date.now(), new Set(memory.nudged));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const stale = staleReminders(
    scheduled.map((n) => n.identifier),
    slots,
  );
  await Promise.all(stale.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  const kept = new Set(scheduled.map((n) => n.identifier).filter((id) => !stale.includes(id)));
  const nudged: string[] = [];
  for (const r of plan) {
    const id = r.catchUp ? `${r.id}.catchup` : r.id;
    if (r.catchUp && kept.has(id)) continue;
    const trigger: Notifications.NotificationTriggerInput = r.catchUp
      ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round((r.fireAt - Date.now()) / 1000)), repeats: false }
      : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.fireAt) };
    await Notifications.scheduleNotificationAsync({ identifier: id, content: content(r), trigger }).catch(() => {});
    if (r.catchUp) nudged.push(slotId(r));
  }
  if (nudged.length) {
    // Only today's and yesterday's matter; older ids drop off as new ones come.
    const recent = [dateKey(new Date()), dateKey(new Date(Date.now() - 86_400_000))];
    saveMemory((m) => ({ ...m, nudged: [...m.nudged.filter((id) => recent.some((d) => id.includes(`|${d}|`))), ...nudged] }));
  }
}

type Payload = { medicationId: string; date: string; slot: string };
const payloadOf = (data: unknown): Payload | null => {
  const d = data as Partial<Payload> | null;
  return d && typeof d.medicationId === "string" && typeof d.date === "string" && typeof d.slot === "string" ? (d as Payload) : null;
};

/** «Tomada» logs the dose, «Posponer» asks again in 15 minutes; a plain tap opens Medicación. */
async function respond(client: LifeClient, response: Notifications.NotificationResponse) {
  const request = response.notification.request;
  if (request.content.categoryIdentifier !== CATEGORY) return false;
  const p = payloadOf(request.content.data);
  if (!p) return false;
  if (response.actionIdentifier === TAKE) {
    await client.call("record_dose", { medicationId: p.medicationId, date: p.date, scheduledTime: p.slot, status: "tomada", takenAt: Date.now() });
  } else if (response.actionIdentifier === SNOOZE) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${reminderId({ medicationId: p.medicationId, date: p.date, slot: p.slot })}.snooze`,
      content: content({ ...p, title: request.content.title ?? "", body: request.content.body ?? "" }),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: SNOOZE_MINUTES * 60, repeats: false },
    });
    await client.call("record_dose", { medicationId: p.medicationId, date: p.date, scheduledTime: p.slot, status: "pospuesta" });
  } else {
    try {
      router.push("/medicacion" as Href);
    } catch {
      // Navigation isn't up yet on a cold launch: the app simply opens.
    }
  }
  return true;
}


/**
 * Mount once at the root: keeps the dose reminders in step with the engine
 * and answers the notification's actions. Without notification permission it
 * plans nothing; the first scheduled medication asks for it.
 */
export function useMedicationReminders() {
  const { client } = useEngine();
  const queries = useQueryClient();
  const upcoming = useQuery({
    queryKey: UPCOMING_KEY,
    queryFn: ({ signal }) => {
      const now = new Date();
      return client!.call("get_upcoming_doses", { date: dateKey(now), time: clockOf(now) }, { signal });
    },
    enabled: !!client,
  });

  useEffect(() => {
    if (upcoming.data) void schedule(upcoming.data.slots).catch(() => {});
  }, [upcoming.data]);

  useEffect(() => {
    if (!client) return;
    const handled = new Set<string>();
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const key = `${response.notification.request.identifier}|${response.actionIdentifier}|${response.notification.date}`;
      if (handled.has(key)) return;
      handled.add(key);
      // Handled once: a relaunch must not replay it from getLastNotificationResponseAsync.
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      void respond(client, response)
        .then((ours) => {
          if (ours) void queries.invalidateQueries({ queryKey: allKey });
        })
        .catch(() => {});
    };
    // An action tapped while Pulso was closed is the last response at launch.
    void Notifications.getLastNotificationResponseAsync()
      .then(handle)
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [client, queries]);
}
