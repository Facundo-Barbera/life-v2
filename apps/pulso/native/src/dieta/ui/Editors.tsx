import type { FrequentFood, MealEntry, NutritionTargets, SavedDish } from "@/contract";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Segmented } from "@/ui/Segmented";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import {
  amountText,
  decimal,
  estimateKcal,
  int,
  isHousehold,
  SIZE_PRESETS,
  slotForHour,
  SNACK_PLACEHOLDER,
  SNACK_UNITS,
  snackTotals,
  UNIT_LABEL,
  unitDefaultAmount,
  unitStep,
  zoneRange,
  type MealSlot,
  type MeasureUnit,
} from "../model";
import type { MealInput } from "../useDieta";
import { ChipPicker, FieldRow, MacroLine, num, NumberField, Section, SlotPicker, str, TextField } from "./forms";

/** A frequent food as something to log again in `slot`. */
export const frequentInput = (f: FrequentFood, slot: MealSlot): MealInput => ({
  name: f.name,
  slot,
  quantity: f.quantity,
  unit: f.unit,
  kcal: f.kcal,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
  fiber: f.fiber,
  caffeineMg: f.caffeineMg,
  alcoholG: f.alcoholG,
  barcode: f.barcode,
  source: f.barcode ? "barcode" : "manual",
  ...(f.measure && { measure: { amount: f.measure.amount, unit: f.measure.unit, ...(f.measure.size != null && { size: f.measure.size }) } }),
});

export function FoodRow({ title, detail, done, onPress, icon = "fork.knife", testID }: { title: string; detail: string; done?: boolean; onPress: () => void; icon?: Parameters<typeof Icon>[0]["name"]; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, borderTopWidth: 1, borderTopColor: colors.separator }}>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={13} color="accentText" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="subhead" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="meta" color="textSecondary" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Icon name={done ? "checkmark.circle.fill" : "plus.circle"} size={18} color={done ? "accentText" : "textSecondary"} />
    </Pressable>
  );
}

// ── Manual («A mano», «Añadir comida») ──────────────────────────────────

export function QuickAdd({ initialName, frequent, onLog }: { initialName: string; frequent: FrequentFood[]; onLog: (input: MealInput) => Promise<unknown> }) {
  const [name, setName] = useState(initialName);
  const [slot, setSlot] = useState<MealSlot>(slotForHour(new Date().getHours()));
  const [qty, setQty] = useState("100");
  const [unit, setUnit] = useState<"g" | "ml" | "serving">("g");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [fiber, setFiber] = useState("");
  const [kcal, setKcal] = useState("");
  const [saving, setSaving] = useState(false);
  const estimate = estimateKcal(num(p) ?? 0, num(c) ?? 0, num(f) ?? 0);
  const ok = name.trim() && (num(qty) ?? 0) > 0;
  return (
    <View style={{ gap: 12 }}>
      {frequent.length ? (
        <ChipPicker options={frequent.slice(0, 12).map((x) => ({ value: x.name, label: x.name }))} value={null} onChange={(n) => void onLog(frequentInput(frequent.find((x) => x.name === n)!, slot))} />
      ) : null}
      <Section>
        <TextField value={name} onChange={setName} placeholder="Nombre" autoFocus={!initialName} testID="quick-name" />
      </Section>
      <Section title="Momento">
        <View style={{ paddingVertical: 8 }}>
          <SlotPicker value={slot} onChange={setSlot} />
        </View>
      </Section>
      <Section>
        <FieldRow label="Cantidad">
          <NumberField value={qty} onChange={setQty} testID="quick-qty" />
        </FieldRow>
        <View style={{ paddingVertical: 8 }}>
          <Segmented
            options={[
              { value: "g", label: "g" },
              { value: "ml", label: "ml" },
              { value: "serving", label: "porción" },
            ]}
            value={unit}
            onChange={setUnit}
          />
        </View>
      </Section>
      <Section title="Macros de esta cantidad">
        <FieldRow label="Proteína">
          <NumberField value={p} onChange={setP} unit="g" testID="quick-protein" />
        </FieldRow>
        <FieldRow label="Carbohidratos">
          <NumberField value={c} onChange={setC} unit="g" />
        </FieldRow>
        <FieldRow label="Grasa">
          <NumberField value={f} onChange={setF} unit="g" />
        </FieldRow>
        <FieldRow label="Fibra">
          <NumberField value={fiber} onChange={setFiber} unit="g" />
        </FieldRow>
        <FieldRow label="Energía" last>
          {!kcal && estimate > 0 ? (
            <Pressable onPress={() => setKcal(String(Math.round(estimate)))}>
              <Text variant="meta" color="accentText">
                ≈ {int(estimate)}
              </Text>
            </Pressable>
          ) : null}
          <NumberField value={kcal} onChange={setKcal} unit="kcal" testID="quick-kcal" />
        </FieldRow>
      </Section>
      <Button
        title="Guardar"
        variant="accent"
        wide
        busy={saving}
        disabled={!ok}
        testID="quick-save"
        onPress={async () => {
          setSaving(true);
          await onLog({ name: name.trim(), slot, quantity: num(qty)!, unit, protein: num(p) ?? 0, carbs: num(c) ?? 0, fat: num(f) ?? 0, fiber: num(fiber) ?? 0, kcal: num(kcal) ?? Math.round(estimate), source: "manual" });
          setSaving(false);
        }}
      />
    </View>
  );
}

