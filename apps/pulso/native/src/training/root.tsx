import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useEngine } from "@/data/session";
import { ROOT } from "@/data/keys";
import { useOperation } from "@/data/queries";
import { useSessionRail, type RailSession } from "@/shell/session";
import { origin } from "./cardio";
import { current, focused, isCardio, resting, setsDone, setsTotal, type LiveState } from "./live/state";
import { bootTraining } from "./platform";
import { training, useLive } from "./store";

// Mounted once under the providers: boots the session left on disk, follows the
// app's foreground, keeps the store fed with the program and sessions, pulls the
// session in progress when Pulso's data was refreshed (it may have changed on the
// web or another device), and drives the floating rail.

export function useTrainingRoot() {
  const { client } = useEngine();
  const queries = useQueryClient();
  const live = useLive();

  useEffect(bootTraining, []);
  useEffect(() => training.attach(client), [client]);

  const program = useOperation("get_training_program", {});
  const sessions = useOperation("list_training_sessions", {});
  useEffect(() => void (program.data && training.apply(program.data)), [program.data]);
  useEffect(() => void (sessions.data && training.setSessions(sessions.data.sessions)), [sessions.data]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => (state === "active" ? training.foreground() : state === "background" ? training.background() : undefined));
    return () => sub.remove();
  }, []);

  // Every write invalidates Pulso's queries (and a return to the front refetches them): the session in progress may have changed elsewhere (the web, another device).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = queries.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "invalidate") return;
      const key = event.query.queryKey;
      if (key[0] !== ROOT || key[1] === "get_live_session") return;
      clearTimeout(timer);
      timer = setTimeout(() => training.saludChanged(), 150);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [queries]);

  // A session came back (a relaunch, the engine's copy, the Watch): the live screen, once.
  useEffect(() => {
    if (!training.requested || !live) return;
    training.requested = false;
    router.push("/sesion" as Href);
  }, [live]);

  useSessionRail(live ? railFor(live.state) : null);
}

/** Stable, so the rail isn't set again on every render. */
const onReturn = () => router.push("/sesion" as Href);

/** The rail while browsing other tabs: «TORSO A · 7/18», what's on, and its timer. */
function railFor(s: LiveState): RailSession {
  const title = `${s.name.toUpperCase()} · ${setsDone(s)}/${setsTotal(s)}`;
  const clock = s.cardioClock;
  if (resting(s) && s.restEndsAt != null) return { title, subtitle: "DESCANSO", timer: { mode: "down", endsAt: s.restEndsAt }, onReturn };
  const block = clock ? s.exercises.find((e) => e.id === clock.exerciseId) : null;
  if (clock && block) {
    const from = origin(clock);
    const timer = from != null ? { mode: "up" as const, startedAt: from } : { mode: "up" as const, startedAt: -clock.accumulated * 1000, pausedAt: 0 };
    return { title, subtitle: from != null ? block.name.toUpperCase() : "EN PAUSA", timer, onReturn };
  }
  const next = current(s);
  const ex = next ? s.exercises[next.exercise] : focused(s);
  const subtitle = next && ex ? `SERIE ${next.set + 1} DE ${ex.sets.length}` : ex && isCardio(ex) ? ex.name.toUpperCase() : "SESIÓN";
  return { title, subtitle, timer: { mode: "up", startedAt: s.startedAt }, onReturn };
}
