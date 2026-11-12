import type { MealEntry, PlanSlot, SavedDish } from "@/contract";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { addDays, dayKey, hm, shortDay, SLOT_TITLES, type MealSlot } from "@/dieta/model";
import { beginReplacing, currentReplacing, finishReplacing } from "@/dieta/session";
import { useDieta } from "@/dieta/useDieta";
import { ComponentAmount, ComponentForm, DishBuilder, DishLog, QuickAdd, SnackAdd, Targets } from "@/dieta/ui/Editors";
import { MacroHero } from "@/dieta/ui/Hero";
import { MealTable, type EntryActions } from "@/dieta/ui/Meals";
import { confirmDeleteAll, PlanSection, TodayPlan, type SlotHandlers } from "@/dieta/ui/Plan";
import { ProgressSection } from "@/dieta/ui/Progress";
import { Register, type RegisterRoute } from "@/dieta/ui/Register";
import { WeeklyReview } from "@/dieta/ui/Review";
import { showMenu } from "@/dieta/ui/SwipeRow";
import { WaterAmount, WaterEntries, WaterPanel, WaterSettingsForm } from "@/dieta/ui/Water";
import { useTheme } from "@/theme";
import { Button, IconButton } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Panel } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Screen } from "@/ui/Screen";
import { Segmented } from "@/ui/Segmented";
import { Sheet } from "@/ui/Sheet";
import { EmptyState, ErrorState, LoadingState } from "@/ui/States";
import { Text } from "@/ui/Text";

type Section = "hoy" | "plan" | "progreso";
type SheetState =
  | { kind: "register" }
  | { kind: "manual"; name: string }
  | { kind: "snack" }
  | { kind: "dish" }
  | { kind: "dishLog"; dish: SavedDish }
  | { kind: "amount"; meal: MealEntry }
  | { kind: "component"; dishId: string; dishName: string; slot: MealSlot }
  | { kind: "targets" }
  | { kind: "water" }
  | { kind: "waterAmount" }
  | { kind: "waterEntries" };

const TITLES: Record<SheetState["kind"], string> = {
  register: "Registrar",
  manual: "Añadir comida",
  snack: "Snack o bebida",
  dish: "Crear platillo",
  dishLog: "Ajustar esta vez",
  amount: "Cantidad",
  component: "Añadir ingrediente",
  targets: "Objetivos diarios",
  water: "Agua",
  waterAmount: "Otra cantidad",
  waterEntries: "Agua de hoy",
};