// ── Snack or drink ───────────────────────────────────────────────────────

export function SnackAdd({ frequent, onLog }: { frequent: FrequentFood[]; onLog: (input: MealInput) => Promise<unknown> }) {
  const [slot, setSlot] = useState<MealSlot>("snack");
  const [unit, setUnit] = useState<MeasureUnit>("taza");
  const [amount, setAmount] = useState(1);
  const [size, setSize] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [m, setM] = useState({ kcal: "", protein: "", carbs: "", fat: "", fiber: "", caffeine: "", abv: "" });
  const [saving, setSaving] = useState(false);
  const household = isHousehold(unit);
  const totals = snackTotals(unit, amount, size, {
    kcal: num(m.kcal),
    protein: num(m.protein) ?? 0,
    carbs: num(m.carbs) ?? 0,
    fat: num(m.fat) ?? 0,
    fiber: num(m.fiber) ?? 0,
    caffeine: num(m.caffeine) ?? 0,
    abv: num(m.abv) ?? 0,
  });
  const set = (k: keyof typeof m) => (v: string) => setM({ ...m, [k]: v });
  const per = unit === "g" || unit === "ml" ? `Por 100 ${unit}` : `Por 1 ${UNIT_LABEL[unit][0]}`;
  return (
    <View style={{ gap: 12 }}>
      {frequent.length ? (
        <Section title="Frecuentes">
          {frequent.slice(0, 6).map((x) => (
            <FoodRow key={x.name} title={x.name} detail={`${amountText(x)} · ${int(x.kcal)} kcal`} icon={x.unit === "ml" ? "drop" : "takeoutbag.and.cup.and.straw"} onPress={() => void onLog(frequentInput(x, slot))} />
          ))}
        </Section>
      ) : null}
      <Stepper value={amount} onChange={setAmount} step={unitStep(unit)} min={unitStep(unit) / 2} max={5000} unit={UNIT_LABEL[unit][amount === 1 ? 0 : 1].toUpperCase()} format={(n) => decimal(n)} testID="snack-amount" />
      <Text variant="meta" color="textSecondary" style={{ textAlign: "center" }}>
        {[household && unit !== "serving" && totals.unit !== "serving" ? `= ${decimal(totals.quantity)} ${totals.unit}` : null, totals.macros.kcal > 0 ? `${int(totals.macros.kcal)} kcal` : null].filter(Boolean).join(" · ")}
      </Text>
      <ChipPicker options={SNACK_UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u][0] }))} value={unit} onChange={(u) => (setUnit(u), setAmount(unitDefaultAmount(u)), setSize(null))} />
      <Section>
        <TextField value={name} onChange={setName} placeholder={`Qué, p. ej. ${SNACK_PLACEHOLDER[unit]}`} testID="snack-name" />
      </Section>
      {household && SIZE_PRESETS[unit] ? (
        <Section title={unit === "unidad" ? "Peso por unidad" : `Tamaño de 1 ${UNIT_LABEL[unit][0]}`}>
          <View style={{ paddingVertical: 8 }}>
            <ChipPicker options={SIZE_PRESETS[unit]!.map((s) => ({ value: s, label: `${s} ml` }))} value={size} onChange={setSize} />
          </View>
        </Section>
      ) : unit === "unidad" ? (
        <Section>
          <FieldRow label="Peso por unidad" last>
            <NumberField value={str(size)} onChange={(v) => setSize(num(v))} unit="g" />
          </FieldRow>
        </Section>
      ) : null}
      <Section title={per} footer="Las bebidas no suman a tu objetivo de agua.">
        <FieldRow label="Energía">
          <NumberField value={m.kcal} onChange={set("kcal")} unit="kcal" />
        </FieldRow>
        <FieldRow label="Proteína">
          <NumberField value={m.protein} onChange={set("protein")} unit="g" />
        </FieldRow>
        <FieldRow label="Carbohidratos">
          <NumberField value={m.carbs} onChange={set("carbs")} unit="g" />
        </FieldRow>
        <FieldRow label="Grasa">
          <NumberField value={m.fat} onChange={set("fat")} unit="g" />
        </FieldRow>
        <FieldRow label="Fibra">
          <NumberField value={m.fiber} onChange={set("fiber")} unit="g" />
        </FieldRow>
        <FieldRow label="Cafeína" last={totals.unit !== "ml"}>
          <NumberField value={m.caffeine} onChange={set("caffeine")} unit="mg" />
        </FieldRow>
        {totals.unit === "ml" ? (
          <FieldRow label="Alcohol (% vol.)" last>
            <NumberField value={m.abv} onChange={set("abv")} unit="%" />
          </FieldRow>
        ) : null}
      </Section>
      <Section title="Momento">
        <View style={{ paddingVertical: 8 }}>
          <SlotPicker value={slot} onChange={setSlot} />
        </View>
      </Section>
      <Button
        title="Guardar"
        variant="accent"
        wide
        busy={saving}
        disabled={!name.trim() || amount <= 0}
        testID="snack-save"
        onPress={async () => {
          setSaving(true);
          await onLog({
            name: name.trim(),
            slot,
            quantity: totals.quantity,
            unit: totals.unit,
            ...totals.macros,
            caffeineMg: totals.caffeineMg || null,
            alcoholG: totals.alcoholG || null,
            source: "manual",
            ...(totals.measure && { measure: { amount: totals.measure.amount, unit: totals.measure.unit, ...(totals.measure.size != null && { size: totals.measure.size }) } }),
          });
          setSaving(false);
        }}
      />
    </View>
  );
}

