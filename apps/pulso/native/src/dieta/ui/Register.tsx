import type { FrequentFood, PlanSlot, SavedDish } from "@/contract";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTheme } from "@/theme";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { amountText, int, SLOT_TITLES, slotForHour, slotItems, slotWhat, type MealSlot } from "../model";
import type { MealInput } from "../useDieta";
import { frequentInput, FoodRow } from "./Editors";
import { Section, SlotPicker } from "./forms";
import { MiniButton } from "./Meals";
import { showMenu } from "./SwipeRow";

export type RegisterRoute = { kind: "scan" } | { kind: "snack" } | { kind: "dish" } | { kind: "plan" } | { kind: "manual"; name: string } | { kind: "dishLog"; dish: SavedDish };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * «Registrar» (RegisterSheet.swift): search, the ways in (photo, scan, snack,
 * dish, plan, by hand), the next planned meal, my dishes and the frequent
 * foods, one tap each. It stays open: a breakfast of three things is three taps.
 */
export function Register({
  dishes,
  frequent,
  next,
  replacing,
  onRoute,
  onLog,
  onLogDish,
  onEatNext,
}: {
  dishes: SavedDish[];
  frequent: FrequentFood[];
  next: PlanSlot | null;
  replacing: PlanSlot | null;
  onRoute: (r: RegisterRoute) => void;
  onLog: (input: MealInput) => Promise<unknown>;
  onLogDish: (dish: SavedDish, scale: number, slot: MealSlot) => Promise<unknown>;
  onEatNext: (slot: PlanSlot) => Promise<unknown>;
}) {
  const { colors, hairline } = useTheme();
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<MealSlot>(replacing?.slot ?? slotForHour(new Date().getHours()));
  const [done, setDone] = useState<Set<string>>(new Set());
  const [planEaten, setPlanEaten] = useState(false);
  const q = fold(query.trim());
  const myDishes = dishes.filter((d) => !q || fold(d.name).includes(q));
  const foods = frequent.filter((f) => !q || fold(f.name).includes(q));
  const mark = (id: string) => setDone((s) => new Set(s).add(id));
  const chips: { label: string; icon: SFSymbol; route: RegisterRoute; hidden?: boolean }[] = [
    { label: "Escanear", icon: "barcode.viewfinder", route: { kind: "scan" } },
    { label: "Snack o bebida", icon: "cup.and.saucer", route: { kind: "snack" } },
    { label: "Crear platillo", icon: "fork.knife.circle", route: { kind: "dish" } },
    { label: "Del plan", icon: "list.bullet.clipboard", route: { kind: "plan" }, hidden: !!replacing },
    { label: "A mano", icon: "square.and.pencil", route: { kind: "manual", name: query.trim() } },
  ];
  return (
    <View style={{ gap: 12 }}>
      {replacing ? (
        <Section title={`Tu ${SLOT_TITLES[replacing.slot].toLowerCase()} de verdad`} footer="Registra lo que comiste; al cerrar, es lo que comiste en esa comida.">
          <Text variant="footnote" color="textSecondary" style={{ paddingVertical: 10 }}>
            Planeado: {slotWhat(replacing)}
          </Text>
        </Section>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface, borderWidth: hairline, borderColor: colors.separator }}>
        <Icon name="magnifyingglass" size={14} color="textSecondary" />
        <TextInput
          testID="register-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar o escribir un alimento"
          placeholderTextColor={colors.textTertiary}
          style={{ flex: 1, color: colors.text, fontSize: 15 }}
          returnKeyType="done"
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {chips
          .filter((c) => !c.hidden)
          .map((c) => (
            <PressableScale
              key={c.label}
              testID={`register-${c.route.kind}`}
              onPress={() => onRoute(c.route)}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surfaceRaised, borderWidth: hairline, borderColor: colors.separator }}
            >
              <Icon name={c.icon} size={12} color="accentText" />
              <Text variant="meta">{c.label}</Text>
            </PressableScale>
          ))}
      </View>
      <Section title="Momento">
        <View style={{ paddingVertical: 8 }}>
          <SlotPicker value={slot} onChange={setSlot} />
        </View>
      </Section>
      {!replacing && !q && next && !planEaten ? (
        <Section title={`Siguiente en tu plan · ${SLOT_TITLES[next.slot]} · ${int(next.macros.kcal)} kcal`}>
          {slotItems(next).map((i) => (
            <View key={i.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
              <Text variant="subhead">{i.name}</Text>
              <Text variant="meta" color="textSecondary">
                {amountText({ quantity: i.quantity, unit: i.unit, measure: null })}
              </Text>
            </View>
          ))}
          <View style={{ paddingVertical: 10 }}>
            <MiniButton accent icon="checkmark" title="Comí lo del plan" onPress={() => void onEatNext(next).then(() => setPlanEaten(true))} />
          </View>
        </Section>
      ) : null}
      {myDishes.length ? (
        <Section title="Mis platillos">
          {myDishes.map((d) => (
            <Pressable
              key={d.id}
              onLongPress={() =>
                showMenu(
                  [
                    { title: "Media porción", onPress: () => void onLogDish(d, 0.5, slot).then(() => mark(d.id)) },
                    { title: "Ajustar esta vez…", onPress: () => onRoute({ kind: "dishLog", dish: d }) },
                  ],
                  d.name,
                )
              }
            >
              <FoodRow
                title={d.name}
                detail={`${d.components.length} ingrediente${d.components.length === 1 ? "" : "s"} · ${int(d.macros.kcal)} kcal`}
                icon="fork.knife.circle"
                done={done.has(d.id)}
                onPress={() => void onLogDish(d, 1, slot).then(() => mark(d.id))}
              />
            </Pressable>
          ))}
        </Section>
      ) : null}
      {foods.length ? (
        <Section title={q ? "Resultados" : "Frecuentes"}>
          {foods.slice(0, 30).map((f) => (
            <FoodRow
              key={f.name}
              testID={`frequent-${f.name}`}
              title={f.name}
              detail={`${amountText(f)} · ${int(f.kcal)} kcal`}
              icon={f.unit === "ml" ? "drop" : "fork.knife"}
              done={done.has(f.name)}
              onPress={() => void onLog(frequentInput(f, slot)).then((r) => r && mark(f.name))}
            />
          ))}
        </Section>
      ) : !q ? (
        <View style={{ alignItems: "center", paddingVertical: 16, gap: 4 }}>
          <Text variant="headline">Aún no hay frecuentes</Text>
          <Text variant="footnote" color="textSecondary" style={{ textAlign: "center" }}>
            Lo que registres aparecerá aquí para añadirlo en un toque.
          </Text>
        </View>
      ) : null}
      {q ? (
        <View style={{ gap: 6 }}>
          <MiniButton accent icon="plus" title={`Añadir «${query.trim()}» a mano`} onPress={() => onRoute({ kind: "manual", name: query.trim() })} testID="register-add-manual" />
          {!foods.length ? (
            <Text variant="footnote" color="textSecondary">
              No está entre tus frecuentes. Escribe sus macros.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
