import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { BigButton, Button, IconButton } from "@/ui/Button";
import { EmptyState } from "@/ui/States";
import { Text } from "@/ui/Text";
import { useToast } from "@/ui/Toast";
import { clockText, elapsed, origin } from "@/training/cardio";
import type { LiveSession } from "@/training/live/session";
import * as L from "@/training/live/state";
import { askForNotifications } from "@/training/platform";
import { training, useLive, useTraining } from "@/training/store";
import { list } from "@/training/text";
import { number, shown, snapKg } from "@/training/units";
import { CardioLogSheet, CardioPage, ExercisePage, SupersetPage, useRecorderMetrics } from "@/training/ui/pages";
import { RestPanel, SessionStrip } from "@/training/ui/parts";
import { EditSessionSheet, MenuSheet, MetricsSheet, RestSheet, SwapSheet, type MenuItem } from "@/training/ui/sheets";
import { SessionSummaryView } from "@/training/ui/summary";
import { useAlignedNow } from "@/training/ui/tick";

// The session in the gym (SwiftUI's LiveSessionView) in Tablero's language:
// the mono title with time, sets and the recording's pulse; a strip of the
// day's screens; one screen per exercise (a superset is one) paging sideways;
// the rest panel while resting; and the lime «HECHO» bar that logs the set (or
// the round) up next. Opened with `?dia=<dayId>` it starts that day when no
// session is live (`&sesion=<instance id>`: as that dated session).

export default function Sesion() {
  const { dia, sesion } = useLocalSearchParams<{ dia?: string; sesion?: string }>();
  const store = useTraining();
  const live = useLive();
  const { colors } = useTheme();

  // Starting from Hoy or Entreno: the day asked for, as `start` would (the Coach's adjusted copy).
  // Once per screen: after a discard or finish it must not start the day again while it closes.
  const started = useRef(false);
  useEffect(() => {
    if (live || !dia || started.current) return;
    const day = store.program?.program?.days.find((d) => d.id === dia);
    if (day) {
      started.current = true;
      store.start(day, sesion);
      askForNotifications();
    }
  }, [dia, live, store.program]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ presentation: "fullScreenModal", headerShown: false, gestureEnabled: false }} />
      {live ? <LiveScreen session={live} /> : store.summary ? <Finished /> : <Nothing waiting={!!dia && !store.program} />}
    </View>
  );
}

function Nothing({ waiting }: { waiting: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 60 }}>
      {waiting ? null : <EmptyState icon="dumbbell" title="Sin sesión en curso" message="Empieza un día desde Entreno." action={{ title: "Volver", onPress: () => router.back() }} />}
    </View>
  );
}

/** The summary right after «Terminar»; records and the upload fill in as the Mac answers. */
function Finished() {
  const store = useTraining();
  const insets = useSafeAreaInsets();
  const { space } = useTheme();
  const summary = store.summary!;
  const names = useMemo(() => Object.fromEntries(store.program?.program?.days.flatMap((d) => d.exercises.map((e) => [e.exerciseId, e.exerciseName])) ?? []), [store.program]);
  return (
    <View style={{ flex: 1, paddingTop: insets.top + space.sm, paddingHorizontal: space.gutter, gap: space.md }}>
      <Text variant="label" color="accentText">
        SESIÓN TERMINADA
      </Text>
      <Text variant="largeTitle">{summary.session.name}</Text>
      <SessionSummaryView
        session={{ ...summary.session, cardio: summary.session.cardio ?? [] }}
        names={{ ...names, ...summary.names }}
        prs={summary.prs}
        skipped={summary.skipped}
        cutShort={summary.cutShort}
        status={{ uploaded: summary.uploaded, failed: summary.uploadFailed, health: summary.savedToHealth }}
        onRetry={() => void store.retryUpload()}
      />
      <View style={{ flex: 1 }} />
      <Button
        title="Listo"
        variant="accent"
        size="lg"
        wide
        testID="summary-done"
        onPress={() => {
          store.dismissSummary();
          router.back();
        }}
        style={{ marginBottom: insets.bottom + space.sm }}
      />
    </View>
  );
}

type Sheet = "exit" | "more" | "edit" | "coach" | "metrics" | "rest" | null;