// ── Dishes ───────────────────────────────────────────────────────────────

/** «Ajustar esta vez»: portion ½–2 and ingredients off, only for this log. */
export function DishLog({ dish, onLog }: { dish: SavedDish; onLog: (scale: number, removed: number[]) => Promise<unknown> }) {
  const [scale, setScale] = useState("1");
  const [removed, setRemoved] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const s = Number(scale);
  const kcal = dish.components.reduce((t, c, i) => (removed.includes(i) ? t : t + c.kcal * s), 0);
  return (
    <View style={{ gap: 12 }}>
      <Text variant="hero" style={{ textAlign: "center" }}>
        {int(kcal)}
        <Text variant="label" color="textSecondary">
          {" "}
          kcal
        </Text>
      </Text>
      <Section title="Porción">
        <View style={{ paddingVertical: 8 }}>
          <Segmented
            options={[
              { value: "0.5", label: "½" },
              { value: "1", label: "1" },
              { value: "1.5", label: "1½" },
              { value: "2", label: "2" },
            ]}
            value={scale}
            onChange={setScale}
          />
        </View>
      </Section>
      <Section title="Ingredientes" footer="Solo esta vez: tu platillo guardado no cambia.">
        {dish.components.map((c, i) => (
          <FieldRow key={i} label={`${c.name} · ${amountText(c)} · ${int(c.kcal * s)} kcal`} last={i === dish.components.length - 1}>
            <Switch value={!removed.includes(i)} onValueChange={(on) => setRemoved((r) => (on ? r.filter((x) => x !== i) : [...r, i]))} />
          </FieldRow>
        ))}
      </Section>
      <Button
        title="Registrar"
        variant="accent"
        wide
        busy={saving}
        disabled={removed.length === dish.components.length}
        onPress={async () => {
          setSaving(true);
          await onLog(s, [...removed].sort((a, b) => a - b));
          setSaving(false);
        }}
      />
    </View>
  );
}

