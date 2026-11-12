import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useOperation } from "@/data/queries";
import { clock, headerDate } from "@/features/hoy/format";
import { ActivityPanel, RecoveryPanel, SignalCells } from "@/features/hoy/Recovery";
import { TodayPanel } from "@/features/hoy/Today";
import { useHealthSync } from "@/health/sync";
import { MedicationPanel } from "@/medicacion/ui/Card";
import { useNow } from "@/shell/session";
import { useTheme } from "@/theme";
import { IconButton } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { QueryState } from "@/ui/QueryState";
import { Screen } from "@/ui/Screen";
import { LoadingState } from "@/ui/States";

/**
 * Hoy, Tablero's main screen: one dial, three readings,
 * what's on today (the workout) and Medicación's doses, each one tap away.
 */
export default function Hoy() {
  const { colors, space } = useTheme();
  const daily = useOperation("get_daily", { days: 15 });
  const health = useHealthSync();
  const now = useNow(false);
  const [pulling, setPulling] = useState(false);

  const engineUpdated = daily.data?.days.reduce((m, d) => Math.max(m, d.updatedAt), 0) || null;
  const syncedAt = health.lastSyncAt ?? engineUpdated;
  const chip = health.syncing ? "SALUD …" : health.error ? "SALUD ⚠" : syncedAt ? `SALUD ${clock(new Date(syncedAt))}` : "SALUD";

  return (
    <Screen
      title={headerDate(new Date(now))}
      refreshing={pulling}
      onRefresh={() => {
        // The spinner covers the engine's answer only; the Salud sync (which may wait
        // on a permission sheet) shows on the chip and refreshes Hoy when it lands.
        setPulling(true);
        void daily.refetch().finally(() => setPulling(false));
        void health.sync().then(() => daily.refetch());
      }}
      accessory={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Chip
            label={chip}
            dot={health.error ? colors.warning : health.syncing ? colors.textSecondary : true}
            onPress={health.available ? () => void health.sync() : undefined}
            testID="salud-chip"
          />
          <IconButton icon="gearshape" size={28} onPress={() => router.push("/sistema")} accessibilityLabel="Ajustes" testID="sistema" />
        </View>
      }
    >
      <QueryState
        query={daily}
        loading={
          <View style={{ gap: space.sm }}>
            <LoadingState lines={3} height={260} />
            <LoadingState lines={1} />
          </View>
        }
      >
        {(d) => (
          <View style={{ gap: space.sm }}>
            <RecoveryPanel daily={d} />
            <SignalCells daily={d} />
          </View>
        )}
      </QueryState>
      <TodayPanel />
      <MedicationPanel />
      {daily.data ? <ActivityPanel day={daily.data.days.find((x) => x.date === daily.data.readiness.date)} /> : null}
    </Screen>
  );
}
