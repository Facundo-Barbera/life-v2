import type { DoseEvent, Medication } from "@/contract";
import { useState } from "react";
import { View } from "react-native";
import { SwipeRow } from "@/dieta/ui/SwipeRow";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { clockOf, doseText, HISTORY_DAYS, historyByDay, historyDayTitle, KIND_SYMBOL, medicationSummary, scheduledLabel, STATUS_LABEL } from "../model";

/** «Quedan pocas: Magnesio (4)». */
export function LowStockNote({ medications }: { medications: Medication[] }) {
  const { colors } = useTheme();
  if (!medications.length) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Icon name="exclamationmark.triangle.fill" size={12} tint={colors.warning} />
      <Text variant="footnote" style={{ color: colors.warning, flex: 1 }} numberOfLines={2}>
        Quedan pocas: {medications.map((m) => `${m.name}${m.stock != null ? ` (${Math.round(m.stock)})` : ""}`).join(", ")}
      </Text>
    </View>
  );
}

/** «Lo que tomas»: medicines, then supplements; a row opens its editor. */
export function CabinetPanel({ medications, lowStock, onOpen }: { medications: Medication[]; lowStock: Medication[]; onOpen: (m: Medication) => void }) {
  const { colors, hairline } = useTheme();
  const groups = [
    { title: "Medicamentos", meds: medications.filter((m) => m.kind === "medicamento") },
    { title: "Suplementos", meds: medications.filter((m) => m.kind === "suplemento") },
  ].filter((g) => g.meds.length);
  return (
    <Panel style={{ gap: 10 }} testID="cabinet">
      <PanelHeader title="Lo que tomas" />
      <LowStockNote medications={lowStock} />
      {groups.map((g) => (
        <View key={g.title}>
          <Text variant="labelSmall" color="textTertiary" style={{ paddingVertical: 4 }}>
            {g.title}
          </Text>
          {g.meds.map((m, i) => (
            <PressableScale
              key={m.id}
              feedback="select"
              onPress={() => onOpen(m)}
              testID={`medication-${m.id}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8, borderTopWidth: i ? hairline : 0, borderTopColor: colors.separator, opacity: m.active ? 1 : 0.6 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                <Icon name={KIND_SYMBOL[m.kind]} size={16} color={m.active ? "accentText" : "textSecondary"} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {m.name}
                </Text>
                <Text variant="footnote" color="textSecondary" numberOfLines={2}>
                  {medicationSummary(m)}
                </Text>
              </View>
              {m.stock != null ? (
                <View
                  accessibilityLabel={`Quedan ${Math.round(m.stock)} dosis`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, height: 24, borderRadius: 6, backgroundColor: colors.surfaceRaised }}
                >
                  {m.lowStock ? <Icon name="exclamationmark.triangle.fill" size={10} tint={colors.warning} /> : null}
                  <Text variant="numberSmall" style={{ fontSize: 14, color: m.lowStock ? colors.warning : colors.textSecondary }}>
                    {Math.round(m.stock)}
                  </Text>
                </View>
              ) : null}
              <Icon name="chevron.right" size={12} color="textTertiary" />
            </PressableScale>
          ))}
        </View>
      ))}
    </Panel>
  );
}

const STATUS_ICON: Record<string, { name: SFSymbol; tone: "accentText" | "textSecondary" | "warning" }> = {
  tomada: { name: "checkmark.circle.fill", tone: "accentText" },
  omitida: { name: "xmark.circle.fill", tone: "textSecondary" },
  pospuesta: { name: "clock.badge.exclamationmark", tone: "warning" },
  pendiente: { name: "circle", tone: "textSecondary" },
};

const COLLAPSED_DAYS = 7;

/** Every dose logged in the last 60 days by day, newest first; swipe a row to remove a mistaken log. */
export function HistoryPanel({ history, medications, today, onRemove }: { history: DoseEvent[]; medications: Medication[]; today: string; onRemove: (e: DoseEvent) => void }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const days = historyByDay(history);
  const shown = expanded ? days : days.slice(0, COLLAPSED_DAYS);
  const byId = new Map(medications.map((m) => [m.id, m]));
  return (
    <Panel style={{ paddingHorizontal: 0, gap: 10, overflow: "hidden" }} testID="medication-history">
      <View style={{ paddingHorizontal: 14 }}>
        <PanelHeader title="Historial" trailing={history.length ? `${history.filter((d) => d.status === "tomada").length} tomas · ${HISTORY_DAYS} días` : undefined} />
      </View>
      {!days.length ? (
        <Text variant="subhead" color="textSecondary" style={{ paddingHorizontal: 14 }}>
          Aún no registras ninguna toma.
        </Text>
      ) : (
        shown.map((d) => (
          <View key={d.date} style={{ gap: 2 }}>
            <Text variant="labelSmall" color="textTertiary" style={{ paddingHorizontal: 14, paddingBottom: 2 }}>
              {historyDayTitle(d.date, today)}
            </Text>
            {d.doses.map((dose) => {
              const m = byId.get(dose.medicationId);
              const icon = STATUS_ICON[dose.status] ?? STATUS_ICON.pendiente!;
              const tint = icon.tone === "warning" ? colors.warning : colors[icon.tone];
              return (
                <SwipeRow key={dose.id} onDelete={() => onRemove(dose)} menuTitle={m?.name}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Icon name={icon.name} size={18} tint={tint} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text variant="subhead" numberOfLines={1}>
                        {m?.name ?? "Medicamento eliminado"}
                      </Text>
                      <Text variant="meta" color="textSecondary" numberOfLines={1}>
                        {[STATUS_LABEL[dose.status], m ? doseText(m) : null, scheduledLabel(dose.scheduledTime)].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    {dose.takenAt ? (
                      <Text variant="numberSmall" style={{ fontSize: 14, color: colors.textSecondary }}>
                        {clockOf(new Date(dose.takenAt))}
                      </Text>
                    ) : null}
                  </View>
                </SwipeRow>
              );
            })}
          </View>
        ))
      )}
      {days.length > COLLAPSED_DAYS ? (
        <View style={{ paddingHorizontal: 14 }}>
          <Button title={expanded ? "Ver menos" : "Ver todo el historial"} onPress={() => setExpanded((e) => !e)} />
        </View>
      ) : null}
    </Panel>
  );
}
