import type { MealEntry, PlanSlot } from "@/contract";
import { useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Text, TintedText } from "@/ui/Text";
import { amountText, groupLogged, hm, int, moments, SLOT_TITLES, sumMacros, type Logged } from "../model";
import { SwipeRow, type MenuAction } from "./SwipeRow";

export type EntryActions = {
  onAmount: (meal: MealEntry) => void;
  onDelete: (meal: MealEntry) => void;
  /** Plan slots an extra can move to («Mover a la cena»). */
  moveTargets?: PlanSlot[];
  onMove?: (slot: PlanSlot, ids: string[]) => void;
  onAddToDish?: (dishId: string, dishName: string, slot: MealEntry["slot"]) => void;
  onSaveDish?: (dishId: string) => void;
};

/** The table's header: «HORA · COMIDA · KCAL · PROT». */
export function TableHead() {
  return (
    <View style={{ flexDirection: "row", gap: 8, minHeight: 26, alignItems: "center" }}>
      <Text variant="labelSmall" color="textSecondary" style={{ width: 44 }}>
        hora
      </Text>
      <Text variant="labelSmall" color="textSecondary" style={{ flex: 1 }}>
        comida
      </Text>
      <Text variant="labelSmall" color="textSecondary" style={{ width: 46, textAlign: "right" }}>
        kcal
      </Text>
      <Text variant="labelSmall" color="textSecondary" style={{ width: 40, textAlign: "right" }}>
        prot
      </Text>
    </View>
  );
}

/** One line of the table: time, what, kcal, protein in its hue. */
export function TableRow({ time, title, detail, kcal, protein, muted, trailing, testID }: { time: string; title: string; detail?: string; kcal: number | null; protein: number | null; muted?: boolean; trailing?: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: "row", gap: 8, alignItems: "center", minHeight: 46, paddingVertical: 6 }}>
      <Text variant="meta" color="textSecondary" style={{ width: 44 }}>
        {time}
      </Text>
      <View style={{ flex: 1 }}>
        <Text variant="subhead" color={muted ? "textSecondary" : "text"} numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text variant="numberSmall" color={muted ? "textSecondary" : "text"} style={{ width: 46, textAlign: "right", fontSize: 15 }}>
        {kcal == null ? "—" : int(kcal)}
      </Text>
      <TintedText variant="numberSmall" tint={muted ? colors.textSecondary : colors.protein} style={{ width: 40, textAlign: "right", fontSize: 15 }}>
        {protein == null ? "—" : int(protein)}
      </TintedText>
      {trailing}
    </View>
  );
}

function entryMenu(meal: MealEntry, a: EntryActions): MenuAction[] {
  return [
    { title: "Cambiar la cantidad", onPress: () => a.onAmount(meal) },
    ...(a.moveTargets ?? []).filter((s) => s.id !== meal.slotId).map((s) => ({ title: `Mover a ${SLOT_TITLES[s.slot].toLowerCase()}`, onPress: () => a.onMove?.(s, [meal.id]) })),
  ];
}

/** A logged food: swipe to delete, tap to change the amount, long-press for more. */
export function EntryRow({ meal, actions, inset }: { meal: MealEntry; actions: EntryActions; inset?: boolean }) {
  return (
    <SwipeRow testID={`entry-${meal.name}`} onPress={() => actions.onAmount(meal)} onDelete={() => actions.onDelete(meal)} menu={entryMenu(meal, actions)} menuTitle={meal.name}>
      <TableRow time={inset ? "" : hm(meal.eatenAt)} title={meal.name} detail={amountText(meal)} kcal={meal.kcal} protein={meal.protein} />
    </SwipeRow>
  );
}

