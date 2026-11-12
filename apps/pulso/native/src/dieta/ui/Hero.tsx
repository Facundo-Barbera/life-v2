import type { DailySummary, NutrientZone } from "@/contract";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Ring } from "@/ui/Gauge";
import { Panel } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Text, TintedText } from "@/ui/Text";
import { int, ringProgress, zoneGeometry, zoneRange, zoneStatus } from "../model";

type Key = "kcal" | "protein" | "carbs" | "fat";
const ROWS: { key: Key; label: string; unit: string }[] = [
  { key: "kcal", label: "kcal", unit: "" },
  { key: "protein", label: "prot", unit: "g" },
  { key: "carbs", label: "carb", unit: "g" },
  { key: "fat", label: "grasa", unit: "g" },
];

/** Concentric rings + legend (the mock), each nutrient with its zone bar and status (MacroHero.swift). */
export function MacroHero({ summary, onTargets }: { summary: DailySummary; onTargets: () => void }) {
  const { colors } = useTheme();
  const hue: Record<Key, string> = { kcal: colors.accent, protein: colors.protein, carbs: colors.carbs, fat: colors.fat };
  const ink: Record<Key, string> = { ...hue, kcal: colors.accentText };
  const sizes = [172, 140, 112, 84];
  const strokes = [12, 10, 10, 10];
  const rem = summary.remaining;
  const targets = summary.targets;
  return (
    <Panel style={{ gap: 12 }} testID="macro-hero">
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <View style={{ width: 172, height: 172, alignItems: "center", justifyContent: "center" }}>
          {ROWS.map((r, i) => (
            <View key={r.key} style={{ position: "absolute" }}>
              <Ring size={sizes[i]} stroke={strokes[i]} color={hue[r.key]} progress={ringProgress(summary.totals[r.key], summary.zones?.[r.key], targets?.[r.key])} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          {ROWS.map((r, i) => {
            const z = summary.zones?.[r.key];
            return (
              <View key={r.key} style={{ paddingVertical: 6, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: colors.separator, gap: 3 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                  <TintedText variant="labelSmall" tint={ink[r.key]}>
                    {r.label}
                  </TintedText>
                  <Text variant="numberSmall">
                    {int(summary.totals[r.key])}
                    <Text variant="labelSmall" color="textSecondary">
                      {targets ? ` /${int(targets[r.key])}${r.unit ? ` ${r.unit}` : ""}` : ""}
                    </Text>
                  </Text>
                </View>
                {z ? <ZoneBar zone={z} color={hue[r.key]} /> : null}
                {z ? (
                  <Text variant="labelSmall" color={z.status === "above" ? "warning" : "textSecondary"} style={{ fontSize: 9 }}>
                    {zoneStatus(z, r.unit || "kcal")}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
      {targets && rem ? (
        <View style={{ padding: 9, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.surfaceRaised }}>
          <Text variant="meta" color="textSecondary">
            {rem.kcal > 0 || rem.protein > 0 ? "Faltan " : ""}
            {rem.kcal > 0 ? <Text variant="meta">{int(rem.kcal)} kcal</Text> : null}
            {rem.kcal > 0 && rem.protein > 0 ? " · " : ""}
            {rem.protein > 0 ? <TintedText variant="meta" tint={colors.protein}>{`${int(rem.protein)} g prot`}</TintedText> : null}
            {rem.kcal > 0 || rem.protein > 0 ? " para la meta" : "Meta del día cumplida"}
          </Text>
        </View>
      ) : null}
      {!targets && !summary.zones ? (
        <PressableScale onPress={onTargets} style={{ padding: 10, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center" }}>
          <Text variant="button">Fijar objetivos</Text>
        </PressableScale>
      ) : null}
      {summary.zones ? (
        <Text variant="labelSmall" color="textTertiary" style={{ fontSize: 9 }}>
          lo que llevas · tu zona · tu meta · de más
        </Text>
      ) : null}
    </Panel>
  );
}

/** The value on a track with the zone band, a tick at the target and stripes past the top. */
export function ZoneBar({ zone, color }: { zone: NutrientZone; color: string }) {
  const { colors } = useTheme();
  const g = zoneGeometry(zone);
  return (
    <View accessibilityLabel={zoneRange(zone, "")} style={{ height: 6, borderRadius: 3, backgroundColor: colors.separator, overflow: "hidden" }}>
      <View style={{ position: "absolute", left: `${g.bandFrom * 100}%`, width: `${(g.bandTo - g.bandFrom) * 100}%`, top: 0, bottom: 0, backgroundColor: colors.positive, opacity: 0.22 }} />
      <View style={{ position: "absolute", left: 0, width: `${(g.fill - g.over) * 100}%`, top: 0, bottom: 0, backgroundColor: color, borderRadius: 3 }} />
      {g.over > 0 ? <View style={{ position: "absolute", left: `${(g.fill - g.over) * 100}%`, width: `${g.over * 100}%`, top: 0, bottom: 0, backgroundColor: colors.warning }} /> : null}
      <View style={{ position: "absolute", left: `${g.target * 100}%`, width: 1.5, top: 0, bottom: 0, backgroundColor: colors.text }} />
    </View>
  );
}
