import type { ExerciseChange, LoadSuggestion, ProgramDay, ProgramExercise } from "@/contract";
import { Fragment } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Icon } from "@/ui/Icon";
import { Hairline } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { StatCell } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { training } from "../store";
import { labels } from "../superset";
import { cardioSummary, restClock } from "../text";
import { number, shown } from "../units";
import { ExerciseThumb } from "./parts";

// A program day as a plan to read before starting it (Entreno's hero and the
// day screen): its counts and length, then each exercise with sets × reps and
// the load it starts at, supersets bracketed together, the Coach's changes marked.

const WORK_SECONDS = 45;

/** Sets × (rest + work), rounded to 5 minutes, never under 10 (SwiftUI's TrainingPlan.minutes). */
export function dayMinutes(day: ProgramDay): number {
  const seconds = day.exercises.reduce((n, e) => n + e.sets * (e.restSeconds + WORK_SECONDS), 0);
  return Math.max(10, Math.round(seconds / 60 / 5) * 5);
}

export const daySets = (day: ProgramDay) => day.exercises.reduce((n, e) => n + (e.kind === "cardio" ? 0 : e.sets), 0);

/** EJERCICIOS · SERIES · MIN, three bare figures side by side. */
export function DayFigures({ day }: { day: ProgramDay }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <StatCell bare label="Ejercicios" value={day.exercises.length} style={{ flex: 1 }} />
      <StatCell bare label="Series" value={daySets(day)} style={{ flex: 1 }} />
      <StatCell bare label="Duración" value={`~${dayMinutes(day)}`} unit="min" style={{ flex: 1 }} />
    </View>
  );
}

/** «3 × 8–10» */
const setsReps = (e: ProgramExercise) => `${e.sets} × ${e.repMin < e.repMax ? `${e.repMin}–${e.repMax}` : e.repMax}`;

/** What the Coach did to one exercise, as a short mark: «▼ 10 %», «CAMBIADO», «NUEVO». */
function changeMark(c: ExerciseChange | undefined): { text: string; tone: "warning" | "accentText" } | null {
  if (!c) return null;
  if (c.action === "swap") return { text: "CAMBIADO", tone: "warning" };
  if (c.action === "add") return { text: "NUEVO", tone: "accentText" };
  if (c.loadPercent) return { text: `${c.loadPercent < 0 ? "▼" : "▲"} ${Math.abs(c.loadPercent)} %`, tone: "warning" };
  if (c.reps != null || c.sets != null) return { text: "AJUSTADO", tone: "warning" };
  return null;
}

type Props = {
  day: ProgramDay;
  suggestions: Record<string, LoadSuggestion>;
  /** The Coach's changes for today (an adjustment that applies). */
  changes?: ExerciseChange[];
  /** The day screen: thumbnails and the suggestion's reason under each. */
  detailed?: boolean;
  onPress?: (e: ProgramExercise) => void;
};

/** The day's exercises in order, numbered; a superset's members share a lime bracket. */
export function DayExercises({ day, suggestions, changes = [], detailed, onPress }: Props) {
  const { colors } = useTheme();
  const ids = day.exercises.map((e) => e.supersetId);
  const names = labels(ids);
  // Runs of consecutive exercises: a superset, or a single exercise.
  const runs: { id: string | null; items: { e: ProgramExercise; i: number }[] }[] = [];
  day.exercises.forEach((e, i) => {
    const last = runs.at(-1);
    if (e.supersetId && last?.id === e.supersetId) last.items.push({ e, i });
    else runs.push({ id: e.supersetId, items: [{ e, i }] });
  });
  return (
    <View>
      {runs.map((run, r) => (
        <Fragment key={run.items[0]!.e.id}>
          {r ? <Hairline /> : null}
          {run.id && run.items.length > 1 ? (
            <View style={{ paddingTop: 10 }}>
              <Text variant="labelSmall" color="accentText" style={{ marginBottom: 2 }}>
                Superserie {names.get(run.id)} · alternadas
              </Text>
              <View>
                <View style={{ position: "absolute", left: -9, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: colors.accentText }} />
                <View>
                  {run.items.map(({ e, i }, k) => (
                    <Fragment key={e.id}>
                      {k ? <Hairline /> : null}
                      <Row e={e} index={i} suggestion={suggestions[e.id]} change={changes.find((c) => c.programExerciseId === e.id)} detailed={detailed} onPress={onPress} />
                    </Fragment>
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <Row e={run.items[0]!.e} index={run.items[0]!.i} suggestion={suggestions[run.items[0]!.e.id]} change={changes.find((c) => c.programExerciseId === run.items[0]!.e.id)} detailed={detailed} onPress={onPress} />
          )}
        </Fragment>
      ))}
    </View>
  );
}

function Row({ e, index, suggestion, change, detailed, onPress }: { e: ProgramExercise; index: number; suggestion?: LoadSuggestion; change?: ExerciseChange; detailed?: boolean; onPress?: (e: ProgramExercise) => void }) {
  const { space } = useTheme();
  const cardio = e.kind === "cardio";
  const kg = e.weightKg ?? suggestion?.weightKg ?? null;
  const unit = training.unit(e.exerciseId);
  const mark = changeMark(change);
  const meta = cardio ? cardioSummary(e.cardio) : [setsReps(e), e.restSeconds ? `desc ${restClock(e.restSeconds)}` : null].filter(Boolean).join(" · ");
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: detailed ? 10 : 9, minHeight: 52 }}>
      {detailed ? (
        <ExerciseThumb exerciseId={e.exerciseId} size={48} cardio={cardio} modality={e.modality} />
      ) : (
        <Text variant="meta" color="textTertiary" style={{ width: 20 }}>
          {String(index + 1).padStart(2, "0")}
        </Text>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="rowTitle" numberOfLines={2}>
          {e.exerciseName}
        </Text>
        <Text variant="meta" color="textSecondary" style={{ marginTop: 3 }} numberOfLines={1}>
          {meta}
        </Text>
        {detailed && suggestion?.reason ? (
          <Text variant="footnote" color="textSecondary" style={{ marginTop: 4 }} numberOfLines={3}>
            {suggestion.reason}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", minWidth: 56 }}>
        {cardio ? (
          <Icon name="heart.fill" size={14} color="energy" />
        ) : kg ? (
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text variant="numberSmall">{number(shown(kg, unit))}</Text>
            <Text variant="labelSmall" color="textSecondary" style={{ marginLeft: 2, textTransform: "none" }}>
              {unit}
            </Text>
          </View>
        ) : (
          <Text variant="numberSmall" color="textTertiary">
            —
          </Text>
        )}
        {mark ? (
          <Text variant="delta" color={mark.tone} style={{ marginTop: 3 }}>
            {mark.text}
          </Text>
        ) : null}
      </View>
      {onPress ? <Icon name="chevron.right" size={12} color="textTertiary" /> : null}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={() => onPress(e)} feedback="select" accessibilityLabel={`${e.exerciseName}, ${meta}`}>
      {body}
    </PressableScale>
  ) : (
    body
  );
}
