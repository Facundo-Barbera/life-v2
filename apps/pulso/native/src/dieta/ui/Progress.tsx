import type { DailySummary, WaterSettings } from "@/contract";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme";
import { Panel, PanelHeader } from "@/ui/Panel";
import { EmptyState } from "@/ui/States";
import { StatCell } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { int, waterFormat, weekdayShort } from "../model";

const onTarget = (d: DailySummary) => {
  if (!d.entries) return false;
  if (d.zones) return d.inZone;
  const t = d.targets?.kcal ?? 0;
  return t > 0 && Math.abs(d.totals.kcal - t) / t <= 0.1;
};

/** «Progreso»: the last 7 days against the kcal zone, the averages, and water (NutritionProgressSection.swift). */
export function ProgressSection({ days, water, settings, waterGoal }: { days: DailySummary[]; water: Record<string, number>; settings: WaterSettings | null; waterGoal: number }) {
  const logged = days.filter((d) => d.entries > 0);
  const waters = Object.values(water).filter((ml) => ml > 0);
  if (!logged.length && !waters.length) return <EmptyState icon="chart.bar" title="Tu semana aparece aquí" message="Registra comidas y agua y verás cómo vas día a día." />;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const kcal = mean(logged.map((d) => d.totals.kcal));
  const protein = mean(logged.map((d) => d.totals.protein));
  const inZone = days.filter(onTarget).length;
  const w = mean(waters);
  return (
    <View style={{ gap: 8 }}>
      <KcalBars days={days} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatCell label="Media diaria" value={kcal == null ? "—" : int(kcal)} unit="kcal" style={{ flex: 1 }} />
        <StatCell label="Proteína media" value={protein == null ? "—" : int(protein)} unit="g" style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatCell label="Días en zona" value={String(inZone)} unit={`de ${days.length}`} style={{ flex: 1 }} />
        <StatCell label="Agua media" value={w == null || !settings ? "—" : waterFormat(settings, w)} style={{ flex: 1 }} />
      </View>
      {waters.length ? <WaterBars days={days.map((d) => d.date)} water={water} goal={waterGoal} settings={settings} /> : null}
    </View>
  );
}

function KcalBars({ days }: { days: DailySummary[] }) {
  const { colors } = useTheme();
  const [sel, setSel] = useState<string | null>(null);
  const last = days.at(-1);
  const zone = last?.targets?.zones?.kcal;
  const target = last?.targets?.kcal ?? 0;
  const top = Math.max(...days.map((d) => d.totals.kcal), zone?.max ?? 0, target, 1) * 1.08;
  const H = 140;
  const y = (v: number) => (v / top) * H;
  const picked = days.find((d) => d.date === sel);
  const inZone = days.filter(onTarget).length;
  return (
    <Panel style={{ gap: 10 }} testID="kcal-bars">
      <PanelHeader title="Últimos 7 días" trailing={picked ? `${onTarget(picked) ? "✓" : "!"} ${int(picked.totals.kcal)} kcal · ${weekdayShort(picked.date)} ${Number(picked.date.slice(8))}` : target ? `${inZone} de ${days.length} en tu zona` : ""} />
      <View style={{ height: H, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {zone?.max != null ? <View style={{ position: "absolute", left: 0, right: 0, bottom: y(zone.min ?? 0), height: y(zone.max) - y(zone.min ?? 0), backgroundColor: colors.positive, opacity: 0.12, borderRadius: 4 }} /> : null}
        {target ? <View style={{ position: "absolute", left: 0, right: 0, bottom: y(target), borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.textSecondary }} /> : null}
        {days.map((d) => {
          const ok = onTarget(d);
          return (
            <Pressable key={d.date} onPress={() => setSel(sel === d.date ? null : d.date)} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: H }}>
              {ok ? (
                <Text variant="labelSmall" color="accentText">
                  ✓
                </Text>
              ) : null}
              <View style={{ width: "100%", height: Math.max(2, y(d.totals.kcal)), borderRadius: 4, backgroundColor: ok ? colors.accent : d.entries ? colors.warning : colors.separator, opacity: sel && sel !== d.date ? 0.4 : 1 }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {days.map((d) => (
          <Text key={d.date} variant="labelSmall" color="textSecondary" style={{ flex: 1, textAlign: "center" }}>
            {weekdayShort(d.date).charAt(0)}
          </Text>
        ))}
      </View>
    </Panel>
  );
}

function WaterBars({ days, water, goal, settings }: { days: string[]; water: Record<string, number>; goal: number; settings: WaterSettings | null }) {
  const { colors } = useTheme();
  const [sel, setSel] = useState<string | null>(null);
  const top = Math.max(...days.map((d) => water[d] ?? 0), goal, 1) * 1.08;
  const H = 90;
  return (
    <Panel style={{ gap: 10 }}>
      <PanelHeader title="Agua" trailing={sel && settings ? `${waterFormat(settings, water[sel] ?? 0)} · ${weekdayShort(sel)}` : ""} />
      <View style={{ height: H, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {goal ? <View style={{ position: "absolute", left: 0, right: 0, bottom: (goal / top) * H, borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.textSecondary }} /> : null}
        {days.map((d) => (
          <Pressable key={d} onPress={() => setSel(sel === d ? null : d)} style={{ flex: 1, height: H, justifyContent: "flex-end" }}>
            <View style={{ height: Math.max(2, ((water[d] ?? 0) / top) * H), borderRadius: 4, backgroundColor: water[d] ? colors.water : colors.separator }} />
          </Pressable>
        ))}
      </View>
    </Panel>
  );
}