function LiveScreen({ session }: { session: LiveSession }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const s = session.state;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [swapping, setSwapping] = useState<{ index: number; exerciseId: string; name: string } | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const pager = useRef<FlatList<L.LiveExercise[]>>(null);

  const clock = s.cardioClock;
  const resting = L.resting(s);
  const tickOrigin = clock && clock.runningSince != null ? origin(clock) : resting ? s.restEndsAt : s.startedAt;
  const now = useAlignedNow(tickOrigin);
  const { metrics } = useRecorderMetrics();

  // The screens, each named by its exercises: never indexed by a position a shorter list no longer has.
  const pages = useMemo(() => L.blocks(s).map((b) => s.exercises.slice(b.start, b.end)), [s.exercises]);
  const onScreen = L.blockOf(s, s.focus).start;
  const pageIndex = Math.max(0, pages.findIndex((p) => p[0]?.id === s.exercises[onScreen]?.id));

  // Focus moved elsewhere (a Hecho, the Coach, the strip): the pager follows.
  const shownPage = useRef(pageIndex);
  useEffect(() => {
    if (pageIndex === shownPage.current || pageIndex >= pages.length) return;
    shownPage.current = pageIndex;
    pager.current?.scrollToIndex({ index: pageIndex, animated: true });
  }, [pageIndex, pages.length]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: { item?: L.LiveExercise[] }[] }) => {
    const first = viewableItems[0]?.item?.[0];
    if (!first) return;
    const index = session.state.exercises.findIndex((x) => x.id === first.id);
    if (index < 0) return;
    const page = L.blocks(session.state).findIndex((b) => b.start === index);
    if (page === shownPage.current) return;
    shownPage.current = page;
    if (L.blockOf(session.state, session.state.focus).start !== index) session.setFocus(index);
  }).current;

  // The Coach changed the session: buzz, say what, offer «Deshacer».
  const seenCoach = useRef(session.coachChanges);
  useEffect(() => {
    if (session.coachChanges === seenCoach.current) return;
    seenCoach.current = session.coachChanges;
    toast.show({ message: session.coachSummary ?? "La sesión cambió en otro dispositivo", icon: "sparkles", undo: () => session.undoCoach(), duration: 6000 });
  }, [session.coachChanges]);

  useEffect(() => void session.pull(), [session]);

  const swap = (index: number) => {
    const ex = session.state.exercises[index];
    if (ex) setSwapping({ index, exerciseId: ex.exerciseId, name: ex.name });
  };

  const finish = () => {
    void training.finish();
  };
  const discard = () =>
    Alert.alert("¿Descartar la sesión?", L.hasWork(s) ? "Se pierde todo lo registrado en esta sesión." : "No has registrado nada todavía.", [
      { text: "Seguir entrenando", style: "cancel" },
      {
        text: "Descartar",
        style: "destructive",
        onPress: () => {
          void training.discard();
          router.back();
        },
      },
    ]);
  const exitItems: MenuItem[] = [
    { title: "Minimizar y seguir luego", icon: "chevron.down", onPress: () => router.back() },
    ...(L.hasWork(s) ? [{ title: "Terminar y guardar", icon: "flag.checkered" as const, onPress: finish }] : []),
    { title: "Descartar sesión", icon: "trash", onPress: discard, destructive: true },
  ];

  const focusedBlock = L.blockOf(s, s.focus);
  const members = s.exercises.slice(focusedBlock.start, focusedBlock.end);
  const moreItems: MenuItem[] = [];
  if (members.length) {
    const first = members[0]!;
    const left = first.sets.filter((x) => !L.isDone(x)).length;
    if (members.length === 1 && !L.isCardio(first) && left > 1 && !first.skipped) moreItems.push({ title: `Registrar las ${left} que faltan`, icon: "checkmark.circle", onPress: () => session.completeAll(focusedBlock.start) });
    if (members.length > 1) {
      members.forEach((m, i) => moreItems.push({ title: `Cambiar ${m.name}`, icon: "arrow.triangle.2.circlepath", onPress: () => swap(focusedBlock.start + i) }));
      moreItems.push({ title: "Separar superserie", icon: "link.badge.plus", onPress: () => session.splitSuperset(focusedBlock) });
    } else moreItems.push({ title: "Cambiar ejercicio", icon: "arrow.triangle.2.circlepath", onPress: () => swap(focusedBlock.start) });
    const skipped = members.every((m) => m.skipped);
    const noun = members.length > 1 ? "superserie" : "ejercicio";
    moreItems.push({ title: skipped ? `Retomar ${noun}` : `Saltar ${noun}`, icon: skipped ? "arrow.uturn.backward" : "forward", onPress: () => members.forEach((_, i) => session.setSkipped(focusedBlock.start + i, !skipped)) });
  }
  moreItems.push({ title: "Editar sesión", icon: "list.bullet", onPress: () => setSheet("edit") });
  moreItems.push({ title: "Terminar sesión", icon: "flag.checkered", onPress: () => setSheet("exit") });

  const loggingExercise = logging ? (s.exercises.find((x) => x.id === logging) ?? null) : null;
  const loggingClock = loggingExercise && clock?.exerciseId === loggingExercise.id ? clock : null;

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <Header session={session} now={now} heartRate={metrics?.heartRate ?? null} onExit={() => setSheet("exit")} onMore={() => setSheet("more")} onCoach={() => setSheet("coach")} onMetrics={() => setSheet("metrics")} />
      <SessionStrip state={s} onSelect={(index) => session.setFocus(index)} />
      {s.exercises.length === 0 ? (
        <View style={{ flex: 1, paddingTop: 60 }}>
          <EmptyState icon="dumbbell" title="Sesión sin ejercicios" message="Añade uno para empezar." action={{ title: "Editar sesión", onPress: () => setSheet("edit") }} />
        </View>
      ) : (
        <FlatList
          ref={pager}
          style={{ flex: 1, marginTop: space.sm }}
          data={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => p[0]!.id}
          initialScrollIndex={pageIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }) => (
            <View style={{ width }}>
              {item.length > 1 ? (
                <SupersetPage session={session} id={item[0]!.id} onSwap={swap} />
              ) : L.isCardio(item[0]!) ? (
                <CardioPage session={session} id={item[0]!.id} now={now} onLog={(i) => setLogging(session.state.exercises[i]?.id ?? null)} />
              ) : (
                <ExercisePage session={session} id={item[0]!.id} onSwap={swap} />
              )}
            </View>
          )}
          extraData={`${session.revision}:${now}`}
        />
      )}
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.sm, gap: space.sm, backgroundColor: colors.background }}>
        <RestPanel session={session} now={now} onPick={() => setSheet("rest")} />
        <BottomBar session={session} now={now} onFinish={finish} onLog={(id) => setLogging(id)} />
      </View>

      <MenuSheet visible={sheet === "exit"} onClose={() => setSheet(null)} title="SALIR DE LA SESIÓN" items={exitItems} />
      <MenuSheet visible={sheet === "more"} onClose={() => setSheet(null)} title="SESIÓN" items={moreItems} />
      <EditSessionSheet session={session} visible={sheet === "edit"} onClose={() => setSheet(null)} />
      <MetricsSheet visible={sheet === "metrics"} onClose={() => setSheet(null)} now={now} />
      <RestSheet session={session} visible={sheet === "rest"} onClose={() => setSheet(null)} />
      <SwapSheet
        target={swapping}
        onClose={() => setSwapping(null)}
        onPick={(picked, scope) => {
          const target = swapping;
          setSwapping(null);
          if (!target) return;
          const original = session.state.exercises[target.index];
          session.swap(target.index, picked, training.lastWeight(picked.id) ?? 0);
          if (scope === "always" && original) void training.persistSwap(original.id, picked.id).catch(() => toast.show({ message: "No se pudo cambiar el programa", tone: "error" }));
        }}
      />
      <CardioLogSheet
        exercise={loggingExercise}
        seconds={loggingClock ? elapsed(loggingClock, now) : 0}
        visible={!!loggingExercise}
        onClose={() => setLogging(null)}
        onSave={(log) => {
          const index = session.state.exercises.findIndex((x) => x.id === logging);
          if (index >= 0) session.finishCardio(index, log);
        }}
      />
    </View>
  );
}

