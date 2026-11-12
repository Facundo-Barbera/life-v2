import type { TrainingSession } from "@/contract";
import { Image, Pressable, View } from "react-native";
import { useEngine } from "@/data/session";
import { useOperation } from "@/data/queries";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Ring } from "@/ui/Gauge";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { clockText, modalitySymbol } from "../cardio";
import type { LiveSession } from "../live/session";
import { blockOf, blocks, exerciseDone, hasDoneWork, isCardio, isDone, nextPending, target, type LiveExercise, type LiveState } from "../live/state";
import { EFFORT_BANDS, effortWord, restClock, repetitions } from "../text";
import { formatWeight, fromUnit, number, shown, snap, stepUp, type WeightUnit } from "../units";
import { training } from "../store";

// The pieces every live page shares (SwiftUI's ExercisePage/LiveSessionView
// helpers) in Tablero's language: panels, mono labels, rounded numbers, lime fills.

export const MUSCLES: Record<string, string> = {
  chest: "Pecho",
  front_delts: "Deltoides anterior",
  side_delts: "Deltoides lateral",
  rear_delts: "Deltoides posterior",
  traps: "Trapecio",
  upper_back: "Espalda alta",
  lats: "Dorsales",
  lower_back: "Lumbares",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebrazos",
  abs: "Abdominales",
  obliques: "Oblicuos",
  glutes: "Glúteos",
  quads: "Cuádriceps",
  hamstrings: "Isquiotibiales",
  adductors: "Aductores",
  abductors: "Abductores",
  calves: "Gemelos",
  neck: "Cuello",
};

/** The equipment's symbol (the engine's ExerciseDB stills are not ported). */
export function ExerciseThumb({ exerciseId, size = 56, cardio, modality }: { exerciseId: string; size?: number; cardio?: boolean; modality?: string | null }) {
  const { colors, radius } = useTheme();
  const box = { width: size, height: size, borderRadius: radius.md, borderCurve: "continuous" as const, backgroundColor: colors.surfaceRaised, alignItems: "center" as const, justifyContent: "center" as const, overflow: "hidden" as const };
  void exerciseId;
  return (
    <View style={box}>
      <Icon name={(cardio ? modalitySymbol(modality) : "dumbbell.fill") as SFSymbol} size={size * 0.42} color={cardio ? "energy" : "textSecondary"} />
    </View>
  );
}

/** "3 × 8–10 REPS · DESCANSO 1:30"; without the rest in a superset, which rests after the round. */
export function headerTarget(ex: LiveExercise, withRest: boolean) {
  const reps = ex.repMin < ex.repMax ? `${ex.repMin}–${ex.repMax}` : `${ex.repMax}`;
  const t = `${ex.sets.length} × ${reps} REPS`;
  return withRest && ex.restSeconds > 0 ? `${t} · DESCANSO ${restClock(ex.restSeconds)}` : t;
}

/** The exercise up top: its still, name, main muscle and target; tapping opens its guide. */
export function ExerciseHeader({ exercise, withRest, onInfo }: { exercise: LiveExercise; withRest: boolean; onInfo: () => void }) {
  const { space } = useTheme();
  const detail = useOperation("get_exercise", { exerciseId: exercise.exerciseId }, { staleTime: 24 * 60 * 60_000 });
  const muscle = detail.data?.primaryMuscles[0];
  return (
    <Pressable onPress={onInfo} accessibilityHint="Abre la guía y los objetivos de hoy" style={{ flexDirection: "row", gap: space.md, alignItems: "center", opacity: exercise.skipped ? 0.55 : 1 }}>
      <ExerciseThumb exerciseId={exercise.exerciseId} size={60} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="title" numberOfLines={2} style={exercise.skipped ? { textDecorationLine: "line-through" } : undefined}>
          {exercise.name}
        </Text>
        <Text variant="meta" color="textSecondary" numberOfLines={1}>
          {[muscle ? MUSCLES[muscle]?.toUpperCase() : null, headerTarget(exercise, withRest)].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Icon name="info.circle" size={18} color="textTertiary" />
    </Pressable>
  );
}

/** «Saltado hoy» with «Retomar»: a skipped exercise must not look like one waiting. */
export function SkippedBanner({ onResume }: { onResume: () => void }) {
  const { space } = useTheme();
  return (
    <Panel style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Icon name="forward.fill" color="warning" />
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">Saltado hoy</Text>
        <Text variant="footnote" color="textSecondary">
          No cuenta en la sesión.
        </Text>
      </View>
      <Button title="Retomar" icon="arrow.uturn.backward" variant="accent" onPress={onResume} />
    </Panel>
  );
}

/** «Series −/+», «Registrar las N que faltan», then quiet links. */
export function PageActions({ noun, count, canRemove, onAdd, onRemove, logAll, onLogAll, links }: { noun: string; count: number; canRemove: boolean; onAdd: () => void; onRemove: () => void; logAll?: number | null; onLogAll?: () => void; links: { title: string; icon: SFSymbol; onPress: () => void }[] }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      <Panel style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm }}>
        <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
          {noun.toUpperCase()}
        </Text>
        <RoundStep icon="minus" onPress={onRemove} disabled={!canRemove} label="Quitar una" />
        <Text variant="stat" style={{ minWidth: 28, textAlign: "center" }}>
          {count}
        </Text>
        <RoundStep icon="plus" onPress={onAdd} label="Añadir una" />
      </Panel>
      {logAll ? <Button title={`Registrar las ${logAll} que faltan`} icon="checkmark.circle" wide onPress={onLogAll} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" }}>
        {links.map((l) => (
          <Button key={l.title} title={l.title} icon={l.icon} onPress={l.onPress} />
        ))}
      </View>
    </View>
  );
}

