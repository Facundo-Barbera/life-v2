import type { WaterDay, WaterSettings } from "@/contract";
import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { useTheme } from "@/theme";
import { BlockMeter } from "@/ui/Bars";
import { Button } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Segmented } from "@/ui/Segmented";
import { Stepper } from "@/ui/Stepper";
import { Text, TintedText } from "@/ui/Text";
import { decimal, hm, litres, quickWaterLabel, quickWaterMl, waterFormat, waterPer, waterProgress } from "../model";
import { FieldRow, num, NumberField, Section, str } from "./forms";
import { showMenu, SwipeRow } from "./SwipeRow";

/**
 * Agua: segments filling toward the goal (the mock), the quick add for the
 * person's unit, long-press for other amounts, Deshacer the last one and the
 * settings; tap the meter for today's entries (WaterCard.swift).
 */
export function WaterPanel({ water, onAdd, onRemove, onOther, onEntries, onSettings }: { water: WaterDay; onAdd: (ml: number) => void; onRemove: (id: string) => void; onOther: () => void; onEntries: () => void; onSettings: () => void }) {
  const { colors, hairline } = useTheme();
  const s = water.settings;
  const per = s.unit === "ml" ? 250 : waterPer(s, s.unit);
  const blocks = Math.min(16, Math.max(6, Math.round(water.goalMl / per)));
  const filled = Math.min(blocks, Math.round((water.totalMl / Math.max(water.goalMl, 1)) * blocks));
  const reached = water.totalMl >= water.goalMl;
  const prev = useRef(water.totalMl);
  useEffect(() => {
    if (water.totalMl >= water.goalMl && prev.current < water.goalMl) haptics.success();
    prev.current = water.totalMl;
  }, [water.totalMl, water.goalMl]);
  const last = [...water.entries].sort((a, b) => b.loggedAt - a.loggedAt)[0];
  const presets = [
    { title: `Vaso · ${litres(s.glassMl)}`, ml: s.glassMl },
    { title: `Botella · ${litres(s.bottleMl)}`, ml: s.bottleMl },
    ...(s.bottleMl !== 1000 ? [{ title: "1 L", ml: 1000 }] : []),
  ].filter((p) => p.ml !== quickWaterMl(s));
  const menu = () =>
    showMenu([
      ...presets.map((p) => ({ title: p.title, onPress: () => onAdd(p.ml) })),
      { title: "Otra cantidad…", onPress: onOther },
      ...(last ? [{ title: `Deshacer +${litres(last.amountMl)}`, onPress: () => onRemove(last.id) }] : []),
      { title: "Ajustes de agua", onPress: onSettings },
    ]);
  return (
    <Panel style={{ paddingVertical: 12, gap: 10 }} testID="water-panel">
      <Pressable onPress={onEntries} accessibilityLabel={`Agua: ${waterProgress(s, water.totalMl, water.goalMl)}`} style={{ gap: 10 }}>
        <PanelHeader
          title={
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Icon name={reached ? "checkmark.circle.fill" : "drop.fill"} size={12} tint={colors.water} />
              <TintedText variant="label" tint={colors.water}>
                Agua
              </TintedText>
            </View>
          }
          trailing={
            <Text variant="label" color="textSecondary">
              <Text variant="label">{s.unit === "ml" ? decimal(water.totalMl / 1000, 1) : waterProgress(s, water.totalMl, water.goalMl).split(" de ")[0]}</Text>
              {s.unit === "ml" ? ` / ${decimal(water.goalMl / 1000, 1)} L` : ` / ${waterFormat(s, water.goalMl)}`}
            </Text>
          }
        />
        <BlockMeter count={blocks} filled={filled} color={colors.water} />
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Text variant="meta" color="textSecondary" style={{ flex: 1 }}>
          {reached ? "Objetivo cumplido" : `Quedan ${litres(water.goalMl - water.totalMl)}`}
        </Text>
        <PressableScale
          testID="water-add"
          onPress={() => onAdd(quickWaterMl(s))}
          onLongPress={menu}
          delayLongPress={350}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.surfaceRaised, borderWidth: hairline, borderColor: colors.separator }}
        >
          <Icon name="plus" size={12} tint={colors.water} />
          <Text variant="button" style={{ fontSize: 12 }}>
            {quickWaterLabel(s)}
          </Text>
        </PressableScale>
      </View>
    </Panel>
  );
}

