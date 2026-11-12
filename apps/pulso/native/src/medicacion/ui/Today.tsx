import type { DoseSlot, Medication, ScheduleNudge } from "@/contract";
import { View } from "react-native";
import { showMenu, SwipeRow, type MenuAction } from "@/dieta/ui/SwipeRow";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Ring } from "@/ui/Gauge";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { doseText, heroText, isLeft, isPending, isTaken, type TodayItem } from "../model";

type Actions = {
  take: (s: DoseSlot) => void;
  skip: (s: DoseSlot) => void;
  undo: (s: DoseSlot) => void;
  takeNow: (m: Medication) => void;
  removeEvent: (e: TodayItem["intakes"][number]) => void;
};

/**
 * Today at a glance: with doses scheduled, a ring of those settled beside what
 * is left; with none, a quiet line that still names the as-needed meds taken
 * most days, so it never claims there is nothing to take.
 */
export function MedicationHero({ items, usual, streak }: { items: TodayItem[]; usual: string[]; streak: number }) {
  const { colors } = useTheme();
  const h = heroText(items, usual);
  return (
    <Panel style={{ flexDirection: "row", alignItems: "center", gap: 16 }} testID="medication-hero">
      {h.free ? (
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
          <Icon name="calendar.badge.checkmark" size={26} color="textSecondary" />
        </View>
      ) : (
        <Ring progress={h.progress} size={72} stroke={7}>
          {h.left ? (
            <Text variant="stat" accessibilityLabel={`${h.left} por tomar`}>
              {h.left}
            </Text>
          ) : (
            <Icon name="checkmark" size={24} color="accentText" weight="bold" />
          )}
        </Ring>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="headline" color={h.done ? "accentText" : "text"}>
          {h.headline}
        </Text>
        {h.usualLine ? (
          <Text variant="subhead" color="textSecondary">
            {h.usualLine}
          </Text>
        ) : null}
        {h.takenLine ? (
          <Text variant="footnote" color="textSecondary">
            {h.takenLine}
          </Text>
        ) : null}
        {streak > 1 && !h.late ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
            <Icon name="flame.fill" size={12} tint={colors.energy} />
            <Text variant="meta" style={{ color: colors.energy }}>
              {streak} días seguidos sin fallar
            </Text>
          </View>
        ) : null}
      </View>
    </Panel>
  );
}

/** Quiet suggestions to give an as-needed med a schedule: «Ponerle horario» opens the editor prefilled. */
export function NudgesPanel({ nudges, onAccept, onDismiss }: { nudges: ScheduleNudge[]; onAccept: (n: ScheduleNudge) => void; onDismiss: (n: ScheduleNudge) => void }) {
  const { colors, hairline } = useTheme();
  if (!nudges.length) return null;
  return (
    <Panel style={{ gap: 12 }} testID="medication-nudges">
      {nudges.map((n, i) => (
        <View key={n.medicationId} style={{ gap: 10, paddingTop: i ? 12 : 0, borderTopWidth: i ? hairline : 0, borderTopColor: colors.separator }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
              <Icon name={n.cadence === "weekly" ? "calendar.badge.clock" : "alarm"} size={17} color="accentText" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="rowTitle">{n.title}</Text>
              <Text variant="meta" color="textSecondary">
                {n.detail}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
            <Button title="Ahora no" onPress={() => onDismiss(n)} />
            <Button title="Ponerle horario" variant="accent" onPress={() => onAccept(n)} />
          </View>
        </View>
      ))}
    </Panel>
  );
}

/** Today in sections, one panel each: what is left, as-needed, what isn't due, what is done. Empty ones are left out. */
export function TodaySections({ items, actions }: { items: TodayItem[]; actions: Actions }) {
  return (
    <>
      <Section title="Pendiente" rows={items.filter(isLeft)} actions={actions} hint="Desliza una toma para omitirla; mantén pulsada para más." />
      <Section title="Cuando haga falta" rows={items.filter((i) => i.state === "aDemanda")} actions={actions} />
      <Section title="Hoy no toca" rows={items.filter((i) => i.state === "noToca")} actions={actions} />
      <Section title="Tomado" rows={items.filter((i) => i.state === "tomada" || i.state === "omitida")} actions={actions} hint="Desliza una toma para deshacerla." />
    </>
  );
}

function Section({ title, rows, actions, hint }: { title: string; rows: TodayItem[]; actions: Actions; hint?: string }) {
  const { colors, hairline } = useTheme();
  if (!rows.length) return null;
  return (
    <Panel style={{ paddingHorizontal: 0, paddingBottom: 6, overflow: "hidden" }} testID={`medication-${title}`}>
      <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
        <PanelHeader title={title} trailing={String(rows.length)} />
      </View>
      {rows.map((item, i) => (
        <View key={item.id} style={i ? { borderTopWidth: hairline, borderTopColor: colors.separator } : undefined}>
          <TimelineRow item={item} actions={actions} />
        </View>
      ))}
      {hint ? (
        <Text variant="caption" color="textTertiary" style={{ paddingHorizontal: 14, paddingTop: 6 }}>
          {hint}
        </Text>
      ) : null}
    </Panel>
  );
}

/** «1 comprimido · A las 17:30 · Se pasó hace 2 h · con agua», the state's line in its colour. */
function Detail({ item }: { item: TodayItem }) {
  const { colors } = useTheme();
  const before: string[] = [];
  if (item.state !== "noToca") before.push(doseText(item.medication));
  if (item.state !== "aDemanda" && item.state !== "dia") before.push(item.when);
  const after = item.medication.instructions && item.state !== "noToca" ? item.medication.instructions : null;
  const tone = item.state === "atrasada" ? colors.warning : item.state === "ahora" ? colors.accentText : undefined;
  return (
    <Text variant="footnote" color="textSecondary" numberOfLines={3}>
      {before.length ? `${before.join(" · ")} · ` : ""}
      <Text variant="footnote" style={tone ? { color: tone, fontWeight: "600" } : { color: colors.textSecondary }}>
        {item.line}
      </Text>
      {after ? ` · ${after}` : ""}
    </Text>
  );
}

function Marker({ item }: { item: TodayItem }) {
  const { colors } = useTheme();
  const box = { width: 26, height: 26, alignItems: "center", justifyContent: "center" } as const;
  if (isTaken(item)) return <View style={box}><Icon name="checkmark.circle.fill" size={22} color="accentText" /></View>;
  switch (item.state) {
    case "entreno":
      return <View style={[box, { borderRadius: 13, backgroundColor: colors.surfaceRaised }]}><Icon name="figure.strengthtraining.traditional" size={13} tint={colors.training} /></View>;
    case "dia":
      return <View style={[box, { borderRadius: 13, backgroundColor: colors.surfaceRaised }]}><Icon name="calendar.badge.checkmark" size={13} color="accentText" /></View>;
    case "ahora":
      return (
        <View style={box}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, opacity: 0.28, position: "absolute" }} />
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
        </View>
      );
    case "atrasada":
      // An exclamation, not only the warm tint, so "late" reads without colour.
      return <View style={box}><Icon name="exclamationmark.circle.fill" size={22} tint={colors.warning} /></View>;
    case "omitida":
      return <View style={box}><Icon name="xmark.circle" size={22} color="textSecondary" /></View>;
    case "aDemanda":
      return <View style={box}><View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.textSecondary }} /></View>;
    default:
      return <View style={box}><View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: item.state === "noToca" ? colors.textTertiary : colors.textSecondary }} /></View>;
  }
}