/** «Ingrediente» / «Añadir a …»: one component by hand. */
export function ComponentForm({ slot, onAdd }: { slot: MealSlot; onAdd: (input: MealInput) => Promise<unknown> | void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("100");
  const [unit, setUnit] = useState<"g" | "ml" | "serving">("g");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [kcal, setKcal] = useState("");
  const estimate = estimateKcal(num(p) ?? 0, num(c) ?? 0, num(f) ?? 0);
  return (
    <View style={{ gap: 12 }}>
      <Section>
        <TextField value={name} onChange={setName} placeholder="Nombre" autoFocus />
      </Section>
      <Section>
        <FieldRow label="Cantidad">
          <NumberField value={qty} onChange={setQty} />
        </FieldRow>
        <View style={{ paddingVertical: 8 }}>
          <Segmented
            options={[
              { value: "g", label: "g" },
              { value: "ml", label: "ml" },
              { value: "serving", label: "porción" },
            ]}
            value={unit}
            onChange={setUnit}
          />
        </View>
      </Section>
      <Section>
        <FieldRow label="Proteína">
          <NumberField value={p} onChange={setP} unit="g" />
        </FieldRow>
        <FieldRow label="Carbohidratos">
          <NumberField value={c} onChange={setC} unit="g" />
        </FieldRow>
        <FieldRow label="Grasa">
          <NumberField value={f} onChange={setF} unit="g" />
        </FieldRow>
        <FieldRow label={!kcal && estimate > 0 ? `Energía (≈ ${int(estimate)} kcal)` : "Energía"} last>
          <NumberField value={kcal} onChange={setKcal} unit="kcal" />
        </FieldRow>
      </Section>
      <Button
        title="Añadir"
        variant="accent"
        wide
        disabled={!name.trim() || (num(qty) ?? 0) <= 0}
        onPress={() => void onAdd({ name: name.trim(), slot, quantity: num(qty)!, unit, protein: num(p) ?? 0, carbs: num(c) ?? 0, fat: num(f) ?? 0, fiber: 0, kcal: num(kcal) ?? Math.round(estimate), source: "manual" })}
      />
    </View>
  );
}

/** «Crear platillo»: ingredients by hand or from the frequent ones, logged together and kept in Mis platillos. */
export function DishBuilder({ frequent, initialSlot, onLog }: { frequent: FrequentFood[]; initialSlot: MealSlot; onLog: (name: string | undefined, parts: MealInput[], slot: MealSlot, keep: boolean) => Promise<unknown> }) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [parts, setParts] = useState<MealInput[]>([]);
  const [writing, setWriting] = useState(false);
  const [keep, setKeep] = useState(true);
  const [saving, setSaving] = useState(false);
  const kcal = parts.reduce((t, x) => t + (x.kcal ?? 0), 0);
  if (writing) return <ComponentForm slot={slot} onAdd={(x) => (setParts((p) => [...p, x]), setWriting(false))} />;
  return (
    <View style={{ gap: 12 }}>
      <Section footer="Sin nombre, se nombra solo por lo que lleva.">
        <TextField value={name} onChange={setName} placeholder="Nombre (opcional), p. ej. Batido de proteína con fresas" />
      </Section>
      <Section title="Momento">
        <View style={{ paddingVertical: 8 }}>
          <SlotPicker value={slot} onChange={setSlot} />
        </View>
      </Section>
      <Section title={parts.length ? `Ingredientes · ${int(kcal)} kcal` : "Ingredientes"}>
        {parts.length ? (
          parts.map((x, i) => (
            <FieldRow key={i} label={`${x.name} · ${x.quantity ?? ""} ${x.unit ?? ""}`}>
              <Text variant="meta" color="textSecondary">
                {int(x.kcal ?? 0)} kcal
              </Text>
              <Pressable hitSlop={10} onPress={() => setParts((p) => p.filter((_, j) => j !== i))} accessibilityLabel="Quitar">
                <Icon name="minus.circle.fill" size={16} tint={colors.negative} />
              </Pressable>
            </FieldRow>
          ))
        ) : (
          <Text variant="footnote" color="textSecondary" style={{ paddingVertical: 12 }}>
            Añade lo que lleva
          </Text>
        )}
        <Pressable onPress={() => setWriting(true)} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.separator }}>
          <Text variant="button" color="accentText">
            Escribir un ingrediente
          </Text>
        </Pressable>
      </Section>
      {frequent.length ? (
        <Section title="De tus frecuentes">
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
            {frequent.map((x) => (
              <FoodRow key={x.name} title={x.name} detail={`${amountText(x)} · ${int(x.kcal)} kcal`} onPress={() => setParts((p) => [...p, frequentInput(x, slot)])} />
            ))}
          </ScrollView>
        </Section>
      ) : null}
      <Section>
        <FieldRow label="Guardar en Mis platillos" last>
          <Switch value={keep} onValueChange={setKeep} />
        </FieldRow>
      </Section>
      <Button
        title="Registrar"
        variant="accent"
        wide
        busy={saving}
        disabled={!parts.length}
        onPress={async () => {
          setSaving(true);
          await onLog(name.trim() || undefined, parts, slot, keep);
          setSaving(false);
        }}
      />
    </View>
  );
}

