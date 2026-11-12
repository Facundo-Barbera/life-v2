import type { EditScope, Exercise } from "@/contract";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useAction } from "@/data/actions";
import { useOperation } from "@/data/queries";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { ListRow, Rows } from "@/ui/ListRow";
import { Panel } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Segmented } from "@/ui/Segmented";
import { Sheet } from "@/ui/Sheet";
import { StatCell } from "@/ui/StatCell";
import { LoadingState } from "@/ui/States";
import { Text } from "@/ui/Text";
import { clockText } from "../cardio";
import type { LiveSession } from "../live/session";
import * as L from "../live/state";
import { training } from "../store";
import { equipmentLabel, restClock } from "../text";

// The live session's sheets: its menu, «Cambiar ejercicio», «Editar sesión»
// (SwiftUI's CustomizeList), the in-workout Coach, the recording's numbers and
// this exercise's rest for today.

export type MenuItem = { title: string; icon: SFSymbol; onPress: () => void; destructive?: boolean };

export function MenuSheet({ visible, onClose, title, items }: { visible: boolean; onClose: () => void; title: string; items: MenuItem[] }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Rows>
        {items.map((item) => (
          <ListRow
            key={item.title}
            title={item.title}
            icon={item.icon}
            iconTint={item.destructive ? "#FF453A" : undefined}
            testID={`menu-${item.title}`}
            onPress={() => {
              onClose();
              setTimeout(item.onPress, 250);
            }}
          />
        ))}
      </Rows>
    </Sheet>
  );
}

/** «Cambiar ejercicio»: the alternatives, best first, for today or for always (the program day changes too). */
export function SwapSheet({ target, onClose, onPick }: { target: { exerciseId: string; name: string } | null; onClose: () => void; onPick: (exercise: Exercise, scope: EditScope) => void }) {
  const { space } = useTheme();
  const [scope, setScope] = useState<EditScope>("today");
  const similar = useOperation("find_similar_exercises", { exerciseId: target?.exerciseId ?? "", limit: 12 }, { enabled: !!target });
  return (
    <Sheet visible={!!target} onClose={onClose} title={target ? `CAMBIAR ${target.name.toUpperCase()}` : undefined}>
      <View style={{ gap: space.md }}>
        <Segmented
          options={[
            { value: "today", label: "Solo hoy" },
            { value: "always", label: "Para siempre" },
          ]}
          value={scope}
          onChange={setScope}
        />
        <ScrollView style={{ maxHeight: 420 }}>
          {similar.isLoading ? (
            <LoadingState lines={4} />
          ) : (
            <Rows>
              {(similar.data?.exercises ?? []).map((x) => (
                <ListRow
                  key={x.id}
                  title={x.name}
                  subtitle={[equipmentLabel(x.equipment), ...x.reasons].join(" · ")}
                  icon={x.preferred ? "star.fill" : "dumbbell"}
                  testID={`swap-${x.id}`}
                  onPress={() => onPick(x, scope)}
                />
              ))}
            </Rows>
          )}
        </ScrollView>
      </View>
    </Sheet>
  );
}

