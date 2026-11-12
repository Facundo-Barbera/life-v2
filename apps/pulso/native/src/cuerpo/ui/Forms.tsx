import type { BodyProjection, InputOf } from "@/contract";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { describeError } from "@/data/errors";
import { FieldRow, num, NumberField, Section, str } from "@/dieta/ui/forms";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Segmented } from "@/ui/Segmented";
import { Text } from "@/ui/Text";
import { dec, metricInfo, METRICS, type Metric } from "../model";

export type ScanInput = InputOf<"save_body_scan">;
type Key = "weight" | "skeletalMuscleMass" | "bodyFatMass" | "percentBodyFat" | "bmi" | "visceralFatLevel" | "bmr" | "totalBodyWater" | "ecwRatio" | "inbodyScore" | "protein" | "mineral" | "waistHipRatio";
const MAIN: [Key, string, string][] = [
  ["weight", "Peso", "kg"],
  ["skeletalMuscleMass", "Músculo esquelético", "kg"],
  ["bodyFatMass", "Grasa corporal", "kg"],
  ["percentBodyFat", "Porcentaje de grasa", "%"],
];
const MORE: [Key, string, string][] = [
  ["bmi", "IMC", "kg/m²"],
  ["visceralFatLevel", "Grasa visceral", "nivel"],
  ["bmr", "Metabolismo basal", "kcal"],
  ["totalBodyWater", "Agua corporal", "L"],
  ["ecwRatio", "ECW/TBW", ""],
  ["inbodyScore", "Puntuación InBody", "pts"],
  ["protein", "Proteína", "kg"],
  ["mineral", "Minerales", "kg"],
  ["waistHipRatio", "Cintura/cadera", ""],
];

const DAY = 86_400_000;
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

/** «Nueva medición» or «Tu InBody» (a QR read to confirm): weight, or two of muscle, fat and fat %. */
export function ScanForm({ scan, onSave }: { scan: ScanInput | null; onSave: (input: ScanInput) => Promise<boolean> }) {
  const fromQR = !!scan;
  const [at, setAt] = useState(scan?.measuredAt ?? Date.now());
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries([...MAIN, ...MORE].map(([k]) => [k, str(scan?.[k] as number | null | undefined)])) as Record<Key, string>);
  const [saving, setSaving] = useState(false);
  const filled = (["weight", "skeletalMuscleMass", "bodyFatMass", "percentBodyFat"] as const).filter((k) => num(v[k]) != null).length;
  const ok = num(v.weight) != null || filled >= 2;
  const row = ([k, label, unit]: [Key, string, string], last: boolean) => (
    <FieldRow key={k} label={label} last={last}>
      <NumberField value={v[k]} onChange={(s) => setV({ ...v, [k]: s })} unit={unit} testID={`scan-${k}`} />
    </FieldRow>
  );
  return (
    <View style={{ gap: 12 }}>
      {fromQR ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Icon name="qrcode.viewfinder" size={14} color="accentText" />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            Revisa los valores antes de guardar. Completa lo que el QR no trae, como la grasa visceral o la puntuación.
          </Text>
        </View>
      ) : null}
      <Section title="Composición" footer="Con peso y uno de los dos valores de grasa, Pulso calcula el otro.">
        <FieldRow label="Fecha">
          <Pressable hitSlop={8} onPress={() => setAt(at - DAY)} accessibilityLabel="Día anterior">
            <Icon name="chevron.left" size={14} color="textSecondary" />
          </Pressable>
          <Text variant="meta">{dayLabel(at)}</Text>
          <Pressable hitSlop={8} disabled={at + DAY > Date.now()} onPress={() => setAt(Math.min(at + DAY, Date.now()))} accessibilityLabel="Día siguiente">
            <Icon name="chevron.right" size={14} color={at + DAY > Date.now() ? "textTertiary" : "textSecondary"} />
          </Pressable>
        </FieldRow>
        {MAIN.map((r, i) => row(r, i === MAIN.length - 1))}
      </Section>
      <Section title="Más valores">{MORE.map((r, i) => row(r, i === MORE.length - 1))}</Section>
      <Button
        title="Guardar"
        icon="checkmark"
        variant="accent"
        wide
        busy={saving}
        disabled={!ok}
        testID="scan-save"
        onPress={async () => {
          setSaving(true);
          const values = Object.fromEntries([...MAIN, ...MORE].map(([k]) => [k, num(v[k])]).filter(([, x]) => x != null));
          const ok = await onSave({ ...(scan ?? {}), measuredAt: at, source: scan?.source ?? "manual", ...values } as ScanInput);
          if (!ok) setSaving(false);
        }}
      />
    </View>
  );
}