/** A logged dish, folded: its components open below with «Añadir» and «Guardar como platillo». */
export function DishRow({ dish, actions }: { dish: Extract<Logged, { kind: "dish" }>; actions: EntryActions }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const total = sumMacros(dish.meals);
  return (
    <View>
      <PressableScale feedback="select" onPress={() => setOpen((o) => !o)}>
        <TableRow
          time={hm(dish.meals[0]!.eatenAt)}
          title={dish.name}
          detail={`${dish.meals.length} ingrediente${dish.meals.length === 1 ? "" : "s"}${open ? "" : ` · ${dish.meals.map((m) => m.name).join(", ")}`}`}
          kcal={total.kcal}
          protein={total.protein}
        />
      </PressableScale>
      {open ? (
        <View style={{ paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.separator, marginLeft: 20 }}>
          {dish.meals.map((m) => (
            <EntryRow key={m.id} meal={m} actions={actions} inset />
          ))}
          <View style={{ flexDirection: "row", gap: 8, paddingVertical: 8 }}>
            {actions.onAddToDish ? <MiniButton icon="plus" title="Añadir" onPress={() => actions.onAddToDish!(dish.id, dish.name, dish.meals[0]!.slot)} /> : null}
            {dish.savedDishId ? (
              <MiniButton icon="bookmark.fill" title="En Mis platillos" />
            ) : actions.onSaveDish ? (
              <MiniButton icon="bookmark" title="Guardar como platillo" onPress={() => actions.onSaveDish!(dish.id)} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function MiniButton({ icon, title, onPress, accent, testID }: { icon?: Parameters<typeof Icon>[0]["name"]; title: string; onPress?: () => void; accent?: boolean; testID?: string }) {
  const { colors, hairline } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: accent ? colors.accent : colors.surfaceRaised, borderWidth: accent ? 0 : hairline, borderColor: colors.separator }}
    >
      {icon ? <Icon name={icon} size={11} color={accent ? "onAccent" : "accentText"} /> : null}
      <Text variant="meta" color={accent ? "onAccent" : "text"}>
        {title}
      </Text>
    </PressableScale>
  );
}

export function LoggedList({ meals, actions }: { meals: MealEntry[]; actions: EntryActions }) {
  return (
    <>
      {groupLogged(meals).map((item) => (item.kind === "dish" ? <DishRow key={item.id} dish={item} actions={actions} /> : <EntryRow key={item.meal.id} meal={item.meal} actions={actions} />))}
    </>
  );
}

/** The day without a plan: one row per moment, tap to open its foods (MealTimeline.swift, in the mock's table). */
export function MealTable({ meals, caffeineMg, alcoholG, actions }: { meals: MealEntry[]; caffeineMg: number; alcoholG: number; actions: EntryActions }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const list = moments(meals);
  const badges = [caffeineMg > 0 ? `${int(caffeineMg)} mg cafeína` : null, alcoholG > 0 ? `${int(alcoholG)} g alcohol` : null].filter(Boolean).join(" · ");
  return (
    <Panel style={{ paddingVertical: 6 }} testID="meal-table">
      {badges ? <PanelHeader title="Comidas" trailing={badges} /> : null}
      <TableHead />
      {list.map((m) => {
        const total = sumMacros(m.meals);
        const expanded = open === m.id;
        return (
          <View key={m.id} style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
            <PressableScale feedback="select" onPress={() => setOpen(expanded ? null : m.id)} testID={`moment-${m.title}`}>
              <TableRow time={hm(m.at)} title={m.title} detail={expanded ? undefined : m.meals.map((x) => x.name).join(", ")} kcal={total.kcal} protein={total.protein} />
            </PressableScale>
            {expanded ? (
              <View style={{ paddingBottom: 6 }}>
                {m.note ? (
                  <View style={{ flexDirection: "row", gap: 6, paddingVertical: 4 }}>
                    <Icon name="sparkles" size={11} color="accentText" />
                    <Text variant="footnote" color="textSecondary" style={{ fontStyle: "italic", flex: 1 }}>
                      {m.note}
                    </Text>
                  </View>
                ) : null}
                <LoggedList meals={m.meals} actions={actions} />
              </View>
            ) : null}
          </View>
        );
      })}
    </Panel>
  );
}