/** Picks a library exercise by name: «Añadir ejercicio». */
export function LibrarySheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (exercise: Exercise) => void }) {
  const { colors, space, radius, type } = useTheme();
  const [query, setQuery] = useState("");
  const library = useOperation("list_exercise_library", {}, { enabled: visible, staleTime: 60 * 60_000 });
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const found = useMemo(() => {
    const q = fold(query.trim());
    return (library.data?.exercises ?? []).filter((x) => !q || fold(x.name).includes(q) || x.id.includes(q)).slice(0, 40);
  }, [library.data, query]);
  return (
    <Sheet visible={visible} onClose={onClose} title="AÑADIR EJERCICIO">
      <View style={{ gap: space.md }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Busca: remo, sentadilla, cinta…"
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          testID="library-search"
          style={[type.body, { color: colors.text, backgroundColor: colors.surfaceRaised, borderRadius: radius.md, paddingHorizontal: space.md, height: 48 }]}
        />
        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          <Rows>
            {found.map((x) => (
              <ListRow key={x.id} title={x.name} subtitle={`${MUSCLE_GROUPS[x.muscle] ?? x.muscle} · ${equipmentLabel(x.equipment)}`} testID={`library-${x.id}`} onPress={() => onPick(x)} />
            ))}
          </Rows>
        </ScrollView>
      </View>
    </Sheet>
  );
}

const MUSCLE_GROUPS: Record<string, string> = {
  chest: "Pecho",
  back: "Espalda",
  shoulders: "Hombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebrazos",
  quads: "Cuádriceps",
  hamstrings: "Isquiotibiales",
  glutes: "Glúteos",
  calves: "Gemelos",
  core: "Core",
  full_body: "Cuerpo completo",
  cardio: "Cardio",
};

/**
 * «Editar sesión» for today (SwiftUI's CustomizeList): reorder, skip, remove
 * (only with nothing logged), add. Edits a draft; «Guardar» puts it on top of
 * whatever was logged meanwhile. Rows carry their own copy and are found by id,
 * never by a position that a shorter list no longer has.
 */
export function EditSessionSheet({ session, visible, onClose }: { session: LiveSession; visible: boolean; onClose: () => void }) {
  const { colors, space } = useTheme();
  const [draft, setDraft] = useState<L.LiveState | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => setDraft(visible ? L.clone(session.state) : null), [visible]);
  if (!draft) return null;
  const change = (fn: (d: L.LiveState) => void) => setDraft((d) => (d ? L.produce(d, fn) : d));
  const indexOf = (id: string) => draft.exercises.findIndex((x) => x.id === id);
  const rows = draft.exercises.map((ex) => ({ ...ex }));
  return (
    <>
      <Sheet visible={visible && !adding} onClose={onClose} title="EDITAR SESIÓN">
        <View style={{ gap: space.md }}>
          <ScrollView style={{ maxHeight: 460 }}>
            <View style={{ gap: space.sm }}>
              {rows.map((ex, i) => (
                <Panel key={ex.id} size="cell" style={{ flexDirection: "row", alignItems: "center", gap: space.sm, opacity: ex.skipped ? 0.55 : 1 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="rowTitle" numberOfLines={1} style={ex.skipped ? { textDecorationLine: "line-through" } : undefined}>
                      {ex.name}
                    </Text>
                    <Text variant="meta" color="textSecondary" numberOfLines={1}>
                      {[ex.supersetId ? "SUPERSERIE" : null, L.isCardio(ex) ? "CARDIO" : L.targetLine(ex).toUpperCase(), ex.skipped ? "SALTADO" : null].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <Small icon="chevron.up" label="Subir" disabled={i === 0} onPress={() => change((d) => L.move(d, [indexOf(ex.id)], indexOf(ex.id) - 1))} />
                  <Small icon="chevron.down" label="Bajar" disabled={i === rows.length - 1} onPress={() => change((d) => L.move(d, [indexOf(ex.id)], indexOf(ex.id) + 2))} />
                  <Small icon={ex.skipped ? "arrow.uturn.backward" : "forward"} label={ex.skipped ? "Retomar" : "Saltar"} onPress={() => change((d) => L.setSkipped(d, indexOf(ex.id), !ex.skipped))} />
                  <Small icon="trash" label="Quitar" tint={colors.negative} disabled={L.hasDoneWork(ex)} onPress={() => change((d) => L.remove(d, indexOf(ex.id)))} testID={`edit-remove-${i}`} />
                </Panel>
              ))}
            </View>
          </ScrollView>
          <Button title="Añadir ejercicio" icon="plus" wide onPress={() => setAdding(true)} />
          <Button
            title="Guardar"
            variant="accent"
            size="lg"
            wide
            testID="edit-save"
            onPress={() => {
              session.applyDraft(draft);
              onClose();
            }}
          />
        </View>
      </Sheet>
      <LibrarySheet
        visible={visible && adding}
        onClose={() => setAdding(false)}
        onPick={(x) => {
          change((d) => void L.add(d, x, training.lastWeight(x.id) ?? 0));
          setAdding(false);
        }}
      />
    </>
  );
}

function Small({ icon, label, onPress, disabled, tint, testID }: { icon: SFSymbol; label: string; onPress: () => void; disabled?: boolean; tint?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale testID={testID} onPress={onPress} disabled={disabled} feedback="select" accessibilityLabel={label} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1 }}>
      <Icon name={icon} size={14} tint={tint} />
    </PressableScale>
  );
}

/** The recording's numbers, live: heart rate, energy, distance, time. */
export function MetricsSheet({ visible, onClose, now }: { visible: boolean; onClose: () => void; now: number }) {
  const { space } = useTheme();
  const link = training.link;
  const m = link?.live ?? null;
  const elapsed = m?.elapsedFrom ? (now - m.elapsedFrom.getTime()) / 1000 : (m?.elapsedSeconds ?? null);
  return (
    <Sheet visible={visible} onClose={onClose} title={link?.recorder === "phone" ? "GRABANDO EN EL IPHONE" : link?.recorder === "watch" ? "GRABANDO EN EL APPLE WATCH" : "SIN GRABACIÓN"}>
      {m ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <StatCell label="FRECUENCIA" value={m.heartRate != null ? Math.round(m.heartRate) : "--"} unit="lpm" style={{ flexBasis: "47%", flexGrow: 1 }} />
          <StatCell label="MEDIA" value={m.averageHeartRate != null ? Math.round(m.averageHeartRate) : "--"} unit="lpm" style={{ flexBasis: "47%", flexGrow: 1 }} />
          <StatCell label="ACTIVAS" value={Math.round(m.activeKcal)} unit="kcal" style={{ flexBasis: "47%", flexGrow: 1 }} />
          <StatCell label="TOTALES" value={m.totalKcal != null ? Math.round(m.totalKcal) : "--"} unit="kcal" style={{ flexBasis: "47%", flexGrow: 1 }} />
          {elapsed != null ? <StatCell label="TIEMPO" value={clockText(elapsed)} style={{ flexBasis: "47%", flexGrow: 1 }} /> : null}
          {m.distanceMeters ? <StatCell label="DISTANCIA" value={(m.distanceMeters / 1000).toFixed(2).replace(".", ",")} unit="km" style={{ flexBasis: "47%", flexGrow: 1 }} /> : null}
        </View>
      ) : (
        <Text variant="body" color="textSecondary">
          Ni el Apple Watch ni el iPhone están grabando esta sesión.
        </Text>
      )}
    </Sheet>
  );
}

/** This exercise's rest for today, 0:15 to 10:00 in 15 s steps; the running rest follows it from its start. */
export function RestSheet({ session, visible, onClose }: { session: LiveSession; visible: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const e = L.restingExercise(session.state);
  const ex = e != null ? session.state.exercises[e] : null;
  const options = Array.from({ length: 40 }, (_, i) => (i + 1) * 15);
  return (
    <Sheet visible={visible} onClose={onClose} title={ex ? `DESCANSO · ${ex.name.toUpperCase()}` : "DESCANSO"}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {options.map((seconds) => (
          <Button
            key={seconds}
            title={restClock(seconds)}
            variant={ex?.restSeconds === seconds ? "accent" : "plain"}
            onPress={() => {
              session.setRest(seconds);
              onClose();
            }}
            style={{ flexBasis: "22%", flexGrow: 1 }}
          />
        ))}
      </View>
    </Sheet>
  );
}