/** «Cantidad»: a new amount for one entry, previewing kcal and protein. */
export function ComponentAmount({ meal, onSave }: { meal: MealEntry; onSave: (factor: number) => Promise<unknown> }) {
  const base = meal.measure?.amount ?? meal.quantity;
  const unit = meal.measure ? UNIT_LABEL[meal.measure.unit][1] : UNIT_LABEL[meal.unit][1];
  const [amount, setAmount] = useState(str(base));
  const [saving, setSaving] = useState(false);
  const a = num(amount) ?? 0;
  const factor = base ? a / base : 0;
  return (
    <View style={{ gap: 12 }}>
      <Section title={meal.name} footer={`${int(meal.kcal * factor)} kcal · ${int(meal.protein * factor)} g proteína`}>
        <FieldRow label="Cantidad" last>
          <NumberField value={amount} onChange={setAmount} unit={unit} autoFocus testID="amount-field" />
        </FieldRow>
      </Section>
      <Button
        title="Guardar"
        variant="accent"
        wide
        busy={saving}
        disabled={a <= 0 || a === base}
        testID="amount-save"
        onPress={async () => {
          setSaving(true);
          await onSave(factor);
          setSaving(false);
        }}
      />
    </View>
  );
}

// ── Targets ──────────────────────────────────────────────────────────────

const TARGET_ROWS = [
  { key: "kcal", label: "Energía", unit: "kcal" },
  { key: "protein", label: "Proteína", unit: "g" },
  { key: "carbs", label: "Carbohidratos", unit: "g" },
  { key: "fat", label: "Grasa", unit: "g" },
  { key: "fiber", label: "Fibra", unit: "g" },
] as const;

/** «Objetivos diarios»: the five targets; a custom zone stays while its target doesn't change. */
export function Targets({ targets, onSave }: { targets: NutritionTargets | null; onSave: (input: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; zones?: Record<string, { min?: number | null; max?: number | null; kind?: "min" | "range" | "max" }> }) => Promise<unknown> }) {
  const [v, setV] = useState<Record<(typeof TARGET_ROWS)[number]["key"], string>>(() => ({
    kcal: str(targets?.kcal),
    protein: str(targets?.protein),
    carbs: str(targets?.carbs),
    fat: str(targets?.fat),
    fiber: str(targets?.fiber),
  }));
  const [saving, setSaving] = useState(false);
  const sum = estimateKcal(num(v.protein) ?? 0, num(v.carbs) ?? 0, num(v.fat) ?? 0);
  const keptZones = useMemo(() => {
    const out: Record<string, { min?: number | null; max?: number | null; kind?: "min" | "range" | "max" }> = {};
    for (const r of TARGET_ROWS) {
      const z = targets?.zones?.[r.key];
      if (z?.custom && num(v[r.key]) === targets?.[r.key]) out[r.key] = { min: z.min, max: z.max, kind: z.kind };
    }
    return out;
  }, [targets, v]);
  return (
    <View style={{ gap: 12 }}>
      <Section footer={`Los macros suman ${int(sum)} kcal. Cada objetivo tiene su zona, la franja verde de los anillos; al cambiarlo, el Coach la recalcula.`}>
        {TARGET_ROWS.map((r, i) => {
          const z = targets?.zones?.[r.key];
          const unchanged = num(v[r.key]) === targets?.[r.key];
          return (
            <View key={r.key}>
              <FieldRow label={r.label} last={i === TARGET_ROWS.length - 1 && !(z && unchanged)}>
                <NumberField value={v[r.key]} onChange={(s) => setV({ ...v, [r.key]: s })} unit={r.unit} keyboard="number-pad" testID={`target-${r.key}`} />
              </FieldRow>
              {z && unchanged ? (
                <Text variant="meta" color="textSecondary" style={{ paddingBottom: 8 }}>
                  Zona: {zoneRange(z, r.unit)}
                  {z.custom ? " · a tu medida" : ""}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Section>
      <MacroLine protein={num(v.protein) ?? 0} carbs={num(v.carbs) ?? 0} fat={num(v.fat) ?? 0} />
      <Button
        title="Guardar"
        variant="accent"
        wide
        busy={saving}
        disabled={num(v.kcal) == null || num(v.protein) == null || num(v.carbs) == null || num(v.fat) == null}
        onPress={async () => {
          setSaving(true);
          await onSave({ kcal: num(v.kcal)!, protein: num(v.protein)!, carbs: num(v.carbs)!, fat: num(v.fat)!, fiber: num(v.fiber) ?? 0, ...(Object.keys(keptZones).length && { zones: keptZones }) });
          setSaving(false);
        }}
      />
    </View>
  );
}
