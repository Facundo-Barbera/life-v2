import type { BodyScan } from "@/contract";
import { useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { showMenu } from "@/dieta/ui/SwipeRow";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { dec, delta, olderWith, shortDate, splitHistory } from "../model";
import { DeltaText } from "./Cards";

const weekday = (ms: number) => new Date(ms).toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
const time = (ms: number) => new Date(ms).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });

function useDeleteMenu(onDelete: (s: BodyScan) => void) {
  return (s: BodyScan) => showMenu([{ title: "Borrar medición", destructive: true, onPress: () => onDelete(s) }], shortDate(s.measuredAt));
}

/** «Escaneos»: InBody and manual composition entries, each a rich row with its numbers and the change from the scan before. */
export function ScansCard({ scans, onDelete }: { scans: BodyScan[]; onDelete: (s: BodyScan) => void }) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const { full } = splitHistory(scans);
  const menu = useDeleteMenu(onDelete);
  if (!full.length) return null;
  const list = all ? full : full.slice(0, 5);
  return (
    <Panel style={{ paddingBottom: 6 }} testID="body-scans">
      <PanelHeader title="Escaneos" trailing={`${full.length}`} />
      {list.map((s, n) => {
        const inbody = s.source === "inbody";
        const cells: { label: string; value: number | null; unit: string; d: number; key: "weight" | "percentBodyFat" | "skeletalMuscleMass" | "bodyFatMass"; lower: boolean }[] = [
          { label: "Peso", value: s.weight, unit: "kg", d: 1, key: "weight", lower: true },
          { label: "Grasa", value: s.percentBodyFat, unit: "%", d: 1, key: "percentBodyFat", lower: true },
          { label: "Músculo", value: s.skeletalMuscleMass, unit: "kg", d: 1, key: "skeletalMuscleMass", lower: false },
          { label: "M. grasa", value: s.bodyFatMass, unit: "kg", d: 1, key: "bodyFatMass", lower: true },
        ];
        const i = scans.indexOf(s);
        if (!inbody)
          return (
            <PressableScale key={s.id ?? n} feedback={null} onLongPress={() => menu(s)} accessibilityHint="Mantén pulsado para borrar" style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.separator }} testID={`scan-${n}`}>
              <Icon name="square.and.pencil" size={12} color="textTertiary" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="meta" color="textSecondary">
                  {shortDate(s.measuredAt)} · {time(s.measuredAt)} · Manual
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {cells.slice(1).filter((c) => c.value != null).map((c) => `${c.label} ${dec(c.value!)} ${c.unit}`).join("  ·  ")}
                </Text>
              </View>
              <Text variant="numberSmall" style={{ fontSize: 15 }}>
                {s.weight != null ? dec(s.weight) : "—"}
                <Text variant="labelSmall" color="textSecondary">
                  {" kg"}
                </Text>
              </Text>
            </PressableScale>
          );
        return (
          <PressableScale key={s.id ?? n} feedback={null} onLongPress={() => menu(s)} accessibilityHint="Mantén pulsado para borrar" style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.separator, gap: 10 }} testID={`scan-${n}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: inbody ? colors.accent : colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                <Icon name={inbody ? "qrcode.viewfinder" : "square.and.pencil"} size={15} color={inbody ? "onAccent" : "textSecondary"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="rowTitle">{shortDate(s.measuredAt)}</Text>
                <Text variant="meta" color="textSecondary" style={{ fontSize: 10 }}>
                  {inbody ? `InBody${s.device ? ` ${s.device}` : ""}` : "Manual"} · {weekday(s.measuredAt)} {time(s.measuredAt)}
                </Text>
              </View>
              {s.inbodyScore != null ? (
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="numberSmall">{dec(s.inbodyScore, 0)}</Text>
                  <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 8.5 }}>
                    Puntos
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {cells.map((c) => (
                <View key={c.label} style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.surfaceRaised, gap: 2 }}>
                  <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 8.5 }} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text variant="numberSmall" style={{ fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit>
                    {c.value != null ? dec(c.value, c.d) : "—"}
                    {c.value != null ? <Text variant="labelSmall" color="textSecondary">{` ${c.unit}`}</Text> : null}
                  </Text>
                  <DeltaText d={delta(c.value, olderWith(scans, i, c.key), c.lower)} unit="" small />
                </View>
              ))}
            </View>
          </PressableScale>
        );
      })}
      {full.length > 5 ? (
        <PressableScale onPress={() => setAll((a) => !a)} style={{ alignItems: "center", paddingVertical: 10 }}>
          <Text variant="button" color="accentText">
            {all ? "Ver menos" : `Ver los ${full.length}`}
          </Text>
        </PressableScale>
      ) : null}
    </Panel>
  );
}

/** «Pesajes»: weigh-ins with only a weight, one compact line each; three shown until opened. */
export function WeighInsCard({ scans, onDelete }: { scans: BodyScan[]; onDelete: (s: BodyScan) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const { weighIns } = splitHistory(scans);
  const menu = useDeleteMenu(onDelete);
  if (!weighIns.length) return null;
  const list = open ? weighIns : weighIns.slice(0, 3);
  return (
    <Panel style={{ paddingBottom: 6 }} testID="body-weighins">
      <PanelHeader title="Pesajes" trailing={`${weighIns.length}`} />
      <View style={{ marginTop: 6 }}>
        {list.map((s, n) => {
          const i = scans.indexOf(s);
          return (
            <PressableScale key={s.id ?? n} feedback={null} onLongPress={() => menu(s)} accessibilityHint="Mantén pulsado para borrar" style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: n ? 1 : 0, borderTopColor: colors.separator }} testID={`weighin-${n}`}>
              <Icon name="scalemass" size={12} color="textTertiary" />
              <Text variant="meta" color="textSecondary" style={{ width: 120 }}>
                {shortDate(s.measuredAt)} · {time(s.measuredAt)}
              </Text>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <DeltaText d={delta(s.weight, olderWith(scans, i, "weight"), true)} unit="kg" small />
              </View>
              <Text variant="numberSmall" style={{ fontSize: 15, minWidth: 64, textAlign: "right" }}>
                {s.weight != null ? dec(s.weight) : "—"}
                <Text variant="labelSmall" color="textSecondary">
                  {" kg"}
                </Text>
              </Text>
            </PressableScale>
          );
        })}
      </View>
      {weighIns.length > 3 ? (
        <PressableScale onPress={() => setOpen((o) => !o)} style={{ alignItems: "center", paddingVertical: 10 }}>
          <Text variant="button" color="accentText">
            {open ? "Ver menos" : `Ver los ${weighIns.length}`}
          </Text>
        </PressableScale>
      ) : null}
    </Panel>
  );
}
