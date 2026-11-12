import type { DietDay, DietHorizon, MealEntry, PlanSlot } from "@/contract";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useTheme } from "@/theme";
import { SegmentBar } from "@/ui/Bars";
import { Button } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { EmptyState } from "@/ui/States";
import { Text } from "@/ui/Text";
import {
  ago,
  amountText,
  hm,
  horizonDay,
  int,
  longDate,
  MARK_TITLES,
  prepsCooking,
  recipeOf,
  SLOT_ACTIONS,
  SLOT_TITLES,
  slotActions,
  slotItems,
  slotKcal,
  slotMark,
  slotSource,
  slotWhat,
  sumMacros,
  weekdayShort,
  type SlotAction,
} from "../model";
import { MacroLine } from "./forms";
import { EntryRow, LoggedList, MiniButton, TableHead, type EntryActions } from "./Meals";
import { showMenu, SwipeRow } from "./SwipeRow";

export type SlotHandlers = {
  /** Only today's slots act. */
  onAction?: (slot: PlanSlot, action: SlotAction) => void;
  entry: EntryActions;
  onDeleteAll?: (slot: PlanSlot, entries: MealEntry[]) => void;
  onPrepCooked?: (prepId: string, cooked: boolean) => void;
  onUndoRevision?: (id: string) => void;
};

const MARK_ICON = { unanswered: "circle.dashed", planned: "circle", skipped: "minus.circle", asPlanned: "checkmark.circle.fill", changed: "circle.lefthalf.filled" } as const;

