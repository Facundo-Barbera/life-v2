import type { CardioLog, HrZoneRange, SetLog, TrainingSession } from "@/contract";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import type { WatchMetrics } from "pulso-watch";
import { useTheme, zoneColor } from "@/theme";
import { Button } from "@/ui/Button";
import { NeedleGauge, Ring } from "@/ui/Gauge";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { Sheet } from "@/ui/Sheet";
import { StatCell } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { clockText, elapsed, isRunning, modalityLabel, modalitySymbol, phaseAt, phases, totalSeconds, zoneText } from "../cardio";
import { dropOffer, type Segment } from "../drops";
import type { LiveSession } from "../live/session";
import { canRemoveRound, currentRound, cutShortAmount, effort, exerciseDone, hasDoneWork, isDone, removableSets, rounds, supersetOf, type LiveExercise, type LiveSet } from "../live/state";
import { HK } from "../live/sync";
import { training } from "../store";
import { cardioSummary, pace } from "../text";
import { number } from "../units";
import { DropPrompt, SetRow } from "./sets";
import { BestCard, EffortCard, ExerciseHeader, NextCard, PageActions, SkippedBanner } from "./parts";

// One page per screen of the live session (SwiftUI's ExercisePage,
// SupersetPage and CardioPage). A page is named by its first exercise's id and
// resolves its indices from the session on every render, so a list that shrank
// (a removal, the Coach) is never indexed by a stale position.

const guide = (exerciseId: string) => router.push(`/entreno/ejercicio/${exerciseId}` as Href);

/** Last time's sets of an exercise, from the recent sessions. */
export function lastSets(exerciseId: string, sessions: TrainingSession[]): SetLog[] {
  const latest = sessions.filter((s) => s.sets.some((x) => x.exerciseId === exerciseId)).sort((a, b) => b.startedAt - a.startedAt)[0];
  return latest ? latest.sets.filter((x) => x.exerciseId === exerciseId).sort((a, b) => a.setIndex - b.setIndex) : [];
}

type Offer = { setId: string; drop: Segment };

/** A drop offer that leaves by itself after a few seconds. */
function useOffer() {
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    if (!offer) return;
    const t = setTimeout(() => setOffer(null), 6000);
    return () => clearTimeout(t);
  }, [offer]);
  return [offer, setOffer] as const;
}

// ── One strength exercise ────────────────────────────────────────────────────

export function ExercisePage({ session, id, onSwap }: { session: LiveSession; id: string; onSwap: (index: number) => void }) {
  const { space } = useTheme();
  const [opened, setOpened] = useState<string | null>(null);
  const [offer, setOffer] = useOffer();
  const index = session.state.exercises.findIndex((x) => x.id === id);
  const exercise = session.state.exercises[index];
  if (!exercise) return null;
  const unit = training.unit(exercise.exerciseId);
  const last = lastSets(exercise.exerciseId, training.sessions);
  const current = exercise.skipped ? -1 : exercise.sets.findIndex((x) => !isDone(x));
  const left = exercise.sets.filter((x) => !isDone(x)).length;
  const offerFor = (set: LiveSet) => {
    const drop = dropOffer(set, exercise.repMin, unit);
    setOffer(drop ? { setId: set.id, drop } : null);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.md, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
      <ExerciseHeader exercise={exercise} withRest onInfo={() => guide(exercise.exerciseId)} />
      {exercise.skipped ? <SkippedBanner onResume={() => session.setSkipped(index, false)} /> : null}
      <View style={{ gap: space.sm }}>
        {exercise.sets.map((set, s) => (
          <View key={set.id} style={{ gap: space.xs }}>
            <SetRow
              testID={`set-${s}`}
              session={session}
              e={index}
              exercise={exercise}
              set={set}
              s={s}
              previous={last[s] ?? null}
              unit={unit}
              open={opened === set.id || (opened == null && s === current)}
              onOpen={() => setOpened(set.id)}
              onToggled={(after) => {
                setOpened(null);
                offerFor(after);
              }}
            />
            {offer?.setId === set.id && isDone(set) && !set.drops.length ? (
              <DropPrompt
                drop={offer.drop}
                unit={unit}
                onAccept={() => {
                  session.addDrop(index, s, offer.drop);
                  setOffer(null);
                }}
              />
            ) : null}
          </View>
        ))}
      </View>
      {exerciseDone(exercise) && hasDoneWork(exercise) ? <EffortCard value={effort(exercise)} onChange={(v) => session.setEffort(index, v)} /> : null}
      <PageActions
        noun="Series"
        count={exercise.sets.length}
        canRemove={removableSets(session.state, index) > 0}
        onAdd={() => session.addSet(index)}
        onRemove={() => session.removeLastSet(index)}
        logAll={left > 1 && !exercise.skipped ? left : null}
        onLogAll={() => session.completeAll(index)}
        links={[{ title: "Cambiar ejercicio", icon: "arrow.triangle.2.circlepath", onPress: () => onSwap(index) }]}
      />
      <BestCard exercise={exercise} sessions={training.sessions} unit={unit} />
      <NextCard session={session} after={index} />
    </ScrollView>
  );
}

