import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ago, longDate } from "@/dieta/model";
import { SwipeRow } from "@/dieta/ui/SwipeRow";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { useOperation } from "@/data/queries";
import { useTheme } from "@/theme";
import { IconButton } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Panel } from "@/ui/Panel";
import { EmptyState, LoadingState } from "@/ui/States";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { useToast } from "@/ui/Toast";

/** Every change to the diet plan, newest first; a live one swipes (or long-presses) to Deshacer (PlanChangesView.swift). */
export default function Cambios() {
  const { colors } = useTheme();
  const revisions = useOperation("list_plan_revisions", { limit: 30 });
  const { run } = useAction();
  const toast = useToast();
  const [undoing, setUndoing] = useState<string | null>(null);
  const undo = async (id: string) => {
    setUndoing(id);
    try {
      const change = await run("undo_plan_revision", { id });
      haptics.success();
      toast.show({ message: change.summary, icon: "arrow.uturn.backward" });
    } catch (error) {
      toast.show({ message: describeError(error), tone: "error" });
    } finally {
      setUndoing(null);
      void revisions.refetch();
    }
  };
  const list = revisions.data?.revisions ?? [];
  return (
    <Screen title="Cambios" leading={<IconButton icon="chevron.left" size={28} accessibilityLabel="Atrás" onPress={() => router.back()} />} refreshing={revisions.isRefetching} onRefresh={() => void revisions.refetch()}>
      {revisions.isLoading ? (
        <LoadingState lines={3} />
      ) : !list.length ? (
        <EmptyState icon="clock.arrow.circlepath" title="Sin cambios todavía" message="Cuando algo cambie en tu plan, quedará aquí y podrás deshacerlo." />
      ) : (
        <Panel style={{ paddingHorizontal: 0, paddingVertical: 4, overflow: "hidden" }}>
          {list.map((r, i) => {
            const live = !r.undoneAt;
            const row = (
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: colors.separator, flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="subhead" color={live ? "text" : "textSecondary"} style={live ? undefined : { textDecorationLine: "line-through" }}>
                    {r.summary}
                  </Text>
                  <Text variant="meta" color="textSecondary">
                    {[ago(r.createdAt), r.dates.length ? r.dates.map((d) => longDate(d).split(" de ")[0]).join(", ") : null, live ? null : "Deshecho"].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {undoing === r.id ? <ActivityIndicator color={colors.textSecondary} /> : null}
              </View>
            );
            return live ? (
              <SwipeRow key={r.id} right={{ label: "Deshacer", icon: "arrow.uturn.backward", color: colors.warning, onPress: () => void undo(r.id) }} menu={[{ title: "Deshacer", onPress: () => void undo(r.id) }]}>
                {row}
              </SwipeRow>
            ) : (
              <View key={r.id}>{row}</View>
            );
          })}
        </Panel>
      )}
    </Screen>
  );
}
