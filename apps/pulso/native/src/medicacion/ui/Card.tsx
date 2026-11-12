import { router, type Href } from "expo-router";
import { View } from "react-native";
import { useOperation } from "@/data/queries";
import { DoseRow, useDoseDay, useTakeDose } from "@/features/hoy/doses";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { ListRow, Rows } from "@/ui/ListRow";
import { Panel } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Skeleton } from "@/ui/States";
import { Text } from "@/ui/Text";
import { doseText, isPending, MOMENT_TITLE, windowRange } from "../model";
import { useMedicationActions } from "../useMedicacion";
import { LowStockNote } from "./Lists";

const SCREEN = "/medicacion" as Href;
const SHOWN = 3;

/**
 * Medicación on Hoy (MedicationTodayCard.swift): today's doses still to take
 * with «Tomar», what's next, a low-stock note and the as-needed ones; the
 * header opens the full screen.
 */
export function MedicationPanel() {
  const { colors } = useTheme();
  const meds = useOperation("get_medications", {});
  const day = useDoseDay();
  const take = useTakeDose();
  const { takeNow } = useMedicationActions();

  if (meds.data === undefined)
    return (
      <Panel>
        <Skeleton height={36} />
      </Panel>
    );

  const active = meds.data.medications.filter((m) => m.active);
  const lowStock = active.filter((m) => m.lowStock);
  const asNeeded = active.filter((m) => m.schedule.asNeeded);
  const slots = day.data?.slots ?? [];
  const pending = slots.filter(isPending);
  const taken = slots.filter((s) => s.status === "tomada");
  const next = day.data?.next;

  const header = (
    <PressableScale feedback="select" onPress={() => router.push(SCREEN)} testID="medication-card-open" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
      <Icon name="pills.fill" size={13} color="textSecondary" />
      <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
        Medicación
      </Text>
      {slots.length ? (
        <Text variant="numberSmall" style={{ fontSize: 14, color: taken.length === slots.length ? colors.accentText : colors.textSecondary }}>
          {taken.length}/{slots.length}
        </Text>
      ) : null}
      <Icon name="chevron.right" size={11} color="textTertiary" />
    </PressableScale>
  );

  const rows = [];
  for (const slot of pending.slice(0, SHOWN)) rows.push(<DoseRow key={`${slot.medicationId}-${slot.slot}`} slot={slot} taken={taken} onTake={(s) => void take(s)} />);
  if (pending.length > SHOWN)
    rows.push(<ListRow key="more" icon="ellipsis" title={`${pending.length - SHOWN} más por tomar`} subtitle="VER MEDICACIÓN" onPress={() => router.push(SCREEN)} />);
  if (slots.length && !pending.length) rows.push(<ListRow key="done" icon="checkmark.seal.fill" title="Todo tomado por hoy" subtitle={`${taken.length} DE ${slots.length} TOMADAS`} />);
  for (const m of asNeeded.slice(0, 2))
    rows.push(
      <ListRow
        key={`need-${m.id}`}
        icon="hand.tap"
        title={m.name}
        subtitle={`${doseText(m)} · CUANDO HAGA FALTA`}
        trailing={<Button title="Tomé" icon="plus" onPress={() => void takeNow(m)} testID={`card-take-now-${m.id}`} />}
      />,
    );

  return (
    <Panel style={{ paddingVertical: 4, gap: 4 }} testID="medication-card">
      {header}
      {!active.length ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 10 }}>
          <Text variant="subhead" color="textSecondary" style={{ flex: 1 }}>
            Anota tus medicamentos y suplementos y te avisamos.
          </Text>
          <Button title="Añadir" icon="plus" onPress={() => router.push("/medicacion?nuevo=medicamento" as Href)} testID="medication-card-add" />
        </View>
      ) : (
        <>
          {rows.length ? <Rows>{rows}</Rows> : null}
          {!slots.length && !asNeeded.length ? (
            <Text variant="subhead" color="textSecondary" style={{ paddingBottom: 10 }}>
              Hoy no hay tomas programadas.
            </Text>
          ) : null}
          {next?.time && pending.length ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 8 }}>
              <Icon name="bell.badge" size={12} color="textSecondary" />
              <Text variant="footnote" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                {next.window ? `Próxima: ${next.name}, ${MOMENT_TITLE[next.moment].toLowerCase()} (${windowRange(next.window)})` : `Próxima: ${next.name} a las ${next.time}`}
              </Text>
            </View>
          ) : null}
          {lowStock.length ? (
            <View style={{ paddingBottom: 8 }}>
              <LowStockNote medications={lowStock} />
            </View>
          ) : null}
        </>
      )}
    </Panel>
  );
}
