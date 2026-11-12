import { getRequestStatusForAuthorization, isHealthDataAvailable, requestAuthorization } from "@kingstinct/react-native-healthkit";
import { useEffect } from "react";
import { AppState } from "react-native";
import { createGate, serial } from "./gate";

// The ONLY place that shows Salud's permission sheet. HealthKit presents it
// over whatever is on top; asked while a modal route or a <Modal> is up (or
// being presented/dismissed), the two presentations collide and leave an
// orphaned sheet layer over the tabs. So every request:
// - returns at once, without UI, when the person already answered for those types;
// - otherwise waits until nothing of the app's is presented and the app is in
//   front, then asks, one request at a time.

export type HealthRequest = Parameters<typeof requestAuthorization>[0];

const gate = createGate(600);
const inFront = (state: string | null | undefined) => state !== "background" && state !== "inactive"; // "unknown" at launch counts as in front
gate.setActive(inFront(AppState.currentState));
AppState.addEventListener("change", (state) => gate.setActive(inFront(state)));
const queue = serial();

/** Something of the app's is presented (a modal route, a <Modal>) until the release is called. */
export const holdPresentation = (): (() => void) => gate.hold();

/** Holds the gate while `presented`: every modal route and <Modal> the app shows. */
export function usePresentation(presented: boolean) {
  useEffect(() => (presented ? holdPresentation() : undefined), [presented]);
}

/** True when asking would show nothing: the person already answered (HealthKit never says what was denied). */
export async function healthAnswered(request: HealthRequest): Promise<boolean> {
  if (!isHealthDataAvailable()) return true;
  try {
    return (await getRequestStatusForAuthorization(request)) === 2; // 2: unnecessary
  } catch {
    return false;
  }
}

/** Asks for `request` once nothing is presented. Resolves false when Salud is unavailable or refused the request. */
export function askHealth(request: HealthRequest): Promise<boolean> {
  if (!isHealthDataAvailable()) return Promise.resolve(false);
  return queue(async () => {
    if (await healthAnswered(request)) return true;
    await gate.whenIdle();
    if (await healthAnswered(request)) return true;
    return requestAuthorization(request);
  });
}

/**
 * Runs `action`, a native call that asks for `request` itself (Watch.startWatchApp),
 * only when that ask would show nothing. Otherwise the sheet is queued for when
 * nothing is presented and this rejects: the caller carries on without it.
 */
export async function whenHealthAnswered<T>(request: HealthRequest, action: () => Promise<T>): Promise<T> {
  if (await healthAnswered(request)) return action();
  void askHealth(request).catch(() => false);
  throw new Error("Salud te pedirá permiso al cerrar esta pantalla.");
}