/** «TORSO A» in mono, its time and sets; the recording's pulse; ✕ to leave, the Coach and the menu. */
function Header({ session, now, heartRate, onExit, onMore, onCoach, onMetrics }: { session: LiveSession; now: number; heartRate: number | null; onExit: () => void; onMore: () => void; onCoach: () => void; onMetrics: () => void }) {
  const { space } = useTheme();
  const s = session.state;
  const time = clockText(Math.max(0, (now - s.startedAt) / 1000));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.gutter, paddingVertical: space.sm, gap: space.sm }}>
      <IconButton icon="xmark" onPress={onExit} accessibilityLabel="Salir" testID="live-exit" />
      <Pressable style={{ flex: 1, alignItems: "center" }} onPress={onMetrics} accessibilityHint="Muestra el pulso y la energía">
        <Text variant="label" numberOfLines={1}>
          {s.name.toUpperCase()}
        </Text>
        <Text variant="meta" color="textSecondary" numberOfLines={1} testID="live-subtitle">
          {`${time} · ${L.setsDone(s)}/${L.setsTotal(s)} SERIES${heartRate != null ? ` · ♥ ${Math.round(heartRate)}` : ""}`}
        </Text>
      </Pressable>
      <IconButton icon="ellipsis" onPress={onMore} accessibilityLabel="Más" testID="live-more" />
    </View>
  );
}