/** Dieta (NutritionView.swift in Tablero): rings and the meals table for a day, the plan, the week. */
export default function Dieta() {
  const { space } = useTheme();
  const [date, setDate] = useState(dayKey);
  const d = useDieta(date);
  const [section, setSection] = useState<Section>("hoy");
  const [sheet, setSheetState] = useState<SheetState | null>(null);
  const data = d.day.data;
  const horizon = d.horizon.data?.horizon ?? null;
  const planDay = d.isToday && horizon ? (horizon.days.find((x) => x.date === date) ?? null) : null;
  const nextSlot = planDay?.slots.find((s) => s.status === "planned") ?? null;
  const replacing = currentReplacing();

  /** Closing a sheet ends «Lo cambié por…»: what was logged becomes that meal. */
  const setSheet = (next: SheetState | null) => {
    setSheetState(next);
    if (next === null) {
      const done = finishReplacing();
      if (done) void d.planOp({ op: "replace", date: done.slot.date, slotId: done.slot.id, entryIds: done.ids });
    }
  };
  const route = (r: RegisterRoute) => {
    if (r.kind === "scan") {
      setSheetState(null);
      router.push({ pathname: "/escanear", params: { fecha: date } });
    } else if (r.kind === "plan") {
      setSheet(null);
      setSection("plan");
    } else if (r.kind === "manual") setSheetState({ kind: "manual", name: r.name });
    else if (r.kind === "dishLog") setSheetState({ kind: "dishLog", dish: r.dish });
    else setSheetState({ kind: r.kind });
  };

  const entry: EntryActions = {
    onAmount: (meal) => setSheetState({ kind: "amount", meal }),
    onDelete: (meal) => void d.remove(meal),
    onMove: (slot, ids) => void d.planOp({ op: "replace", date: slot.date, slotId: slot.id, entryIds: ids }),
    onAddToDish: (dishId, dishName, slot) => setSheetState({ kind: "component", dishId, dishName, slot }),
    onSaveDish: (id) => void d.saveDish(id),
  };
  const handlers: SlotHandlers = {
    entry,
    onAction: (slot: PlanSlot, action) => {
      if (action === "eaten") void d.eatSlot(slot);
      else if (action === "replaced") {
        beginReplacing(slot);
        setSheetState({ kind: "register" });
      } else if (action === "ateOut") void d.planOp({ op: "ate_out", date: slot.date, slotId: slot.id });
      else if (action === "skipped") void d.planOp({ op: "skip", date: slot.date, slotId: slot.id });
      else void d.planOp({ op: "no_time_to_cook", date: slot.date, slot: slot.slot });
    },
    onDeleteAll: (slot, entries) => confirmDeleteAll(slot, () => void d.removeMany(entries.map((e) => e.id))),
    onPrepCooked: (prepId, cooked) => void d.planOp({ op: "prep_cooked", prepId, cooked }),
    onUndoRevision: (id) => void d.undoRevision(id),
  };

  const more = () =>
    showMenu([
      { title: "Lista de compras", onPress: () => router.push("/dieta/compras") },
      { title: "Copiar el día anterior", onPress: () => void d.copyPrevious() },
      { title: "Objetivos diarios", onPress: () => setSheet({ kind: "targets" }) },
      ...(data?.water ? [{ title: "Ajustes de agua", onPress: () => setSheet({ kind: "water" }) }] : []),
    ]);

  const footer =
    section === "hoy" && data ? (
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Button title="Escanear" icon="barcode" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/escanear", params: { fecha: date } })} testID="dieta-scan" />
        <Button title="Anota" icon="plus" variant="accent" style={{ flex: 1 }} onPress={() => setSheet({ kind: "register" })} testID="dieta-register" />
      </View>
    ) : null;

  const s = data?.summary;
  return (
    <Screen
      title={`Dieta · ${shortDay(date)}`}
      dayNav={{
        prev: { label: shortDay(addDays(date, -1)).split(" ")[0]!, onPress: () => setDate(addDays(date, -1)) },
        next: d.isToday ? undefined : { label: date === addDays(d.today, -1) ? "HOY" : shortDay(addDays(date, 1)).split(" ")[0]!, onPress: () => setDate(addDays(date, 1)) },
      }}
      accessory={<IconButton icon="ellipsis" size={28} accessibilityLabel="Más" onPress={more} testID="dieta-more" />}
      refreshing={d.day.isRefetching}
      onRefresh={() => void d.refetch()}
      footer={footer}
      footerHeight={footer ? 48 : 0}
      testID="dieta-screen"
    >
      <Segmented
        options={[
          { value: "hoy", label: "Hoy" },
          { value: "plan", label: "Plan" },
          { value: "progreso", label: "Progreso" },
        ]}
        value={section}
        onChange={setSection}
        testID="dieta-section"
      />
      {!d.isToday && section !== "plan" ? (
        <PressableScale onPress={() => setDate(d.today)} style={{ alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center", padding: 6 }}>
          <Icon name="arrow.uturn.backward" size={11} color="accentText" />
          <Text variant="meta" color="accentText">
            Vuelve a hoy
          </Text>
        </PressableScale>
      ) : null}

      {section === "hoy" ? (
        !data ? (
          d.day.isError ? (
            <ErrorState title="Sin conexión" message="No se pudo cargar tu dieta." onRetry={() => void d.refetch()} />
          ) : (
            <LoadingState lines={4} height={180} />
          )
        ) : (
          <>
            <MacroHero summary={data.summary} onTargets={() => setSheet({ kind: "targets" })} />
            {d.isToday && d.review.data?.pending ? <WeeklyReview review={d.review.data} busy={d.busy} onResolve={(p, accept) => void d.resolveProposal(p, accept)} compact /> : null}
            {!planDay && data.plan ? <NextMeal title={nextPlanTitle(data)} onPress={() => setSection("plan")} /> : null}
            <WaterPanel
              water={data.water}
              onAdd={(ml) => void d.addWater(ml)}
              onRemove={(id) => void d.removeWater(id)}
              onOther={() => setSheet({ kind: "waterAmount" })}
              onEntries={() => setSheet({ kind: "waterEntries" })}
              onSettings={() => setSheet({ kind: "water" })}
            />
            {planDay && planDay.slots.length && horizon ? (
              <TodayPlan day={planDay} horizon={horizon} meals={data.meals} handlers={handlers} />
            ) : data.meals.length ? (
              <MealTable meals={data.meals} caffeineMg={s!.caffeineMg} alcoholG={s!.alcoholG} actions={entry} />
            ) : (
              <EmptyState
                icon="fork.knife.circle"
                title={d.isToday ? "Nada registrado hoy" : "Nada registrado este día"}
                message={d.isToday ? "Toca Anota para registrar lo que comiste." : undefined}
                action={{ title: "Copiar el día anterior", icon: "doc.on.doc", onPress: () => void d.copyPrevious() }}
              />
            )}
          </>
        )
      ) : section === "plan" ? (
        horizon ? (
          <PlanSection horizon={horizon} today={d.today} handlers={handlers} />
        ) : d.horizon.isLoading ? (
          <LoadingState lines={3} />
        ) : data?.plan ? (
          <ErrorState title="No se pudo cargar tu plan" message="No se pudieron leer los próximos días." onRetry={() => void d.horizon.refetch()} />
        ) : (
          <EmptyState
            icon="list.bullet.clipboard"
            title="Sin plan de comidas"
            message="Crea tu plan de comidas en pulso.bixku.online y aquí verás cada día lo que toca."
          />
        )
      ) : d.history.data ? (
        <>
          {d.review.data ? <WeeklyReview review={d.review.data} busy={d.busy} onResolve={(p, accept) => void d.resolveProposal(p, accept)} /> : null}
          <ProgressSection days={d.history.data.days} water={d.history.data.water} settings={data?.water.settings ?? null} waterGoal={data?.water.goalMl ?? 0} />
        </>
      ) : (
        <LoadingState lines={3} height={140} />
      )}
      <View style={{ height: space.sm }} />

      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet?.kind === "register" && replacing ? "Lo cambié por…" : sheet ? (sheet.kind === "component" ? `Añadir a ${sheet.dishName}` : TITLES[sheet.kind]) : undefined}>
        {sheet && data ? (
          sheet.kind === "register" ? (
            <Register
              dishes={data.dishes}
              frequent={[...(d.frequent.data?.foods ?? []), ...(d.snacks.data?.foods ?? []).filter((x) => !(d.frequent.data?.foods ?? []).some((f) => f.name === x.name))]}
              next={nextSlot}
              replacing={replacing}
              onRoute={route}
              onLog={d.log}
              onLogDish={(dish, scale, slot) => d.logDish(dish, scale, [], slot)}
              onEatNext={(slot) => d.eatSlot(slot)}
            />
          ) : sheet.kind === "manual" ? (
            <QuickAdd initialName={sheet.name} frequent={d.frequent.data?.foods ?? []} onLog={async (x) => (await d.log(x)) && setSheet(null)} />
          ) : sheet.kind === "snack" ? (
            <SnackAdd frequent={d.snacks.data?.foods ?? []} onLog={async (x) => (await d.log(x)) && setSheet(null)} />
          ) : sheet.kind === "dish" ? (
            <DishBuilder
              frequent={[...(d.frequent.data?.foods ?? []), ...(d.snacks.data?.foods ?? [])]}
              initialSlot={replacing?.slot ?? "comida"}
              onLog={async (name, parts, slot, keep) => (await d.logNewDish(name, parts, slot, keep)) && setSheet(null)}
            />
          ) : sheet.kind === "dishLog" ? (
            <DishLog dish={sheet.dish} onLog={async (scale, removed) => (await d.logDish(sheet.dish, scale, removed, replacing?.slot ?? null)) && setSheet(null)} />
          ) : sheet.kind === "amount" ? (
            <ComponentAmount meal={sheet.meal} onSave={async (f) => (await d.scale(sheet.meal, f)) && setSheet(null)} />
          ) : sheet.kind === "component" ? (
            <ComponentForm slot={sheet.slot} onAdd={async (x) => (await d.addToDish(sheet.dishId, x)) && setSheet(null)} />
          ) : sheet.kind === "targets" ? (
            <Targets targets={data.summary.targets} onSave={async (t) => (await d.attempt(() => d.run("replace_nutrition_targets", t))) && setSheet(null)} />
          ) : sheet.kind === "water" ? (
            <WaterSettingsForm water={data.water} onSave={async (w) => (await d.attempt(() => d.run("set_water_settings", w))) && setSheet(null)} />
          ) : sheet.kind === "waterAmount" ? (
            <WaterAmount settings={data.water.settings} onAdd={(ml) => (setSheet(null), void d.addWater(ml))} />
          ) : (
            <WaterEntries water={data.water} onRemove={(id) => void d.removeWater(id)} />
          )
        ) : null}
      </Sheet>
    </Screen>
  );
}

function nextPlanTitle(data: NonNullable<ReturnType<typeof useDieta>["day"]["data"]>) {
  const plan = data.plan!;
  const eaten = new Set(plan.eatenItemIds);
  const logged = new Set(data.meals.map((m) => m.slot));
  const meals: { slot: MealSlot; name: string | null; items: { id: string; name: string; kcal: number }[]; change?: string }[] = plan.adjustment?.meals ?? plan.day.meals;
  const next = meals.find((m) => !logged.has(m.slot) && !m.items.every((i) => eaten.has(i.id)));
  if (!next) return null;
  const kcal = next.items.reduce((t, i) => t + i.kcal, 0);
  return { slot: SLOT_TITLES[next.slot], detail: `${Math.round(kcal)} kcal · ${next.name ?? next.items.map((i) => i.name).join(", ")}`, adjusted: !!next.change && next.change !== "same" };
}

function NextMeal({ title, onPress }: { title: ReturnType<typeof nextPlanTitle>; onPress: () => void }) {
  if (!title) return null;
  return (
    <PressableScale onPress={onPress}>
      <Panel style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Icon name="fork.knife" size={14} color="accentText" />
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">
            Siguiente: {title.slot} {title.adjusted ? "✦" : ""}
          </Text>
          <Text variant="meta" color="textSecondary" numberOfLines={1}>
            {title.detail}
          </Text>
        </View>
        <Icon name="chevron.right" size={12} color="textSecondary" />
      </Panel>
    </PressableScale>
  );
}

