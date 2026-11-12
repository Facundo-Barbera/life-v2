import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Chip } from "@/ui/Chip";
import { Panel, PanelHeader } from "@/ui/Panel";
import { useOperation } from "@/data/queries";
import { IconButton } from "@/ui/Button";
import { QueryState } from "@/ui/QueryState";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { SessionSummaryView } from "@/training/ui/summary";

// One logged session (history): its sets by exercise, what Health recorded during it.

export default function SesionPasada() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useTheme();
  const session = useOperation("get_training_session", { id: id ?? "" }, { enabled: !!id });
  const library = useOperation("list_exercise_library", {}, { staleTime: 60 * 60_000 });
  const names = useMemo(() => Object.fromEntries((library.data?.exercises ?? []).map((e) => [e.id, e.name])), [library.data]);
  return (
    <Screen title="SESIÓN" leading={<IconButton icon="chevron.left" onPress={() => router.back()} accessibilityLabel="Atrás" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <QueryState query={session}>
        {(s) => (
          <>
            <Panel style={{ gap: 6 }}>
              <PanelHeader
                title={new Date(s.startedAt).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/\./g, "")}
                trailing={s.merged ? <Chip label="Apple Watch" icon="applewatch" /> : undefined}
              />
              <Text style={[type.largeTitle, { fontSize: 30, lineHeight: 34, letterSpacing: -1 }]} numberOfLines={3}>
                {s.name}
              </Text>
              {s.recorded?.avgHeartRate || s.recorded?.energy ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  {s.recorded?.avgHeartRate ? <Chip label={`${Math.round(s.recorded.avgHeartRate)} lpm media`} icon="heart.fill" tint={colors.heart} /> : null}
                  {s.recorded?.energy ? <Chip label={`${Math.round(s.recorded.energy)} kcal`} icon="flame.fill" tint={colors.energy} /> : null}
                </View>
              ) : null}
            </Panel>
            <SessionSummaryView session={s} names={names} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}