/** «Meta de …»: a target for one metric; «Quitar meta» clears it. */
export function GoalForm({ initial, goals, projections, onSave }: { initial: Metric; goals: Partial<Record<Metric, number>>; projections: Partial<Record<Metric, BodyProjection>>; onSave: (metric: Metric, target: number | null) => Promise<void> }) {
  const [metric, setMetric] = useState(initial);
  const [target, setTarget] = useState(str(goals[initial]));
  const [saving, setSaving] = useState(false);
  const info = metricInfo(metric);
  const p = projections[metric];
  const t = num(target);
  return (
    <View style={{ gap: 12 }}>
      <Segmented options={METRICS.map((m) => ({ value: m.value, label: m.title }))} value={metric} onChange={(m) => (setMetric(m), setTarget(str(goals[m])))} />
      <Section title={`Meta de ${info.title.toLowerCase()}`} footer={p?.current != null ? `Hoy tu tendencia está en ${dec(p.current)} ${info.unit}.` : undefined}>
        <FieldRow label="Meta" last>
          <NumberField value={target} onChange={setTarget} unit={info.unit} width={120} autoFocus testID="goal-target" />
        </FieldRow>
      </Section>
      {p?.goal && t === goals[metric] ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Icon name="flag.checkered" size={12} color="accentText" />
          <Text variant="footnote" style={{ flex: 1 }}>
            {p.goal.message}
          </Text>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {goals[metric] != null ? <Button title="Quitar meta" icon="trash" onPress={() => void onSave(metric, null)} /> : null}
        <View style={{ flex: 1 }}>
          <Button
            title="Guardar"
            icon="checkmark"
            variant="accent"
            wide
            busy={saving}
            disabled={!t || t <= 0}
            onPress={async () => {
              setSaving(true);
              await onSave(metric, t);
              setSaving(false);
            }}
          />
        </View>
      </View>
    </View>
  );
}

/** «QR de InBody»: the camera reads the sheet's QR, the Mac parses it, the form confirms it (InBodyScanFlow.swift). */
export function InBodyScanner({ parse, onParsed, onManual }: { parse: (payload: string) => Promise<ScanInput>; onParsed: (scan: ScanInput) => void; onManual: () => void }) {
  const { colors } = useTheme();
  const [permission, request] = useCameraPermissions();
  const [phase, setPhase] = useState<"scanning" | "reading" | { failed: string }>("scanning");
  const busy = useRef(false);
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void request();
  }, [permission, request]);
  const read = async (payload: string) => {
    if (busy.current || !payload.trim()) return;
    busy.current = true;
    setPhase("reading");
    try {
      const scan = await parse(payload);
      haptics.success();
      onParsed(scan);
    } catch (error) {
      haptics.error();
      setPhase({ failed: describeError(error) });
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: 320, borderRadius: 18, overflow: "hidden", backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
        {permission?.granted && phase === "scanning" ? (
          <>
            <CameraView style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(r) => void read(r.data)} />
            <View style={{ width: 220, height: 220, borderRadius: 28, borderWidth: 3, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.85)" }} />
          </>
        ) : !permission?.granted ? (
          <View style={{ alignItems: "center", gap: 4, padding: 20 }}>
            <Icon name="camera.badge.ellipsis" size={26} color="textSecondary" />
            <Text variant="headline">Cámara no disponible</Text>
            <Text variant="footnote" color="textSecondary" style={{ textAlign: "center" }}>
              Pulso necesita la cámara para leer el QR. Revisa el permiso en Ajustes.
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: colors.surfaceRaised }}>
        {phase === "reading" ? <ActivityIndicator color={colors.accentText} /> : <Icon name={phase === "scanning" ? "qrcode.viewfinder" : "exclamationmark.triangle.fill"} size={14} color={phase === "scanning" ? "accentText" : "warning"} />}
        <Text variant="subhead" style={{ flex: 1 }}>
          {phase === "scanning" ? "Apunta al QR de tu hoja o pantalla de InBody" : phase === "reading" ? "Leyendo resultado…" : phase.failed}
        </Text>
      </View>
      {typeof phase === "object" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button title="Reintentar" icon="arrow.clockwise" onPress={() => ((busy.current = false), setPhase("scanning"))} />
          <View style={{ flex: 1 }}>
            <Button title="Cargar a mano" icon="square.and.pencil" variant="accent" wide onPress={onManual} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
