import type { FoodProduct, PortionEstimate } from "@/contract";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { cleanBarcode, dayKey, defaultPortion, eatenAtFor, int, measureText, productPortions, scaleMacros, slotForDrink, slotForHour, type Measure, type MealSlot } from "@/dieta/model";
import { currentReplacing, noteLogged } from "@/dieta/session";
import { ChipPicker, MacroLine, Section, SlotPicker, str } from "@/dieta/ui/forms";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Panel } from "@/ui/Panel";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { useToast } from "@/ui/Toast";

// «Escanear»: a barcode (EAN-8/13, UPC-E, ITF-14) or the code typed by hand,
// looked up on Open Food Facts through the Mac, then how much was eaten and
// it's logged (BarcodeScanView.swift). `?fecha=YYYY-MM-DD` logs on another day.

export default function Escanear() {
  const { para, fecha } = useLocalSearchParams<{ para?: string; fecha?: string }>();
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const { run } = useAction();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [armed, setArmed] = useState(true);
  const handled = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const read = async (raw: string) => {
    const code = cleanBarcode(raw);
    if (!code || handled.current) return;
    handled.current = true;
    haptics.success();
    setArmed(false);
    setBusy(true);
    try {
      const { product } = await run("get_barcode_product", { code }, { refresh: false });
      if (product) setProduct(product);
      else setMessage(`No encontré el código ${code} en Open Food Facts.`);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };
  const again = () => {
    handled.current = false;
    setMessage(null);
    setProduct(null);
    setArmed(true);
  };

  if (product) return <PortionPicker product={product} date={fecha ?? dayKey()} onAnother={again} />;

  const camera = permission?.granted;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingTop: space.lg, paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.md, gap: space.md }}>
        <Header title="Escanear" />
        <View style={{ flex: 1, borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          {camera && armed ? (
            <CameraView
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_e", "itf14"] }}
              onBarcodeScanned={(r) => void read(r.data)}
            />
          ) : null}
          {camera && armed ? <View style={{ width: 250, height: 150, borderRadius: 18, borderWidth: 3, borderColor: colors.accent, borderStyle: "dashed", opacity: 0.85 }} /> : null}
          {!camera ? (
            <View style={{ alignItems: "center", gap: 6, padding: 24 }}>
              <Icon name="camera.badge.ellipsis" size={30} color="textSecondary" />
              <Text variant="headline">Cámara no disponible</Text>
              <Text variant="footnote" color="textSecondary" style={{ textAlign: "center" }}>
                Escribe el código de barras debajo.
              </Text>
            </View>
          ) : null}
          {busy ? (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.scrim }}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : null}
          {message ? (
            <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
              <Panel style={{ gap: 10 }}>
                <Text variant="subhead">{message}</Text>
                <Button title="Escanear otro" icon="barcode.viewfinder" onPress={again} />
              </Panel>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            testID="barcode-typed"
            value={typed}
            onChangeText={setTyped}
            placeholder="Código (EAN)"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            style={{ flex: 1, height: 48, borderRadius: 10, paddingHorizontal: 14, backgroundColor: colors.surface, color: colors.text, fontSize: 16, fontVariant: ["tabular-nums"] }}
          />
          <Button
            title="Buscar"
            variant="accent"
            disabled={typed.replace(/\D/g, "").length < 8 || busy}
            onPress={() => {
              handled.current = false;
              void read(typed);
            }}
            testID="barcode-search"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text variant="label" color="textSecondary">
        {title}
      </Text>
      <Button title="Cerrar" onPress={() => router.back()} />
    </View>
  );
}

function PortionPicker({ product, date, onAnother }: { product: FoodProduct; date: string; onAnother: () => void }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { run } = useAction();
  const unit = product.liquid ? "ml" : "g";
  const replacing = currentReplacing();
  const first = useMemo(() => defaultPortion(product), [product]);
  const [amount, setAmount] = useState(first.amount);
  const [measure, setMeasure] = useState<Measure | null>(first.measure);
  const [words, setWords] = useState("");
  const [estimate, setEstimate] = useState<PortionEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [slot, setSlot] = useState<MealSlot>(replacing?.slot ?? (product.liquid ? slotForDrink(new Date().getHours()) : slotForHour(new Date().getHours())));
  const [saving, setSaving] = useState(false);
  const asked = useRef("");

  // «Cuánto comiste» in words: 900 ms after typing stops, the Mac reads it.
  useEffect(() => {
    const w = words.trim();
    if (!w || w === asked.current) return;
    const timer = setTimeout(async () => {
      asked.current = w;
      try {
        const { estimate } = await run("estimate_barcode_portion", { barcode: product.barcode, amount: w }, { refresh: false });
        if (asked.current !== w) return;
        setEstimate(estimate);
        setEstimateError(null);
        setAmount(estimate.quantity);
        setMeasure(estimate.measure);
      } catch (error) {
        setEstimate(null);
        setEstimateError(describeError(error));
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [words, product.barcode, run]);

  const macros = scaleMacros(product.per100g, amount / 100);
  const change = (next: number) => {
    setAmount(Math.max(0, Math.min(5000, next)));
    if (estimate && next !== estimate.quantity) setEstimate(null);
    if (measure && next !== amount) setMeasure(null);
  };
  const save = async () => {
    setSaving(true);
    try {
      const { meal } = await run("add_meal_entry", {
        name: product.name,
        slot,
        quantity: amount,
        unit,
        ...macros,
        source: "barcode",
        barcode: product.barcode,
        date,
        eatenAt: eatenAtFor(date),
        ...(measure && { measure: { amount: measure.amount, unit: measure.unit, ...(measure.size != null && { size: measure.size }) } }),
      });
      noteLogged([meal.id]);
      toast.show({ message: `${product.name} anotado`, icon: "checkmark.circle.fill", undo: () => run("delete_meal_entry", { id: meal.id }) });
      router.back();
    } catch (error) {
      toast.show({ message: describeError(error), tone: "error" });
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: space.gutter, paddingTop: space.lg, paddingBottom: insets.bottom + 24, gap: space.md }} keyboardShouldPersistTaps="handled">
        <Header title="Porción" />
        <Panel style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={{ width: 56, height: 56 }} /> : <Icon name={product.liquid ? "waterbottle" : "shippingbox"} size={24} color="accentText" />}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="headline" numberOfLines={2}>
              {product.name}
            </Text>
            <Text variant="meta" color="textSecondary">
              {[product.brand, `${int(product.per100g.kcal)} kcal por 100 ${unit}`].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </Panel>
        <Section title="Cuánto comiste" footer={estimateError ?? estimate?.assumption}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput
              testID="portion-words"
              value={words}
              onChangeText={setWords}
              onSubmitEditing={() => setWords((w) => w + " ")}
              placeholder="«una cucharada», «la mitad», «3 galletas»"
              placeholderTextColor={colors.textTertiary}
              style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 13 }}
            />
            {estimate ? <Icon name="checkmark.circle.fill" size={16} color="accentText" /> : null}
          </View>
        </Section>
        <Section title="Cantidad" footer={measure ? measureText(measure) : undefined}>
          <View style={{ paddingVertical: 10, gap: 10 }}>
            <Stepper
              value={amount}
              onChange={(n) => change(n)}
              step={product.liquid ? 50 : 5}
              min={0}
              max={5000}
              unit={unit.toUpperCase()}
              format={(n) => str(n)}
              testID="portion-amount"
            />
            <ChipPicker
              options={productPortions(product).map((p, i) => ({ value: i, label: p.label }))}
              value={productPortions(product).findIndex((p) => p.amount === amount)}
              onChange={(i) => {
                const p = productPortions(product)[i]!;
                setAmount(p.amount);
                setMeasure(p.measure);
                setEstimate(null);
              }}
            />
          </View>
        </Section>
        <Section title="Comida">
          <View style={{ paddingVertical: 10 }}>
            <SlotPicker value={slot} onChange={setSlot} />
          </View>
        </Section>
        <Panel style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="stat">
              {int(macros.kcal)}
              <Text variant="labelSmall" color="textSecondary">
                {" "}
                kcal
              </Text>
            </Text>
            <MacroLine {...macros} />
          </View>
          <Button title="Registrar" icon="plus" variant="accent" busy={saving} disabled={amount <= 0} onPress={save} testID="portion-save" />
        </Panel>
        <Button title="Escanear otro" icon="barcode.viewfinder" onPress={onAnother} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