/** One dose of today: a state marker, the name with its details, one compact action; swipe or long-press for the rest. */
function TimelineRow({ item, actions }: { item: TodayItem; actions: Actions }) {
  const { colors, hairline } = useTheme();
  const slot = item.slot;
  const menu: MenuAction[] = [];
  if (slot) {
    if (slot.status !== "tomada") menu.push({ title: "Tomada", onPress: () => actions.take(slot) });
    if (slot.status !== "omitida") menu.push({ title: "Omitir", onPress: () => actions.skip(slot) });
    if (slot.eventId) menu.push({ title: "Volver a pendiente", onPress: () => actions.undo(slot) });
  } else if (item.intakes[0]) {
    const last = item.intakes[0];
    menu.push({ title: "Borrar la última toma", destructive: true, onPress: () => actions.removeEvent(last) });
  }

  let trailing = null;
  if (slot && isPending(slot))
    trailing = (
      <PressableScale
        feedback="success"
        onPress={() => actions.take(slot)}
        accessibilityLabel={`Marcar ${item.medication.name} como tomada`}
        testID={`take-${slot.medicationId}-${slot.slot}`}
        style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="checkmark" size={18} color="onAccent" weight="bold" />
      </PressableScale>
    );
  else if (item.state === "aDemanda")
    trailing = (
      <PressableScale
        onPress={() => actions.takeNow(item.medication)}
        accessibilityLabel={item.intakes.length ? `Tomé otra ${item.medication.name}` : `Tomé ${item.medication.name}`}
        testID={`take-now-${item.medication.id}`}
        style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: hairline, borderColor: colors.separator, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="plus" size={18} color="text" weight="bold" />
      </PressableScale>
    );

  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 60 }}>
      <Marker item={item} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          variant="rowTitle"
          color={item.state === "noToca" || item.state === "omitida" ? "textSecondary" : "text"}
          style={item.state === "omitida" ? { textDecorationLine: "line-through" } : undefined}
          numberOfLines={2}
        >
          {item.medication.name}
        </Text>
        <Detail item={item} />
      </View>
      {trailing}
    </View>
  );

  if (!menu.length) return body;
  const swipe = slot
    ? isPending(slot)
      ? { label: "Omitir", icon: "xmark" as const, color: colors.textSecondary, onPress: () => actions.skip(slot) }
      : slot.eventId
        ? { label: "Deshacer", icon: "arrow.uturn.backward" as const, color: colors.warning, onPress: () => actions.undo(slot) }
        : undefined
    : undefined;
  return (
    <SwipeRow right={swipe} menu={menu} menuTitle={item.medication.name} onPress={() => showMenu(menu, item.medication.name)}>
      {body}
    </SwipeRow>
  );
}
