import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import { useAction } from "@/data/actions";
import { useOperation } from "@/data/queries";
import { DoseRow, useDoseDay, useTakeDose } from "@/features/hoy/doses";
import { usePresentation } from "@/health/access";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Rows } from "@/ui/ListRow";
import { PressableScale } from "@/ui/Pressable";
import { Sheet } from "@/ui/Sheet";
import { EmptyState, LoadingState } from "@/ui/States";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { useToast } from "@/ui/Toast";
import { useRailMetrics } from "./metrics";

type Item = { key: "agua" | "peso" | "dosis" | "escanear"; label: string; symbol: SFSymbol };

const ITEMS: Item[] = [
  { key: "agua", label: "Agua", symbol: "drop.fill" },
  { key: "peso", label: "Peso", symbol: "scalemass.fill" },
  { key: "dosis", label: "Dosis", symbol: "pills.fill" },
  { key: "escanear", label: "Escanear", symbol: "barcode.viewfinder" },
];

/**
 * The rail's long-press: a fan of quick logs (agua, peso, dosis, escanear)
 * over a scrim, without leaving the current screen.
 */
export function QuickLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const rail = useRailMetrics();
  const toast = useToast();
  const { run } = useAction();
  const water = useOperation("get_water_day", {}, { enabled: open });
  usePresentation(open);
  const [sheet, setSheet] = useState<"peso" | "dosis" | null>(null);

  const pick = async (key: Item["key"]) => {
    onClose();
    if (key === "peso" || key === "dosis") return setSheet(key);
    if (key === "escanear") return router.push("/escanear");
    const ml = water.data?.settings.glassMl ?? 250;
    try {
      const { entry, day } = await run("add_water_entry", { amountMl: ml });
      haptics.success();
      toast.show({
        message: `+${ml} ml · ${(day.totalMl / 1000).toFixed(1)} de ${(day.goalMl / 1000).toFixed(1)} L`,
        icon: "drop.fill",
        undo: () => run("delete_water", { id: entry.id }),
      });
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "No se pudo anotar el agua.", tone: "error" });
    }
  };

  // Four tiles on an arc above the rail's middle, 150° → 30°.
  const R = 118;
  return (
    <>
      <Modal transparent visible={open} animationType="none" onRequestClose={onClose}>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ flex: 1, backgroundColor: colors.scrim }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" testID="quicklog-scrim" />
          <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: rail.bottom + rail.height / 2, alignItems: "center" }}>
            {ITEMS.map((item, i) => {
              const a = ((150 - (120 * i) / (ITEMS.length - 1)) * Math.PI) / 180;
              return (
                <View key={item.key} style={{ position: "absolute", transform: [{ translateX: R * Math.cos(a) }, { translateY: -R * Math.sin(a) - 52 }] }}>
                  <Animated.View
                    entering={ZoomIn.springify()
                      .damping(14)
                      .stiffness(220)
                      .delay(i * 35)}
                  >
                    <PressableScale
                      testID={`quicklog-${item.key}`}
                      onPress={() => void pick(item.key)}
                      feedback="press"
                      style={{ alignItems: "center", gap: 6 }}
                    >
                      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                        <Icon name={item.symbol} size={24} color="onAccent" />
                      </View>
                      <Text variant="labelSmall" color="text">
                        {item.label}
                      </Text>
                    </PressableScale>
                  </Animated.View>
                </View>
              );
            })}
          </View>
        </Animated.View>
      </Modal>
      <WeightSheet visible={sheet === "peso"} onClose={() => setSheet(null)} />
      <DoseSheet visible={sheet === "dosis"} onClose={() => setSheet(null)} />
    </>
  );
}

function lastWeight(scans: unknown): number | null {
  const list = Array.isArray(scans) ? scans : (scans as { scans?: unknown[] } | null)?.scans;
  const w = (list?.[0] as { weight?: unknown } | undefined)?.weight;
  return typeof w === "number" ? w : null;
}

function WeightSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const scans = useOperation("list_body_scans", { limit: 1 }, { enabled: visible });
  const [kg, setKg] = useState<number | null>(null);
  const { run, busy } = useAction();
  const toast = useToast();
  const value = kg ?? lastWeight(scans.data) ?? 70;
  const save = async () => {
    try {
      await run("add_body_scan", { weight: value });
      haptics.success();
      toast.show({ message: `Peso anotado: ${value.toFixed(1)} kg`, icon: "scalemass.fill" });
      setKg(null);
      onClose();
    } catch (e) {
      toast.show({ message: e instanceof Error ? e.message : "No se pudo guardar el peso.", tone: "error" });
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Anotar peso" testID="sheet-peso">
      <View style={{ gap: 12 }}>
        <Stepper value={value} onChange={setKg} step={0.1} min={20} max={300} unit="KG" format={(n) => n.toFixed(1)} testID="peso" />
        <Button title="Guardar" variant="accent" size="lg" onPress={() => void save()} busy={busy} testID="peso-save" />
      </View>
    </Sheet>
  );
}

function DoseSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const day = useDoseDay();
  const take = useTakeDose();
  const pending = day.data?.slots.filter((s) => s.status === "pendiente") ?? [];
  const taken = day.data?.slots.filter((s) => s.status === "tomada") ?? [];
  return (
    <Sheet visible={visible} onClose={onClose} title="Dosis de hoy" testID="sheet-dosis">
      {day.data === undefined ? (
        <LoadingState />
      ) : pending.length === 0 ? (
        <EmptyState bare icon="checkmark.seal.fill" title="Nada pendiente" message="Hoy no te queda ninguna dosis por tomar." />
      ) : (
        <Rows>
          {pending.map((s) => (
            <DoseRow key={`${s.medicationId}-${s.slot}`} slot={s} taken={taken} onTake={(slot) => void take(slot)} />
          ))}
        </Rows>
      )}
    </Sheet>
  );
}