/**
 * The bottom: «HECHO» for the set (or round) up next on this screen, with what it
 * logs and what comes after; on a cardio block its PAUSA/EMPEZAR and TERMINAR;
 * «Terminar sesión» once everything is done.
 */
function BottomBar({ session, now, onFinish, onLog }: { session: LiveSession; now: number; onFinish: () => void; onLog: (exerciseId: string) => void }) {
  const { space } = useTheme();
  const s = session.state;
  const block = L.blockOf(s, s.focus);
  const members = s.exercises.slice(block.start, block.end);
  const first = members[0];
  const doneDetail = (ex: L.LiveExercise, set: L.LiveSet) => {
    const unit = training.unit(ex.exerciseId);
    const range = L.repRange(ex, set);
    const reps = range ? range[1] : set.reps;
    const kg = snapKg(set.weightKg, unit);
    return kg > 0 ? `${number(shown(kg, unit))}×${reps}` : `${reps} REPS`;
  };
  const nextAfter = (index: number) => {
    const next = L.nextPending(s, index);
    return next != null ? s.exercises[next]?.name.toUpperCase() : null;
  };

  if (!first) return L.hasWork(s) ? <BigButton title="TERMINAR" detail="GUARDAR LA SESIÓN" onPress={onFinish} testID="live-finish" /> : null;

  // A cardio block not logged: its clock's controls.
  if (members.length === 1 && L.isCardio(first) && !first.cardioLog && !first.skipped) {
    const clock = s.cardioClock?.exerciseId === first.id ? s.cardioClock : null;
    const running = clock?.runningSince != null;
    const started = clock ? elapsed(clock, now) > 0 : false;
    return (
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button
          title={running ? "Pausa" : started ? "Seguir" : "Empezar"}
          icon={running ? "pause.fill" : "play.fill"}
          size="lg"
          variant={running ? "plain" : "accent"}
          onPress={() => (running ? session.pauseCardio() : session.startCardio(block.start))}
          style={{ flex: 1 }}
          testID="cardio-toggle"
        />
        <Button
          title="Terminar"
          icon="flag.checkered"
          size="lg"
          variant={running ? "accent" : "plain"}
          onPress={() => {
            if (running) session.pauseCardio();
            onLog(first.id);
          }}
          style={{ flex: 1.4 }}
          testID="cardio-finish"
        />
      </View>
    );
  }

  // A superset: the round up next.
  if (members.length > 1) {
    const r = L.currentRound(s, block);
    if (r != null) {
      const parts = members.filter((m) => !m.skipped && m.sets[r] && !L.isDone(m.sets[r]!)).map((m) => doneDetail(m, m.sets[r]!));
      const last = r + 1 >= L.rounds(s, block);
      const after = last ? nextAfter(block.start) : `RONDA ${r + 2}`;
      return <BigButton title="HECHO" detail={`RONDA ${r + 1} · ${parts.join(" · ")}${after ? `\nSIGUE: ${after}` : ""}`} onPress={() => session.toggleRound(block, r)} testID="live-done" />;
    }
  } else if (!L.isCardio(first) && !first.skipped) {
    const set = first.sets.findIndex((x) => !L.isDone(x));
    if (set >= 0) {
      const after = set + 1 < first.sets.length ? `SERIE ${set + 2}` : nextAfter(block.start);
      return <BigButton title="HECHO" detail={`SERIE ${set + 1} · ${doneDetail(first, first.sets[set]!)}${after ? `\nSIGUE: ${after}` : ""}`} onPress={() => session.toggle(block.start, set)} testID="live-done" />;
    }
  }

  // This screen is done: on to the next, or the end.
  const next = L.nextPending(s, block.start);
  if (next != null && !L.resting(s, now)) return <BigButton title="SIGUIENTE" detail={s.exercises[next]?.name.toUpperCase()} onPress={() => session.setFocus(next)} testID="live-next" />;
  if (L.allDone(s) && L.hasWork(s)) {
    const skipped = L.skippedNames(s);
    return <BigButton title="TERMINAR" detail={skipped.length ? `SALTADOS: ${list(skipped).toUpperCase()}` : "GUARDAR LA SESIÓN"} onPress={onFinish} testID="live-finish" />;
  }
  return null;
}