function RoundStep({ icon, onPress, disabled, label }: { icon: SFSymbol; onPress: () => void; disabled?: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={disabled} feedback="select" accessibilityLabel={label} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={16} weight="bold" />
    </PressableScale>
  );
}

/** «Siguiente» at the end of a page: the next screen's still, names and target. */
export function NextCard({ session, after }: { session: LiveSession; after: number }) {
  const { space } = useTheme();
  const s = session.state;
  const next = nextPending(s, after);
  if (next == null) return null;
  const block = blockOf(s, next);
  const exercises = s.exercises.slice(block.start, block.end);
  const first = exercises[0];
  if (!first) return null;
  const rounds = Math.max(...exercises.map((x) => x.sets.length));
  const detail = exercises.length > 1 ? `Superserie · ${rounds} ${rounds === 1 ? "ronda" : "rondas"}` : target(first, training.unit(first.exerciseId));
  return (
    <PressableScale onPress={() => session.setFocus(next)} accessibilityLabel={`Siguiente: ${exercises.map((x) => x.name).join(" y ")}`}>
      <Panel style={{ gap: space.sm }}>
        <PanelHeader title="SIGUIENTE" accent />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <ExerciseThumb exerciseId={first.exerciseId} size={44} cardio={isCardio(first)} modality={first.modality} />
          <View style={{ flex: 1 }}>
            <Text variant="rowTitle" numberOfLines={2}>
              {exercises.map((x) => x.name).join(" + ")}
            </Text>
            <Text variant="footnote" color="textSecondary" numberOfLines={1}>
              {detail}
            </Text>
          </View>
          <Icon name="chevron.right" color="textTertiary" />
        </View>
      </Panel>
    </PressableScale>
  );
}