/** One planned meal: its mark, what it is (or what was eaten), and what can be done with it (PlanSlotRow.swift). */
export function PlanSlotRow({ slot, horizon, entries = [], others = [], handlers, testID }: { slot: PlanSlot; horizon: DietHorizon | null | undefined; entries?: MealEntry[]; others?: PlanSlot[]; handlers: SlotHandlers; testID?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [showPlanned, setShowPlanned] = useState(false);
  const mark = slotMark(slot);
  const actions = handlers.onAction ? slotActions(slot) : [];
  const recipeId = recipeOf(horizon, slot);
  const source = slotSource(horizon, slot);
  const changed = mark === "changed";
  const line = slot.real?.label ?? (changed ? slot.replacedBy : null) ?? slotWhat(slot);
  const markColor = mark === "unanswered" ? colors.warning : mark === "asPlanned" || mark === "changed" ? colors.accentText : colors.textSecondary;
  const act = (a: SlotAction) => {
    if (a === "eaten") haptics.success();
    handlers.onAction?.(slot, a);
  };
  const entryMenu = entries.length
    ? [
        ...(entries.length === 1 && !entries[0]!.dish
          ? [{ title: "Cambiar la cantidad", onPress: () => handlers.entry.onAmount(entries[0]!) }]
          : entries.map((e) => ({ title: `Cambiar la cantidad: ${e.name}`, onPress: () => handlers.entry.onAmount(e) }))),
        ...(entries.every((e) => e.dish && e.dish.id === entries[0]!.dish?.id) && !entries[0]!.dish?.savedDishId ? [{ title: "Guardar como platillo", onPress: () => handlers.entry.onSaveDish?.(entries[0]!.dish!.id) }] : []),
        ...others.map((o) => ({ title: `Mover a ${SLOT_TITLES[o.slot].toLowerCase()}`, onPress: () => handlers.entry.onMove?.(o, entries.map((e) => e.id)) })),
        ...(handlers.onDeleteAll ? [{ title: "Borrar", destructive: true, onPress: () => handlers.onDeleteAll!(slot, entries) }] : []),
      ]
    : [];

  const header = (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", minHeight: 52, paddingVertical: 6 }}>
      <Icon name={MARK_ICON[mark]} size={16} tint={markColor} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Text variant="rowTitle">{SLOT_TITLES[slot.slot]}</Text>
          <Text variant="meta" color={mark === "unanswered" ? "warning" : "textSecondary"}>
            {slot.real ? hm(slot.real.eatenAt) : mark === "unanswered" || mark === "skipped" ? MARK_TITLES[mark] : ""}
          </Text>
          {slot.adjusted && slot.status === "planned" ? <Icon name="sparkles" size={11} color="accentText" /> : null}
        </View>
        <Text variant="footnote" color={slot.status === "eaten" || slot.status === "replaced" ? "text" : "textSecondary"} numberOfLines={open ? undefined : 2}>
          {line}
        </Text>
        {changed && (slot.real || slot.replacedBy) ? (
          <Text variant="caption" color="textTertiary" numberOfLines={1}>
            en lugar de {slotWhat(slot)}
          </Text>
        ) : null}
      </View>
      <Text variant="numberSmall" color={mark === "skipped" ? "textTertiary" : slot.status === "planned" ? "textSecondary" : "text"} style={{ fontSize: 15 }}>
        {int(slotKcal(slot))}
        <Text variant="labelSmall" color="textSecondary">
          {" "}
          kcal
        </Text>
      </Text>
    </View>
  );

  return (
    <View testID={testID} style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
      {actions.length ? (
        <SwipeRow
          onPress={() => (haptics.select(), setOpen((o) => !o))}
          left={{ label: "Me lo comí", icon: "checkmark", color: colors.accent, ink: colors.onAccent, onPress: () => act("eaten") }}
          right={{ label: "Me lo salté", icon: "minus", color: colors.textSecondary, onPress: () => act("skipped") }}
          menu={actions.map((a) => ({ title: SLOT_ACTIONS[a].title, onPress: () => act(a) }))}
          menuTitle={SLOT_TITLES[slot.slot]}
        >
          {header}
        </SwipeRow>
      ) : (
        <PressableScale feedback="select" onPress={() => setOpen((o) => !o)} onLongPress={entryMenu.length ? () => showMenu(entryMenu, SLOT_TITLES[slot.slot]) : undefined}>
          {header}
        </PressableScale>
      )}
      {mark === "unanswered" && actions.length ? (
        <View style={{ flexDirection: "row", gap: 8, paddingBottom: 8, paddingLeft: 26 }}>
          <MiniButton title="Me lo salté" onPress={() => act("skipped")} />
          <MiniButton title="Registrar lo que comí" accent onPress={() => act("replaced")} />
        </View>
      ) : null}
      {open ? (
        <View style={{ paddingLeft: 26, paddingBottom: 10, gap: 8 }}>
          {slot.note ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Icon name="sparkles" size={11} color="accentText" />
              <Text variant="footnote" color="textSecondary" style={{ fontStyle: "italic", flex: 1 }}>
                {slot.note}
              </Text>
            </View>
          ) : null}
          {entries.length ? (
            <View>
              {entries.map((e) => (
                <EntryRow key={e.id} meal={e} actions={handlers.entry} inset />
              ))}
              {entries.length > 1 ? <MacroLine {...sumMacros(entries)} /> : null}
            </View>
          ) : !slot.real ? (
            <PlannedItems slot={slot} />
          ) : null}
          {!slot.real && source ? (
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Icon name={source.icon} size={11} color="textSecondary" />
              <Text variant="meta" color="textSecondary">
                {source.text}
              </Text>
            </View>
          ) : null}
          {slot.real && (changed || !entries.length) ? (
            <View style={{ gap: 6 }}>
              <PressableScale onPress={() => setShowPlanned((s) => !s)} feedback="select">
                <Text variant="meta" color="textSecondary">
                  Planeado · {int(slot.macros.kcal)} kcal {showPlanned ? "▾" : "›"}
                </Text>
              </PressableScale>
              {showPlanned ? (
                <View style={{ opacity: 0.7 }}>
                  <PlannedItems slot={slot} />
                </View>
              ) : null}
            </View>
          ) : null}
          {!changed && recipeId ? <MiniButton icon="book" title="Ver receta" onPress={() => router.push({ pathname: "/dieta/receta/[id]", params: { id: recipeId } })} /> : null}
          {actions.length ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <MiniButton accent icon={SLOT_ACTIONS[actions[0]!].icon} title={SLOT_ACTIONS[actions[0]!].title} onPress={() => act(actions[0]!)} testID="slot-eaten" />
              {actions.length > 1 ? <MiniButton icon="ellipsis" title="Otro cambio" onPress={() => showMenu(actions.slice(1).map((a) => ({ title: SLOT_ACTIONS[a].title, onPress: () => act(a) })))} /> : null}
            </View>
          ) : entryMenu.length ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <MiniButton icon="slider.horizontal.3" title="Editar" onPress={() => showMenu(entryMenu.filter((m) => m.title.startsWith("Cambiar")))} />
              {entryMenu.some((m) => m.title === "Guardar como platillo") ? <MiniButton icon="bookmark" title="Guardar" onPress={() => handlers.entry.onSaveDish?.(entries[0]!.dish!.id)} /> : null}
              {others.length ? <MiniButton icon="arrow.right.arrow.left" title="Mover" onPress={() => showMenu(entryMenu.filter((m) => m.title.startsWith("Mover")), "Mover a")} /> : null}
              {handlers.onDeleteAll ? <MiniButton icon="trash" title="Borrar" onPress={() => handlers.onDeleteAll!(slot, entries)} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PlannedItems({ slot }: { slot: PlanSlot }) {
  return (
    <View style={{ gap: 2 }}>
      {slotItems(slot).map((i) => (
        <View key={i.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text variant="footnote" style={{ flex: 1 }}>
            {i.name}
          </Text>
          <Text variant="meta" color="textSecondary">
            {amountText({ quantity: i.quantity, unit: i.unit, measure: null })}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Hoy with a plan: the day's meals as planned slots, then extras (TodayPlanCard + ExtrasCard). */
export function TodayPlan({ day, horizon, meals, handlers }: { day: DietDay; horizon: DietHorizon; meals: MealEntry[]; handlers: SlotHandlers }) {
  const ids = new Set(day.slots.map((s) => s.id));
  const extras = meals.filter((m) => !m.slotId || !ids.has(m.slotId));
  const pending = day.slots.filter((s) => s.status === "planned").length;
  const trailing = day.real && day.asPlanned ? `${int(day.real.kcal)} de ${int(day.asPlanned.kcal)} kcal` : pending ? `${pending} pendiente${pending === 1 ? "" : "s"}` : "Resuelto";
  return (
    <>
      <Panel style={{ paddingVertical: 8 }} testID="today-plan">
        <PanelHeader title="Comidas" trailing={trailing} />
        <View style={{ marginTop: 6 }}>
          {day.slots.map((s) => (
            <PlanSlotRow
              key={s.id}
              slot={s}
              horizon={horizon}
              entries={meals.filter((m) => m.slotId === s.id)}
              others={day.slots.filter((o) => o.id !== s.id)}
              handlers={handlers}
              testID={`slot-${s.slot}`}
            />
          ))}
        </View>
      </Panel>
      {extras.length ? (
        <Panel style={{ paddingVertical: 8 }}>
          <PanelHeader title="Extras" trailing={`${int(sumMacros(extras).kcal)} kcal`} />
          <TableHead />
          <LoggedList meals={extras} actions={{ ...handlers.entry, moveTargets: day.slots }} />
        </Panel>
      ) : null}
    </>
  );
}

/** «Plan»: the next days, what to cook, each day's meals and the change history (NutritionPlanSection.swift). */
export function PlanSection({ horizon, today, handlers }: { horizon: DietHorizon; today: string; handlers: SlotHandlers }) {
  const { colors, hairline } = useTheme();
  const [date, setDate] = useState(today);
  const day = horizonDay(horizon, date) ?? horizon.days[0];
  if (!day) return <EmptyState icon="list.bullet.clipboard" title="Día sin comidas planeadas" message="Este día no tiene comidas en tu plan." />;
  const done = day.slots.filter((s) => s.status !== "planned").length;
  const preps = prepsCooking(horizon, day.date);
  const last = horizon.lastRevision;
  const isToday = day.date === today;
  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {horizon.days.map((d) => {
          const on = d.date === day.date;
          const cooking = prepsCooking(horizon, d.date).length > 0;
          const resolved = d.slots.length > 0 && d.slots.every((s) => s.status !== "planned");
          return (
            <PressableScale
              key={d.date}
              feedback="select"
              onPress={() => setDate(d.date)}
              style={{ width: 52, paddingVertical: 8, borderRadius: 10, alignItems: "center", gap: 3, backgroundColor: on ? colors.accent : colors.surface, borderWidth: on ? 0 : hairline, borderColor: colors.separator }}
            >
              <Text variant="labelSmall" color={on ? "onAccent" : "textSecondary"}>
                {d.date === today ? "hoy" : weekdayShort(d.date)}
              </Text>
              <Text variant="numberSmall" color={on ? "onAccent" : "text"}>
                {Number(d.date.slice(8))}
              </Text>
              {cooking ? <Icon name="frying.pan" size={10} color={on ? "onAccent" : "warning"} /> : resolved ? <Icon name="checkmark" size={10} color={on ? "onAccent" : "accentText"} /> : <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? colors.onAccent : colors.textTertiary, marginVertical: 3 }} />}
            </PressableScale>
          );
        })}
      </ScrollView>
      <Panel style={{ gap: 8 }}>
        <PanelHeader title={isToday ? `Hoy · ${longDate(day.date)}` : longDate(day.date)} trailing={day.label} />
        <Text variant="hero">
          {int(day.planned.kcal)}
          <Text variant="label" color="textSecondary">
            {" "}
            kcal
          </Text>
        </Text>
        <Text variant="meta" color="textSecondary">
          {[`de ${int(day.goalKcal)} kcal`, day.shiftKcal ? `${day.shiftKcal > 0 ? "+" : "−"}${int(Math.abs(day.shiftKcal))} compensado` : null].filter(Boolean).join(" · ")}
        </Text>
        {day.slots.length ? <SegmentBar count={day.slots.length} done={done} /> : null}
        <Text variant="meta" color="textSecondary">
          {done === day.slots.length ? "Día resuelto" : `${done} de ${day.slots.length} comidas resueltas`}
        </Text>
      </Panel>
      {preps.map((p) => (
        <Panel key={p.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Icon name="frying.pan" size={14} color="warning" />
            <Text variant="rowTitle" style={{ flex: 1 }}>
              Cocinar: {p.recipeName} ×{p.portions}
            </Text>
          </View>
          <Text variant="meta" color="textSecondary">
            {[p.status === "cooked" ? "Cocinado" : null, `${p.portions - p.leftover} de ${p.portions} porciones con día`, p.leftover > 0 ? `${p.leftover} libres` : null].filter(Boolean).join(" · ")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {p.status === "cooked" ? (
              <MiniButton title="No lo cociné" onPress={() => handlers.onPrepCooked?.(p.id, false)} />
            ) : (
              <MiniButton accent icon="checkmark" title="Ya lo cociné" onPress={() => handlers.onPrepCooked?.(p.id, true)} />
            )}
            <MiniButton icon="book" title="Receta" onPress={() => router.push({ pathname: "/dieta/receta/[id]", params: { id: p.recipeId } })} />
          </View>
        </Panel>
      ))}
      <Panel style={{ paddingVertical: 8 }}>
        <PanelHeader title="Comidas" />
        <View style={{ marginTop: 6 }}>
          {day.slots.length ? (
            day.slots.map((s) => <PlanSlotRow key={s.id} slot={s} horizon={horizon} handlers={{ ...handlers, onAction: isToday ? handlers.onAction : undefined }} />)
          ) : (
            <Text variant="footnote" color="textSecondary" style={{ paddingVertical: 8 }}>
              Día sin comidas planeadas.
            </Text>
          )}
        </View>
      </Panel>
      <PressableScale onPress={() => router.push("/dieta/cambios")} feedback="tap">
        <Panel style={{ gap: 6 }}>
          <PanelHeader title="Cambios" trailing="›" />
          {last && !last.undoneAt ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text variant="subhead">{last.summary}</Text>
                <Text variant="meta" color="textSecondary">
                  {ago(last.createdAt)}
                </Text>
              </View>
              <MiniButton icon="arrow.uturn.backward" title="Deshacer" onPress={() => handlers.onUndoRevision?.(last.id)} />
            </View>
          ) : (
            <Text variant="footnote" color="textSecondary">
              Lo que cambies en el plan queda aquí, y se puede deshacer.
            </Text>
          )}
        </Panel>
      </PressableScale>
    </View>
  );
}

export const confirmDeleteAll = (slot: PlanSlot, onConfirm: () => void) =>
  Alert.alert(`¿Borrar lo que comiste en ${SLOT_TITLES[slot.slot].toLowerCase()}?`, "La comida vuelve a quedar pendiente.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Borrar", style: "destructive", onPress: onConfirm },
  ]);

