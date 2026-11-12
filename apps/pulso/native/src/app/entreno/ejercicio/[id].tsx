import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, TextInput, View } from "react-native";
import { useAction } from "@/data/actions";
import { useOperation } from "@/data/queries";
import { useTheme } from "@/theme";
import { IconButton } from "@/ui/Button";
import { ListRow, Rows } from "@/ui/ListRow";
import { Panel, PanelHeader } from "@/ui/Panel";
import { QueryState } from "@/ui/QueryState";
import { Screen } from "@/ui/Screen";
import { Segmented } from "@/ui/Segmented";
import { Sparkline } from "@/ui/Sparkline";
import { StatCell } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { dropsShort } from "@/training/drops";
import { training, useLive, useTraining } from "@/training/store";
import { equipmentLabel } from "@/training/text";
import { number, shown, type WeightUnit } from "@/training/units";
import { targetLine } from "@/training/live/state";
import { ExerciseThumb, MUSCLES } from "@/training/ui/parts";

// An exercise (SwiftUI's ExerciseDetailView): its guide (muscles, steps, cues,
// videos), today's target when it's in the session, the machine's unit, the
// person's notes, Rendimiento (records and a trend), its history and alternatives.

export default function Ejercicio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = id ?? "";
  const { space } = useTheme();
  const store = useTraining();
  const live = useLive();
  const detail = useOperation("get_exercise", { exerciseId }, { enabled: !!exerciseId });
  const today = live?.state.exercises.find((e) => e.exerciseId === exerciseId) ?? null;
  const unit = store.unit(exerciseId);
  return (
    <Screen title="EJERCICIO" leading={<IconButton icon="chevron.left" onPress={() => router.back()} accessibilityLabel="Atrás" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <QueryState query={detail}>
        {(d) => (
          <>
            <Panel style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <ExerciseThumb exerciseId={exerciseId} size={84} cardio={d.kind === "cardio"} modality={d.modality} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="title" numberOfLines={3}>
                  {d.name}
                </Text>
                <Text variant="meta" color="textSecondary">
                  {[d.primaryMuscles.map((m) => MUSCLES[m] ?? m).join(", "), equipmentLabel(d.equipment)].filter(Boolean).join(" · ").toUpperCase()}
                </Text>
                {d.secondaryMuscles.length ? (
                  <Text variant="footnote" color="textSecondary">
                    También: {d.secondaryMuscles.map((m) => MUSCLES[m] ?? m).join(", ")}
                  </Text>
                ) : null}
              </View>
            </Panel>
            {today ? (
              <Panel style={{ gap: 4 }}>
                <PanelHeader title="HOY" accent />
                <Text variant="body">{targetLine(today)}</Text>
              </Panel>
            ) : null}
            {d.kind !== "cardio" ? (
              <Panel style={{ gap: space.sm }}>
                <PanelHeader title="UNIDAD DE ESTA MÁQUINA" />
                <Segmented
                  options={[
                    { value: "kg", label: "Kilos" },
                    { value: "lb", label: "Libras" },
                  ]}
                  value={unit}
                  onChange={(u) => void training.setUnit(exerciseId, u as WeightUnit).catch(() => {})}
                />
                <Text variant="footnote" color="textSecondary">
                  Se queda para las próximas sesiones.
                </Text>
              </Panel>
            ) : null}
            {d.instructions.length ? (
              <Panel style={{ gap: space.sm }}>
                <PanelHeader title="CÓMO SE HACE" />
                {d.instructions.map((step, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: space.sm }}>
                    <Text variant="numberSmall" color="accentText" style={{ width: 18 }}>
                      {i + 1}
                    </Text>
                    <Text variant="body" style={{ flex: 1 }}>
                      {step}
                    </Text>
                  </View>
                ))}
              </Panel>
            ) : null}
            {d.tips.length ? (
              <Panel style={{ gap: 4 }}>
                <PanelHeader title="CLAVES" />
                {d.tips.map((tip, i) => (
                  <Text key={i} variant="body">
                    · {tip}
                  </Text>
                ))}
              </Panel>
            ) : null}
            {d.videos.length ? (
              <Panel style={{ gap: 4 }}>
                <PanelHeader title="VÍDEOS" />
                <Rows>
                  {d.videos.map((v) => (
                    <ListRow key={v.youtubeId} title={v.title} subtitle={`${v.channel} · ${v.lang.toUpperCase()}`} icon="play.rectangle.fill" onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${v.youtubeId}`)} />
                  ))}
                </Rows>
              </Panel>
            ) : null}
            <Notes exerciseId={exerciseId} notes={d.notes} />
            {d.kind !== "cardio" ? <Performance exerciseId={exerciseId} unit={unit} /> : null}
            {d.kind !== "cardio" ? <History exerciseId={exerciseId} unit={unit} /> : null}
            <Similar exerciseId={exerciseId} />
            {d.media.attribution ? (
              <Text variant="meta" color="textTertiary">
                {d.media.attribution}
              </Text>
            ) : null}
          </>
        )}
      </QueryState>
    </Screen>
  );
}

/** The person's own notes (seat height, grip…), saved when they leave the field. */
function Notes({ exerciseId, notes }: { exerciseId: string; notes: string | null }) {
  const { colors, space, radius, type } = useTheme();
  const { run } = useAction();
  const [text, setText] = useState(notes ?? "");
  useEffect(() => setText(notes ?? ""), [notes]);
  return (
    <Panel style={{ gap: space.sm }}>
      <PanelHeader title="TUS NOTAS" />
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={() => (text.trim() !== (notes ?? "") ? void run("set_exercise_notes", { exerciseId, notes: text.trim() || null }).catch(() => {}) : undefined)}
        placeholder="Altura del asiento, agarre…"
        placeholderTextColor={colors.textTertiary}
        multiline
        style={[type.body, { color: colors.text, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: space.md, minHeight: 64 }]}
      />
    </Panel>
  );
}

/** Rendimiento: heaviest set, best e1RM and most volume in one session, and the top load per session. */
function Performance({ exerciseId, unit }: { exerciseId: string; unit: WeightUnit }) {
  const { space } = useTheme();
  const perf = useOperation("get_exercise_performance", { exerciseId });
  const p = perf.data;
  if (!p || (!p.maxWeight && !p.history.length)) return null;
  const date = (at: number) => new Date(at).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).toUpperCase();
  return (
    <Panel style={{ gap: space.sm }}>
      <PanelHeader title="RENDIMIENTO" />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {p.maxWeight ? <StatCell label={`MÁX · ${date(p.maxWeight.at)}`} value={number(shown(p.maxWeight.kg, unit))} unit={`${unit} × ${p.maxWeight.reps}`} size="numberSmall" style={{ flex: 1 }} /> : null}
        {p.bestE1rm ? <StatCell label="1RM EST." value={number(shown(p.bestE1rm.kg, unit))} unit={unit} size="numberSmall" style={{ flex: 1 }} /> : null}
        {p.maxVolume ? <StatCell label="VOLUMEN" value={number(Math.round(shown(p.maxVolume.kg, unit)))} unit={unit} size="numberSmall" style={{ flex: 1 }} /> : null}
      </View>
      {p.history.length > 1 ? <Sparkline values={p.history.map((h) => shown(h.topWeightKg, unit))} height={56} /> : null}
    </Panel>
  );
}

/** Each session's sets, newest first. */
function History({ exerciseId, unit }: { exerciseId: string; unit: WeightUnit }) {
  const { space } = useTheme();
  const history = useOperation("exercise_history", { exerciseId, limit: 12, withSets: true });
  const points = [...(history.data?.points ?? [])].reverse();
  if (!points.length) return null;
  return (
    <Panel style={{ gap: space.sm }}>
      <PanelHeader title="HISTORIAL" trailing={<Text variant="meta" color="textSecondary">{unit.toUpperCase()}</Text>} />
      {points.map((pt) => (
        <View key={pt.sessionId} style={{ flexDirection: "row", gap: space.md }}>
          <Text variant="meta" color="textSecondary" style={{ width: 64 }}>
            {new Date(pt.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).toUpperCase()}
          </Text>
          <Text variant="numberSmall" style={{ flex: 1 }}>
            {(pt.sets ?? []).map((s) => dropsShort(s.segments?.length ? s.segments : [{ weightKg: s.weightKg, reps: s.reps }], unit)).join("  ")}
          </Text>
        </View>
      ))}
    </Panel>
  );
}

/** Alternatives, best first. */
function Similar({ exerciseId }: { exerciseId: string }) {
  const similar = useOperation("find_similar_exercises", { exerciseId, limit: 5 });
  const list = similar.data?.exercises ?? [];
  if (!list.length) return null;
  return (
    <Panel style={{ gap: 4 }}>
      <PanelHeader title="PARECIDOS" />
      <Rows>
        {list.map((x) => (
          <ListRow key={x.id} title={x.name} subtitle={[equipmentLabel(x.equipment), ...x.reasons].join(" · ")} onPress={() => router.push(`/entreno/ejercicio/${x.id}` as Href)} />
        ))}
      </Rows>
    </Panel>
  );
}

