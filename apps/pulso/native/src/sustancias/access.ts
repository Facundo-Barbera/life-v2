import * as LocalAuthentication from "expo-local-authentication";
import { router, type Href } from "expo-router";
import { createGate } from "./model";

// The only way into Sustancias is a row in Ajustes, and it goes through here:
// a fresh Face ID (or passcode) check every time, even with the app unlocked
// (SubstancesAccess.swift). The screen also asks on its own when it's reached
// any other way.

const gate = createGate();
let checking = false;

/** A fresh check. Passes without one only when the phone has no passcode at all, as the SwiftUI app's AppLock. */
export async function confirmIdentity(): Promise<boolean> {
  if (checking) return false;
  checking = true;
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return true;
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirma que eres tú para continuar.", cancelLabel: "Cancelar", disableDeviceFallback: false });
    return result.success;
  } catch {
    return false;
  } finally {
    checking = false;
  }
}

/** Ajustes' row: checks, then opens the screen with a one-shot grant. */
export async function openSubstances(): Promise<boolean> {
  if (!(await confirmIdentity())) return false;
  gate.grant();
  router.push("/sustancias" as Href);
  return true;
}

/** The screen on arrival: true when Ajustes just checked. */
export const consumeGrant = () => gate.consume();