// ── A superset ───────────────────────────────────────────────────────────────

/** A superset on one screen: each exercise's header, then every round as one panel with a set of each; «HECHO» logs the round. */
export function SupersetPage({ session, id, onSwap }: { session: LiveSession; id: string; onSwap: (index: number) => void }) {
  const { colors, space, radius, hairline } = useTheme();
  const [opened, setOpened] = useState<number | null>(null);
  const [offer, setOffer] = useOffer();
  const s = session.state;
  const start = s.exercises.findIndex((x) => x.id === id);
  const group = supersetOf(s, start);
  if (start < 0 || !group) return null;
  const members = s.exercises.slice(group.start, group.end).map((exercise, i) => ({ exercise, e: group.start + i }));
  const current = currentRound(s, group);
  const roundsCount = rounds(s, group);
  const skipped = members.every((m) => m.exercise.skipped);
  /** The members with a set in round `r`: a skipped one only for what it already logged. */
  const inRound = (r: number) => members.filter(({ exercise }) => { const set = exercise.sets[r]; return !!set && (!exercise.skipped || isDone(set)); });
  return (
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.md, paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: space.sm }}>
        {members.map(({ exercise, e }, i) => (
          <View key={exercise.id} style={{ gap: space.sm }}>
            {i > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingLeft: space.sm }}>
                <Icon name="link" size={12} color="carbs" />
                <Text variant="labelSmall" color="carbs">
                  SUPERSERIE
                </Text>
              </View>
            ) : null}
            <ExerciseHeader exercise={exercise} withRest={false} onInfo={() => guide(exercise.exerciseId)} />
          </View>
        ))}
      </View>
      {skipped ? <SkippedBanner onResume={() => members.forEach((m) => session.setSkipped(m.e, false))} /> : null}
      {Array.from({ length: roundsCount }, (_, r) => {
        const rows = inRound(r);
        if (!rows.length) return null;
        const done = rows.every(({ exercise }) => isDone(exercise.sets[r]!));
        const isCurrent = r === current;
        const open = opened === r || (opened == null && isCurrent);
        return (
          <View
            key={r}
            testID={`round-${r}`}
            style={{
              backgroundColor: open && !done ? colors.surfaceRaised : colors.surface,
              borderRadius: radius.lg,
              borderCurve: "continuous",
              borderWidth: open && !done ? 1.5 : hairline,
              borderColor: open && !done ? colors.accentText : colors.separator,
              padding: space.md,
              gap: space.md,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text variant="label" color={isCurrent && !done ? "accentText" : "textSecondary"} style={{ flex: 1 }}>
                RONDA {r + 1}
              </Text>
              <RoundCheck
                done={done}
                onPress={() => {
                  session.toggleRound(group, r);
                  setOpened(null);
                }}
                testID={`round-${r}-check`}
              />
            </View>
            {rows.map(({ exercise, e }) => {
              const set = exercise.sets[r]!;
              const unit = training.unit(exercise.exerciseId);
              return (
                <View key={set.id} style={{ gap: space.xs }}>
                  <SetRow
                    session={session}
                    e={e}
                    exercise={exercise}
                    set={set}
                    s={r}
                    previous={lastSets(exercise.exerciseId, training.sessions)[r] ?? null}
                    unit={unit}
                    open={open}
                    onOpen={() => setOpened(r)}
                    name={exercise.name}
                    onInfo={() => guide(exercise.exerciseId)}
                  />
                  {offer?.setId === set.id && !set.drops.length ? (
                    <DropPrompt drop={offer.drop} unit={unit} onAccept={() => (session.addDrop(e, r, offer.drop), setOffer(null))} />
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
      {members.map(({ exercise, e }) =>
        exerciseDone(exercise) && hasDoneWork(exercise) ? <EffortCard key={exercise.id} name={exercise.name} value={effort(exercise)} onChange={(v) => session.setEffort(e, v)} /> : null,
      )}
      <PageActions
        noun="Rondas"
        count={roundsCount}
        canRemove={canRemoveRound(s, group)}
        onAdd={() => session.addRound(group)}
        onRemove={() => session.removeRound(group)}
        links={[
          ...members.map(({ exercise, e }) => ({ title: `Cambiar ${exercise.name}`, icon: "arrow.triangle.2.circlepath" as SFSymbol, onPress: () => onSwap(e) })),
          { title: "Separar", icon: "link.badge.plus", onPress: () => session.splitSuperset(group) },
        ]}
      />
      <NextCard session={session} after={group.start} />
    </ScrollView>
  );
}

function RoundCheck({ done, onPress, testID }: { done: boolean; onPress: () => void; testID?: string }) {
  return <Button title={done ? "Hecha" : "Marcar"} icon="checkmark" variant={done ? "accent" : "plain"} onPress={onPress} testID={testID} accessibilityLabel={done ? "Desmarcar la ronda" : "Marcar la ronda"} />;
}

// ── A cardio block ───────────────────────────────────────────────────────────

/** The live numbers of whatever records: the Watch, or this iPhone. */
export function useRecorderMetrics(): { metrics: WatchMetrics | null; fromPhone: boolean } {
  const link = training.link;
  const [, bump] = useState(0);
  useEffect(() => link?.subscribe(() => bump((n) => n + 1)), [link]);
  return { metrics: link?.live ?? null, fromPhone: link?.recorder === "phone" };
}

/**
 * A cardio block, full screen: one ring with the time (the interval phase
 * counting down, else the time left or elapsed), the heart-rate needle in its
 * zones, then what the block asks for. The clock is the session's own: one
 * shared start instant, pauses banked, so the phone, the Watch and the lock
 * screen turn their seconds together.
 */
export function CardioPage({ session, id, now, onLog }: { session: LiveSession; id: string; now: number; onLog: (index: number) => void }) {
  const { space } = useTheme();
  const index = session.state.exercises.findIndex((x) => x.id === id);
  const exercise = session.state.exercises[index];
  const { metrics, fromPhone } = useRecorderMetrics();
  if (!exercise) return null;
  const zones = training.program?.hrZones ?? null;
  const clock = session.state.cardioClock?.exerciseId === exercise.id ? session.state.cardioClock : null;
  const seconds = clock ? elapsed(clock, now) : 0;
  return (
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.md, paddingBottom: space.xxxl }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
          <Icon name={modalitySymbol(exercise.modality) as SFSymbol} size={30} color="energy" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">{exercise.name}</Text>
          <Text variant="meta" color="textSecondary">
            {[modalityLabel(exercise.modality), exercise.cardio ? cardioSummary(exercise.cardio) : null].filter(Boolean).join(" · ").toUpperCase()}
          </Text>
        </View>
      </View>
      {exercise.cardioLog ? (
        <CardioDone exercise={exercise} onEdit={() => onLog(index)} />
      ) : (
        <>
          <CardioHero exercise={exercise} seconds={seconds} running={isRunning(clock)} zones={zones} />
          {metrics && metrics.stage.activity !== HK.traditionalStrengthTraining ? <HeartPanel metrics={metrics} zones={zones} target={exercise.cardio?.zone ?? undefined} fromPhone={fromPhone} /> : null}
        </>
      )}
      {exercise.cardio ? <CardioTargetPanel exercise={exercise} zones={zones} /> : null}
      {exercise.notes ? (
        <Text variant="footnote" color="textSecondary">
          {exercise.notes}
        </Text>
      ) : null}
      {!exercise.cardioLog ? <Button title={exercise.skipped ? "Retomar" : "Saltar bloque"} icon={exercise.skipped ? "arrow.uturn.backward" : "forward"} wide onPress={() => session.setSkipped(index, !exercise.skipped)} /> : null}
      <NextCard session={session} after={index} />
    </ScrollView>
  );
}

function CardioHero({ exercise, seconds, running, zones }: { exercise: LiveExercise; seconds: number; running: boolean; zones: HrZoneRange[] | null }) {
  const { colors } = useTheme();
  const phase = exercise.cardio?.intervals ? phaseAt(seconds, exercise.cardio.intervals) : null;
  const total = totalSeconds(exercise.cardio);
  const tint = phase ? (phase.work ? colors.energy : colors.body) : colors.accent;
  const fraction = phase ? Math.min(1, (seconds - phase.start) / Math.max(1, phase.length)) : total ? Math.min(1, seconds / total) : (seconds % 60) / 60;
  const big = phase ? clockText(Math.ceil(phase.end - seconds)) : total != null && total > seconds ? clockText(Math.ceil(total - seconds)) : clockText(seconds);
  const title = phase ? phase.label : total != null && total > seconds ? (seconds > 0 ? "QUEDAN" : "LISTO PARA EMPEZAR") : total != null ? "TIEMPO CUMPLIDO" : "TIEMPO";
  const caption = phase ? `RONDA ${phase.round} DE ${phase.rounds}` : total != null && seconds > 0 ? `${clockText(seconds)} HECHOS` : zoneText(exercise.cardio?.zone, zones);
  return (
    <View style={{ alignItems: "center", opacity: running || seconds === 0 ? 1 : 0.75 }}>
      <Ring progress={fraction} size={260} stroke={14} color={tint} transition="timing" testID="cardio-ring">
        <Text variant="label" style={{ color: phase ? tint : colors.accentText }}>
          {title.toUpperCase()}
        </Text>
        <Text variant="gauge" testID="cardio-clock">
          {big}
        </Text>
        {caption ? (
          <Text variant="meta" color="textSecondary">
            {caption}
          </Text>
        ) : null}
        <Text variant="labelSmall" color="textTertiary">
          {running ? "EN MARCHA" : seconds > 0 ? "EN PAUSA" : ""}
        </Text>
      </Ring>
    </View>
  );
}

/** The recording's heart rate as the needle in the person's zones, energy and distance. */
function HeartPanel({ metrics, zones, target, fromPhone }: { metrics: WatchMetrics; zones: HrZoneRange[] | null; target?: number; fromPhone: boolean }) {
  const { colors, space } = useTheme();
  const bpm = metrics.heartRate != null ? Math.round(metrics.heartRate) : null;
  const zone = bpm != null ? zones?.find((z) => bpm >= z.minBpm && bpm <= z.maxBpm)?.zone : undefined;
  const sorted = [...(zones ?? [])].sort((a, b) => a.zone - b.zone).map((z) => ({ min: z.minBpm, max: z.maxBpm }));
  return (
    <Panel style={{ gap: space.sm }}>
      <PanelHeader title="FRECUENCIA" trailing={<Text variant="labelSmall" color="textTertiary">{fromPhone ? "IPHONE" : "APPLE WATCH"}</Text>} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        {sorted.length === 5 ? <NeedleGauge bpm={bpm} zones={sorted} target={target} width={150} /> : null}
        <View style={{ flex: 1 }}>
          <Text variant="hero" style={{ color: zone ? zoneColor(colors, zone) : colors.heart }}>
            {bpm ?? "--"}
          </Text>
          <Text variant="labelSmall" color="textSecondary">
            {zone ? `LPM · ZONA ${zone}${zone === target ? " · EN ZONA" : ""}` : "LPM"}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <StatCell label="KCAL" value={Math.round(metrics.activeKcal)} size="numberSmall" style={{ flex: 1 }} />
        {metrics.distanceMeters ? <StatCell label="DISTANCIA" value={number(metrics.distanceMeters / 1000)} unit="km" size="numberSmall" style={{ flex: 1 }} /> : null}
      </View>
    </Panel>
  );
}

function CardioTargetPanel({ exercise, zones }: { exercise: LiveExercise; zones: HrZoneRange[] | null }) {
  const { colors, space } = useTheme();
  const t = exercise.cardio!;
  const cells: { label: string; value: string; unit?: string }[] = [];
  if (t.durationMinutes != null) cells.push({ label: "DURACIÓN", value: number(t.durationMinutes), unit: "min" });
  if (t.distanceKm != null) cells.push({ label: "DISTANCIA", value: number(t.distanceKm), unit: "km" });
  if (t.speedKmh != null) cells.push({ label: "VELOCIDAD", value: number(t.speedKmh), unit: "km/h" });
  if (t.paceMinPerKm != null) cells.push({ label: "RITMO", value: pace(t.paceMinPerKm), unit: "/km" });
  if (t.inclinePercent != null) cells.push({ label: "INCLINACIÓN", value: number(t.inclinePercent), unit: "%" });
  if (t.level != null) cells.push({ label: "NIVEL", value: number(t.level) });
  const zone = zoneText(t.zone, zones);
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {cells.map((c) => (
          <StatCell key={c.label} label={c.label} value={c.value} unit={c.unit} style={{ flexBasis: "47%", flexGrow: 1 }} />
        ))}
      </View>
      {zone ? (
        <Text variant="meta" color="textSecondary">
          OBJETIVO · {zone.toUpperCase()}
        </Text>
      ) : null}
      {t.intervals ? (
        <Panel style={{ gap: space.sm }}>
          <PanelHeader title={`INTERVALOS · ${t.intervals.rounds} RONDAS`} />
          <View style={{ flexDirection: "row", gap: 2, alignItems: "center", height: 16 }}>
            {phases(t.intervals).map((p) => (
              <View key={p.index} style={{ flex: p.length, height: p.work ? 14 : 8, borderRadius: 3, backgroundColor: p.work ? colors.energy : colors.body }} />
            ))}
          </View>
        </Panel>
      ) : null}
    </View>
  );
}

function CardioDone({ exercise, onEdit }: { exercise: LiveExercise; onEdit: () => void }) {
  const { space } = useTheme();
  const log = exercise.cardioLog!;
  const amount = cutShortAmount(exercise);
  return (
    <Panel style={{ gap: space.md }}>
      <PanelHeader title="BLOQUE HECHO" accent />
      {exercise.cutShort ? (
        <View>
          <Text variant="rowTitle" color="energy">
            {["Terminado antes", amount].filter(Boolean).join(" · ")}
          </Text>
          {exercise.cutShort.reason ? (
            <Text variant="footnote" color="textSecondary">
              {exercise.cutShort.reason}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <StatCell label="TIEMPO" value={clockText(log.durationSeconds)} style={{ flexBasis: "47%", flexGrow: 1 }} />
        {log.distanceKm != null ? <StatCell label="DISTANCIA" value={number(log.distanceKm)} unit="km" style={{ flexBasis: "47%", flexGrow: 1 }} /> : null}
        {log.avgHr != null ? <StatCell label="FC MEDIA" value={Math.round(log.avgHr)} unit="ppm" style={{ flexBasis: "47%", flexGrow: 1 }} /> : null}
        {log.kcal != null ? <StatCell label="ENERGÍA" value={Math.round(log.kcal)} unit="kcal" style={{ flexBasis: "47%", flexGrow: 1 }} /> : null}
      </View>
      <Button title="Editar registro" icon="pencil" onPress={onEdit} />
    </Panel>
  );
}

/** Ending a block: the time from the stopwatch, and what the machine showed. Only the duration is needed. */
export function CardioLogSheet({ exercise, seconds, visible, onClose, onSave }: { exercise: LiveExercise | null; seconds: number; visible: boolean; onClose: () => void; onSave: (log: CardioLog) => void }) {
  const { colors, space, radius, type } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [prefill, setPrefill] = useState<{ minutes: string; seconds: number } | null>(null);
  useEffect(() => {
    if (!visible || !exercise) return;
    const log = exercise.cardioLog;
    const fmt = (v: number | null | undefined) => (v != null ? number(v) : "");
    const exact = log?.durationSeconds ?? seconds;
    const minutes = number(Math.round((exact / 60) * 10) / 10);
    setPrefill({ minutes, seconds: exact });
    setValues({
      minutes,
      distance: fmt(log?.distanceKm),
      level: fmt(log?.level ?? exercise.cardio?.level),
      incline: fmt(log?.inclinePercent ?? exercise.cardio?.inclinePercent),
      avgHr: fmt(log?.avgHr),
      kcal: fmt(log?.kcal),
    });
  }, [visible, exercise, seconds]);
  if (!exercise) return null;
  const modality = exercise.modality ?? "";
  const fields: { key: string; label: string; unit: string; show: boolean }[] = [
    { key: "minutes", label: "Duración", unit: "min", show: true },
    { key: "distance", label: "Distancia", unit: "km", show: !["stairs", "jump_rope", "hiit"].includes(modality) },
    { key: "level", label: "Nivel", unit: "", show: ["elliptical", "bike", "stairs", "rower"].includes(modality) || exercise.cardio?.level != null },
    { key: "incline", label: "Inclinación", unit: "%", show: ["treadmill", "walk"].includes(modality) || exercise.cardio?.inclinePercent != null },
    { key: "avgHr", label: "FC media", unit: "ppm", show: true },
    { key: "kcal", label: "Energía", unit: "kcal", show: true },
  ];
  const read = (key: string) => {
    const v = Number((values[key] ?? "").replace(",", "."));
    return values[key]?.trim() && Number.isFinite(v) && v >= 0 ? v : null;
  };
  const minutes = read("minutes") ?? 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={exercise.name.toUpperCase()}>
      <View style={{ gap: space.sm }}>
        {fields
          .filter((f) => f.show)
          .map((f) => (
            <View key={f.key} style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingHorizontal: space.md, height: 52 }}>
              <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
                {f.label}
              </Text>
              <TextInput
                testID={`cardio-log-${f.key}`}
                value={values[f.key] ?? ""}
                onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
                style={[type.number, { color: colors.text, minWidth: 80, textAlign: "right" }]}
              />
              <Text variant="labelSmall" color="textSecondary" style={{ width: 34 }}>
                {f.unit.toUpperCase()}
              </Text>
            </View>
          ))}
        <Text variant="footnote" color="textSecondary">
          Lo que marcó la máquina. Solo la duración es necesaria.
        </Text>
        <Button
          title="Guardar"
          variant="accent"
          size="lg"
          wide
          disabled={minutes <= 0}
          testID="cardio-log-save"
          onPress={() => {
            onSave({
              exerciseId: exercise.exerciseId,
              // Untouched, the stopwatch's own seconds: not rounded to the tenth of a minute shown.
              durationSeconds: Math.round(prefill && values.minutes === prefill.minutes ? prefill.seconds : minutes * 60),
              distanceKm: read("distance"),
              level: read("level"),
              inclinePercent: read("incline"),
              avgHr: read("avgHr"),
              kcal: read("kcal"),
              doneAt: Date.now(),
            });
            onClose();
          }}
        />
      </View>
    </Sheet>
  );
}
