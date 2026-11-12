import type { CardioLog, PersonalRecord, SetLog } from "@/contract";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { StatCell } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { clockText } from "../cardio";
import { dropsShort } from "../drops";
import { training } from "../store";
import { formatTotal, formatWeight, type WeightUnit } from "../units";

// A finished session (SwiftUI's SessionSummaryView): what was done, by
// exercise in the order done, its records, and whether the Mac has it.

export type SummarySession = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  sets: SetLog[];
  cardio?: CardioLog[];
};

const volume = (sets: SetLog[]) => sets.reduce((n, s) => n + (s.segments?.length ? s.segments : [s]).reduce((m, x) => m + x.weightKg * x.reps, 0), 0);

const RECORD: Record<PersonalRecord["kind"], string> = { e1rm: "1RM estimado", weight: "Más peso", reps: "Más repeticiones" };

export function SessionSummaryView({
  session,
  names,
  prs = [],
  skipped = [],
  cutShort = [],
  status,
  onRetry,
}: {
  session: SummarySession;
  /** Library id → name, for the exercises' lines. */
  names: Record<string, string>;
  prs?: PersonalRecord[];
  skipped?: string[];
  cutShort?: string[];
  status?: { uploaded: boolean; failed: boolean; health: boolean };
  onRetry?: () => void;
}) {
  const { space } = useTheme();
  const unit: WeightUnit = training.settings.defaultUnit;
  const minutes = Math.max(0, Math.round((session.endedAt - session.startedAt) / 60_000));
  const byExercise: { exerciseId: string; sets: SetLog[] }[] = [];
  for (const set of [...session.sets].sort((a, b) => a.doneAt - b.doneAt)) {
    const group = byExercise.find((g) => g.exerciseId === set.exerciseId);
    if (group) group.sets.push(set);
    else byExercise.push({ exerciseId: set.exerciseId, sets: [set] });
  }
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <StatCell label="TIEMPO" value={minutes} unit="min" style={{ flex: 1 }} />
        <StatCell label="SERIES" value={session.sets.length} style={{ flex: 1 }} />
        <StatCell label="VOLUMEN" value={formatTotal(volume(session.sets), unit).split(" ")[0]} unit={unit} style={{ flex: 1 }} />
      </View>
      {status ? (
        <Panel style={{ flexDirection: "row", alignItems: "center", gap: space.md }} testID="summary-status">
          <Icon name={status.uploaded ? "checkmark.circle.fill" : status.failed ? "exclamationmark.triangle.fill" : "arrow.up.circle"} color={status.uploaded ? "accentText" : status.failed ? "warning" : "textSecondary"} />
          <View style={{ flex: 1 }}>
            <Text variant="rowTitle">{status.uploaded ? "Guardada" : status.failed ? "No se pudo guardar" : "Guardando…"}</Text>
            <Text variant="footnote" color="textSecondary">
              {status.failed ? "Se queda en el iPhone y se envía sola cuando haya conexión." : status.health ? "También en Salud." : null}
            </Text>
          </View>
          {status.failed && onRetry ? <Button title="Reintentar" onPress={onRetry} /> : null}
        </Panel>
      ) : null}
      {prs.length ? (
        <Panel style={{ gap: space.sm }}>
          <PanelHeader title="RÉCORDS" accent />
          {prs.map((r) => (
            <View key={`${r.exerciseId}-${r.kind}`} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
              <Icon name="trophy.fill" size={14} color="carbs" />
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {r.exerciseName} · {RECORD[r.kind]}
              </Text>
              <Text variant="numberSmall">{r.kind === "reps" ? r.value : formatWeight(r.value, training.unit(r.exerciseId))}</Text>
            </View>
          ))}
        </Panel>
      ) : null}
      {byExercise.map((g) => {
        const u = training.unit(g.exerciseId);
        return (
          <Panel key={g.exerciseId} style={{ gap: space.xs }}>
            <PanelHeader title={(names[g.exerciseId] ?? g.exerciseId).toUpperCase()} trailing={<Text variant="meta" color="textSecondary">{u.toUpperCase()}</Text>} />
            {g.sets.map((set, i) => (
              <View key={i} style={{ flexDirection: "row", gap: space.md }}>
                <Text variant="meta" color="textTertiary" style={{ width: 18 }}>
                  {i + 1}
                </Text>
                <Text variant="numberSmall" style={{ flex: 1 }}>
                  {dropsShort(set.segments?.length ? set.segments : [{ weightKg: set.weightKg, reps: set.reps }], u)}
                </Text>
                {set.rpe != null ? (
                  <Text variant="meta" color="textSecondary">
                    @{Math.round(set.rpe)}
                  </Text>
                ) : null}
              </View>
            ))}
          </Panel>
        );
      })}
      {(session.cardio ?? []).map((c, i) => (
        <Panel key={`c${i}`} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Icon name="heart.circle" color="energy" />
          <Text variant="rowTitle" style={{ flex: 1 }}>
            {names[c.exerciseId] ?? "Cardio"}
          </Text>
          <Text variant="numberSmall">{[clockText(c.durationSeconds), c.distanceKm != null ? `${String(c.distanceKm).replace(".", ",")} km` : null].filter(Boolean).join(" · ")}</Text>
        </Panel>
      ))}
      {cutShort.length ? (
        <Text variant="footnote" color="textSecondary">
          Terminado antes: {cutShort.join(", ")}.
        </Text>
      ) : null}
      {skipped.length ? (
        <Text variant="footnote" color="textSecondary">
          Saltados: {skipped.join(", ")}.
        </Text>
      ) : null}
    </View>
  );
}
