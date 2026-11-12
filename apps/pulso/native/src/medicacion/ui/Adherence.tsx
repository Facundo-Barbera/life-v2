import type { AdherenceDay, AdherenceReport, MedicationAdherence } from "@/contract";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader, Hairline } from "@/ui/Panel";
import { StatCell } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { dayRate, HEATMAP_MIN_DAYS, heatmapColumns, rateText, shortDate, WEEKDAY_LETTERS } from "../model";

/**
 * Constancia: 7/30-day rates and the streak; the 30-day map once there is a
 * week of scheduled doses to read, and each med's rate when there are several.
 */
export function AdherencePanel({ report }: { report: AdherenceReport }) {
  const { colors } = useTheme();
  const o = report.overall;
  if (!report.medications.length) return null;
  return (
    <Panel style={{ gap: 12 }} testID="adherence">
      <PanelHeader title="Constancia" />
      {o.last30.due === 0 ? (
        <Text variant="footnote" color="textSecondary">
          Cuando pase la hora de alguna toma con horario verás aquí cuántas cumples y tu racha.
        </Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <StatCell bare style={{ flex: 1 }} label="7 días" value={rateText(o.last7.rate)} />
            <StatCell bare style={{ flex: 1 }} label="30 días" value={rateText(o.last30.rate)} />
            <StatCell bare style={{ flex: 1 }} label={`Racha · mejor ${o.bestStreak}`} value={o.currentStreak} valueColor={o.currentStreak > 0 ? colors.energy : colors.textSecondary} />
          </View>
          {report.days.filter((d) => d.due > 0).length >= HEATMAP_MIN_DAYS ? (
            <Heatmap days={report.days} />
          ) : (
            <Text variant="footnote" color="textSecondary">
              {o.last30.taken} de {o.last30.due} tomas cumplidas. El mapa del mes aparece tras {HEATMAP_MIN_DAYS} días con tomas.
            </Text>
          )}
          {report.medications.length > 1 ? (
            <>
              <Hairline />
              <PerMedication medications={report.medications} />
            </>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/** The last 30 days as week columns × weekday rows; tap a day to read it. A missed day is marked, not only tinted. */
function Heatmap({ days }: { days: AdherenceDay[] }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const columns = heatmapColumns(days);
  const picked = days.find((d) => d.date === selected);
  const fill = (d: AdherenceDay) => {
    const rate = dayRate(d);
    if (rate == null) return { backgroundColor: colors.surfaceRaised, opacity: 1 };
    if (rate === 0) return { backgroundColor: colors.warning, opacity: 0.3 };
    return { backgroundColor: colors.accent, opacity: 0.25 + rate * 0.75 };
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        <View style={{ gap: 4 }}>
          {WEEKDAY_LETTERS.map((l) => (
            <View key={l} style={{ height: 18, justifyContent: "center" }}>
              <Text variant="labelSmall" color="textTertiary">
                {l}
              </Text>
            </View>
          ))}
        </View>
        {columns.map((col, c) => (
          <View key={c} style={{ flex: 1, gap: 4 }}>
            {col.map((d, r) =>
              d ? (
                <Pressable
                  key={d.date}
                  onPress={() => {
                    haptics.select();
                    setSelected(selected === d.date ? null : d.date);
                  }}
                  accessibilityLabel={`${shortDate(d.date)}: ${d.due ? `${d.taken} de ${d.due} tomas` : "sin tomas"}`}
                  style={{ height: 18, borderRadius: 4, alignItems: "center", justifyContent: "center", borderWidth: selected === d.date ? 1.5 : 0, borderColor: colors.text }}
                >
                  <View style={[{ position: "absolute", inset: 0, borderRadius: 4 }, fill(d)]} />
                  {dayRate(d) === 0 ? <Icon name="xmark" size={8} tint={colors.warning} weight="bold" /> : null}
                </Pressable>
              ) : (
                <View key={`e${r}`} style={{ height: 18 }} />
              ),
            )}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text variant="meta" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {picked ? `${shortDate(picked.date)} · ${picked.due ? `${picked.taken} de ${picked.due} tomas` : "sin tomas"}` : "Últimos 30 días · toca un día"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          {[0, 0.5, 1].map((r) => (
            <View key={r} style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.accent, opacity: 0.25 + r * 0.75 }} />
          ))}
          <Icon name="xmark" size={8} tint={colors.warning} weight="bold" />
          <Text variant="labelSmall" color="textTertiary">
            ninguna
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Each med's 30-day rate as a bar, name above it so a long name never squeezes the bar. */
function PerMedication({ medications }: { medications: MedicationAdherence[] }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {medications.map((m) => {
        const rate = m.last30.rate ?? 0;
        return (
          <View key={m.medicationId} style={{ gap: 6 }} accessible accessibilityLabel={`${m.name}: ${rateText(m.last30.rate)}`}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }}>
                {m.name}
              </Text>
              {m.currentStreak > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Icon name="flame.fill" size={10} tint={colors.energy} />
                  <Text variant="meta" style={{ color: colors.energy }}>
                    {m.currentStreak}
                  </Text>
                </View>
              ) : null}
              <Text style={[type.numberSmall, { color: colors.text, fontSize: 14 }]}>{rateText(m.last30.rate)}</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: "hidden" }}>
              <View style={{ width: `${Math.min(rate, 1) * 100}%`, minWidth: rate > 0 ? 8 : 0, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