/** «Agua de hoy»: every entry, newest first; swipe to borrar one logged by mistake. */
export function WaterEntries({ water, onRemove }: { water: WaterDay; onRemove: (id: string) => void }) {
  const { colors } = useTheme();
  const list = [...water.entries].sort((a, b) => b.loggedAt - a.loggedAt);
  if (!list.length)
    return (
      <View style={{ alignItems: "center", gap: 4, paddingVertical: 24 }}>
        <Icon name="drop" size={26} color="textSecondary" />
        <Text variant="headline">Sin agua registrada</Text>
        <Text variant="footnote" color="textSecondary">
          Cada vaso que registres aparecerá aquí.
        </Text>
      </View>
    );
  return (
    <View style={{ gap: 8 }}>
      <View style={{ borderRadius: 12, overflow: "hidden" }}>
        {list.map((e, i) => (
          <SwipeRow key={e.id} onDelete={() => onRemove(e.id)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.separator }}>
              <Icon name="drop.fill" size={14} tint={colors.water} />
              <Text variant="subhead" style={{ flex: 1 }}>
                {waterFormat(water.settings, e.amountMl)}
              </Text>
              <Text variant="meta" color="textSecondary">
                {hm(e.loggedAt)}
              </Text>
              <Pressable hitSlop={10} onPress={() => onRemove(e.id)} accessibilityLabel="Borrar">
                <Icon name="trash" size={14} color="textSecondary" />
              </Pressable>
            </View>
          </SwipeRow>
        ))}
      </View>
      <Text variant="footnote" color="textSecondary">
        Desliza a la izquierda para borrar un registro hecho por error.
      </Text>
    </View>
  );
}

const UNITS = [
  { value: "ml" as const, label: "Mililitros" },
  { value: "vaso" as const, label: "Vasos" },
  { value: "botella" as const, label: "Botellas" },
];

/** «Otra cantidad»: in ml, glasses or bottles; up to 5 L. */
export function WaterAmount({ settings, onAdd }: { settings: WaterSettings; onAdd: (ml: number) => void }) {
  const [unit, setUnit] = useState(settings.unit);
  const [amount, setAmount] = useState(unit === "ml" ? "330" : "1");
  const ml = (num(amount) ?? 0) * waterPer(settings, unit);
  return (
    <View style={{ gap: 12 }}>
      <Segmented options={UNITS} value={unit} onChange={(u) => (setUnit(u), setAmount(u === "ml" ? "330" : "1"))} />
      <Section footer={unit !== "ml" ? `${litres(ml)} en total` : undefined}>
        <FieldRow label="Cantidad" last>
          <NumberField value={amount} onChange={setAmount} unit={unit === "ml" ? "ml" : unit === "vaso" ? "vasos" : "bot."} autoFocus testID="water-amount" />
        </FieldRow>
      </Section>
      <Button title="Añadir" variant="accent" wide disabled={ml <= 0 || ml > 5000} onPress={() => onAdd(Math.round(ml))} />
    </View>
  );
}

const BOTTLES = [330, 500, 750, 1000, 1500];

/** «Agua»: the unit counted in, my containers and the daily goal (automatic or fixed). */
export function WaterSettingsForm({ water, onSave }: { water: WaterDay; onSave: (s: WaterSettings) => void }) {
  const s = water.settings;
  const [unit, setUnit] = useState(s.unit);
  const [glass, setGlass] = useState(s.glassMl);
  const [bottle, setBottle] = useState(BOTTLES.includes(s.bottleMl) ? s.bottleMl : 500);
  const [auto, setAuto] = useState(s.goalMl == null);
  const [goal, setGoal] = useState(water.goalMl);
  const next: WaterSettings = { unit, glassMl: glass, bottleMl: bottle, goalMl: auto ? null : goal };
  return (
    <View style={{ gap: 12 }}>
      <Section title="Cuento el agua en">
        <View style={{ paddingVertical: 10 }}>
          <Segmented options={UNITS} value={unit} onChange={setUnit} />
        </View>
      </Section>
      <Section title="Mis envases">
        <View style={{ paddingVertical: 10, gap: 10 }}>
          <Text variant="label" color="textSecondary">
            Vaso
          </Text>
          <Stepper value={glass} onChange={setGlass} step={25} min={100} max={600} unit="ML" />
          <Text variant="label" color="textSecondary">
            Botella
          </Text>
          <Segmented options={BOTTLES.map((b) => ({ value: String(b), label: litres(b) }))} value={String(bottle)} onChange={(v) => setBottle(Number(v))} />
        </View>
      </Section>
      <Section title="Objetivo diario" footer={auto ? "35 ml por kg de tu peso más reciente, entre 2 y 3,7 L, o 2 L si Pulso aún no lo sabe." : `Equivale a ${waterFormat(next, goal)}.`}>
        <FieldRow label="Automático" last={auto}>
          <Switch value={auto} onValueChange={setAuto} />
        </FieldRow>
        {!auto ? (
          <View style={{ paddingVertical: 10 }}>
            <Stepper value={goal} onChange={setGoal} step={250} min={1000} max={6000} unit="ML" format={(n) => str(n)} />
          </View>
        ) : null}
      </Section>
      <Button title="Guardar" variant="accent" wide onPress={() => onSave(next)} />
    </View>
  );
}