/** «¿Cuánto te ha costado?» with Apple's 1–10 effort bar. Optional. */
export function EffortCard({ name, value, onChange }: { name?: string; value: number | null; onChange: (v: number | null) => void }) {
  const { colors, space } = useTheme();
  const color = (level: number) => `hsl(${Math.round(120 * (1 - (level - 1) / 9))}, 78%, 52%)`;
  return (
    <Panel style={{ gap: space.md }}>
      <PanelHeader title={name ? `ESFUERZO · ${name.toUpperCase()}` : "¿CUÁNTO TE HA COSTADO?"} trailing={value != null ? <Button title="Quitar" onPress={() => onChange(null)} /> : undefined} />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <Text variant={value == null ? "headline" : "hero"} style={value != null ? { color: color(value) } : undefined} color={value == null ? "textSecondary" : undefined}>
          {value == null ? "Toca un nivel" : effortWord(value)}
        </Text>
        {value != null ? (
          <Text variant="meta" color="textSecondary">
            {value} DE 10
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((level) => (
          <PressableScale key={level} feedback="select" onPress={() => onChange(level)} style={{ flex: 1 }} accessibilityLabel={`Esfuerzo ${level}`}>
            <View style={{ height: level === value ? 44 : 36, borderRadius: 6, backgroundColor: value != null && level <= value ? color(level) : colors.surfaceRaised }} />
          </PressableScale>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {EFFORT_BANDS.map((b) => (
          <Text key={b.word} variant="labelSmall" color="textTertiary" style={{ flex: b.span, textAlign: "center" }} numberOfLines={1}>
            {b.word.toUpperCase()}
          </Text>
        ))}
      </View>
    </Panel>
  );
}

/** «Mejor marca»: the heaviest load on this exercise and the next goal, in its unit. Hidden without history. */
export function BestCard({ exercise, sessions, unit }: { exercise: LiveExercise; sessions: TrainingSession[]; unit: WeightUnit }) {
  const { space } = useTheme();
  const sets = sessions.flatMap((s) => s.sets).filter((x) => x.exerciseId === exercise.exerciseId && x.weightKg > 0 && x.reps > 0);
  if (!sets.length) return null;
  const best = sets.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
  const goal = exercise.hint && !exerciseDone(exercise) ? exercise.hint : `Siguiente meta: ${formatWeight(fromUnit(stepUp(snap(best.weightKg, unit), unit), unit), unit)}`;
  return (
    <Panel style={{ gap: space.xs }}>
      <PanelHeader title="MEJOR MARCA" />
      <Text variant="stat">
        {number(shown(best.weightKg, unit))}
        <Text variant="labelSmall" color="textSecondary">{` ${unit.toUpperCase()} · CON ${repetitions(best.reps).toUpperCase()}`}</Text>
      </Text>
      <Text variant="footnote" color="textSecondary">
        {goal}
      </Text>
    </Panel>
  );
}

/** One capsule per screen filling as its sets are done; a superset is one, thicker; a skipped one hollow. Tap to jump. */
export function SessionStrip({ state, onSelect }: { state: LiveState; onSelect: (index: number) => void }) {
  const { colors, space } = useTheme();
  const onScreen = blockOf(state, state.focus);
  return (
    <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: space.gutter }}>
      {blocks(state).map((block) => {
        const exercises = state.exercises.slice(block.start, block.end);
        const current = block.start === onScreen.start;
        const superset = exercises.length > 1;
        const total = exercises.reduce((n, x) => n + x.sets.length, 0);
        const fraction =
          exercises.length === 1 && isCardio(exercises[0]!)
            ? exercises[0]!.cardioLog
              ? 1
              : 0
            : total
              ? exercises.reduce((n, x) => n + x.sets.filter(isDone).length, 0) / total
              : exercises.every(exerciseDone)
                ? 1
                : 0;
        const skipped = exercises.every((x) => x.skipped && !hasDoneWork(x));
        const height = (current ? 6 : 4) + (superset ? 3 : 0);
        return (
          <Pressable key={exercises[0]!.id} onPress={() => onSelect(block.start)} style={{ flex: 1, height: 16, justifyContent: "center" }} accessibilityLabel={exercises.map((x) => x.name).join(" y ")}>
            {skipped ? (
              <View style={{ height: 8, borderRadius: 4, borderWidth: 1, borderStyle: "dashed", borderColor: colors.textTertiary }} />
            ) : (
              <View style={{ height, borderRadius: height / 2, overflow: "hidden", backgroundColor: current ? colors.surfaceRaised : colors.separator }}>
                <View style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", backgroundColor: superset ? colors.carbs : colors.accent }} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Resting: the draining ring with the countdown, −15, +15 and «SALTAR»; tap the ring to set this exercise's rest. */
export function RestPanel({ session, now, onPick }: { session: LiveSession; now: number; onPick: () => void }) {
  const { space } = useTheme();
  const { restStartedAt: start, restEndsAt: end } = session.state;
  if (start == null || end == null || end <= now) return null;
  const remaining = Math.ceil((end - now) / 1000);
  const total = Math.max(1, Math.round((end - start) / 1000));
  return (
    <Panel style={{ flexDirection: "row", alignItems: "center", gap: space.md }} testID="rest-panel">
      <Pressable onPress={onPick} accessibilityLabel="Descanso" accessibilityHint="Cambia el descanso de este ejercicio">
        <Ring progress={remaining / total} size={84} stroke={8} transition="timing">
          <Text variant="number" testID="rest-remaining">
            {clockText(remaining)}
          </Text>
          <Text variant="labelSmall" color="textSecondary">
            DE {clockText(total)}
          </Text>
        </Ring>
      </Pressable>
      <View style={{ flex: 1, gap: space.sm }}>
        <Text variant="label" color="textSecondary">
          DESCANSO
        </Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title="−15" onPress={() => session.extendRest(-15)} accessibilityLabel="Quitar 15 segundos" style={{ flex: 1, paddingHorizontal: 0 }} />
          <Button title="+15" onPress={() => session.extendRest(15)} accessibilityLabel="Añadir 15 segundos" style={{ flex: 1, paddingHorizontal: 0 }} />
          <Button title="Saltar" onPress={() => session.skipRest()} testID="rest-skip" style={{ flex: 1.6 }} />
        </View>
      </View>
    </Panel>
  );
}
