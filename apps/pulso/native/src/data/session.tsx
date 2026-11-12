import { getMembership, sendEmailCode, signOut as authSignOut, verifyEmailCode } from "@life/auth";
import type { LifeClient, Member } from "@life/db";
import { DEFAULT_TZ, getSettings } from "@life/db/pulso";
import { focusManager, onlineManager, useQueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { PulsoApi } from "./api";
import { allKey } from "./keys";
import { supabase } from "./supabase";

// The phone's one link to its data: the Supabase session (Keychain), the
// membership (an invitation is required), the timezone, and the typed
// operations (PulsoApi). Screens read it with `useEngine()` and query through
// `useOperation()`; none of them touches Supabase directly.

export type Reachability = "checking" | "online" | "unreachable";

/** Who is signed in. `deviceId` is kept for code that keyed state per pairing: now it's the user. */
export type Credentials = { userId: string; email: string | null; deviceId: string };

type SessionState = {
  /** false when the build has no EXPO_PUBLIC_SUPABASE_* settings. */
  configured: boolean;
  /** undefined while the Keychain is read at launch; null signed out. */
  credentials: Credentials | null | undefined;
  /** null: signed in without an invitation. undefined: not known yet. */
  member: Member | null | undefined;
  supabase: LifeClient | null;
  client: PulsoApi | null;
  tz: string;
  reachability: Reachability;
  /** Kept for the diagnostics screen: there is no change feed any more. */
  live: boolean;
  lastChangeAt: number | null;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  /** Signs out (the old «Desemparejar»). */
  unpair(): Promise<void>;
  /** Refreshes everything now (pull to refresh). */
  recheck(): void;
};

const SessionContext = createContext<SessionState | null>(null);

export function useEngine(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useEngine outside SessionProvider");
  return value;
}
export const useSession = useEngine;

/** TanStack Query follows the app's foreground and the device's network. */
function useQueryEnvironment() {
  useEffect(() => {
    focusManager.setEventListener((setFocused) => {
      const subscription = AppState.addEventListener("change", (state) => setFocused(state === "active"));
      return () => subscription.remove();
    });
    onlineManager.setEventListener((setOnline) => {
      const subscription = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
      return () => subscription.remove();
    });
  }, []);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  useQueryEnvironment();
  const queries = useQueryClient();
  const db = useMemo(() => supabase(), []);
  const [credentials, setCredentials] = useState<Credentials | null | undefined>(db ? undefined : null);
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [tz, setTz] = useState(DEFAULT_TZ);
  const [reachability, setReachability] = useState<Reachability>("checking");
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const subscription = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
    return () => subscription.remove();
  }, []);

  // The session: read from the Keychain at launch, then follow sign-in/out and refreshes.
  useEffect(() => {
    if (!db) return;
    const apply = (user: { id: string; email?: string | null } | null | undefined) =>
      setCredentials((prev) => {
        if (!user) return null;
        if (prev && prev.userId === user.id) return prev;
        return { userId: user.id, email: user.email ?? null, deviceId: user.id };
      });
    void db.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data } = db.auth.onAuthStateChange((_event, session) => apply(session?.user ?? null));
    // Supabase refreshes tokens only while the app is in front.
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void db.auth.startAutoRefresh();
      else void db.auth.stopAutoRefresh();
    });
    return () => {
      data.subscription.unsubscribe();
      appState.remove();
    };
  }, [db]);

  // Membership and timezone, once per user.
  useEffect(() => {
    if (!db || !credentials) {
      setMember(undefined);
      return;
    }
    let cancelled = false;
    setReachability("checking");
    void (async () => {
      try {
        const found = await getMembership(db, credentials.userId);
        if (cancelled) return;
        setMember(found);
        if (found) {
          const settings = await getSettings(db);
          if (!cancelled) setTz(settings.timezone || DEFAULT_TZ);
        }
        if (!cancelled) setReachability("online");
      } catch {
        if (!cancelled) setReachability("unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, credentials]);

  const client = useMemo(
    () => (db && credentials && member ? new PulsoApi({ db, userId: credentials.userId, tz }) : null),
    [db, credentials, member, tz],
  );

  const unpair = useCallback(async () => {
    if (db) await authSignOut(db).catch(() => undefined);
    queries.removeQueries({ queryKey: allKey });
    setCredentials(null);
  }, [db, queries]);

  const value = useMemo<SessionState>(
    () => ({
      configured: !!db,
      credentials,
      member,
      supabase: db,
      client,
      tz,
      reachability: online ? reachability : "unreachable",
      live: false,
      lastChangeAt: null,
      sendCode: async (email) => {
        if (!db) throw new Error("Falta configurar Supabase en esta compilación.");
        await sendEmailCode(db, email);
      },
      verifyCode: async (email, code) => {
        if (!db) throw new Error("Falta configurar Supabase en esta compilación.");
        await verifyEmailCode(db, email, code);
      },
      unpair,
      recheck: () => void queries.invalidateQueries({ queryKey: allKey }),
    }),
    [db, credentials, member, client, tz, reachability, online, unpair, queries],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Kept name for the root layout. */
export const EngineProvider = SessionProvider;
