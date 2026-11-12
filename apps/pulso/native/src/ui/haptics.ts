import * as Haptics from "expo-haptics";

// One vocabulary of taps for the whole app. Fire-and-forget: a missing Taptic
// Engine (simulator) must never throw into a handler.

const run = (p: Promise<void>) => void p.catch(() => undefined);

export const haptics = {
  /** A button, a tab. */
  tap: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A stepper tick, a segment change. */
  select: () => run(Haptics.selectionAsync()),
  /** A firmer press: the rail's long-press, a sheet snapping open. */
  press: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** «HECHO», a dose taken, a saved log. */
  success: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Hitting a stepper's limit. */
  edge: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
};
