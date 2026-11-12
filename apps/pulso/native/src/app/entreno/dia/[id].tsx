import { router, Stack, useLocalSearchParams, type Href } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { BigButton, IconButton } from "@/ui/Button";
import { Panel, PanelHeader } from "@/ui/Panel";
import { Screen } from "@/ui/Screen";
import { EmptyState } from "@/ui/States";
import { Text } from "@/ui/Text";
import { useLive, useTraining } from "@/training/store";
import { DayExercises, DayFigures, dayMinutes, daySets } from "@/training/ui/plan";

// A program day before starting it (SwiftUI's DayDetailView): its exercises as
// they'll be done today (the Coach's adjusted copy when one applies), the load
// each starts at and why, supersets bracketed, and «EMPEZAR».

export default function Dia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useTraining();
  const live = useLive();
  const { space, type } = useTheme();
  const days = store.program?.program?.days ?? [];
  const base = days.find((d) => d.id === id);
  const back = <IconButton icon="chevron.left" onPress={() => router.back()} accessibilityLabel="Atrás" />;
  if (!base)
    return (
      <Screen title="DÍA" leading={back}>
        <Stack.Screen options={{ headerShown: false }} />
        <EmptyState icon="calendar" title="Día no encontrado" />
      </Screen>
    );
  const { day, suggestions } = store.dayToStart(base);
  const adjusted = day !== base;
  const changes = adjusted ? (store.program?.adjustment?.changes ?? []) : [];
  return (
    <Screen title={`DÍA ${days.indexOf(base) + 1} DE ${days.length}`} leading={back}>
      <Stack.Screen options={{ headerShown: false }} />
      <Panel style={{ gap: space.md }}>
        <PanelHeader title={adjusted ? "Con ajustes" : "Plan del día"} color={adjusted ? "accentText" : undefined} />
        <View style={{ marginTop: -4 }}>
          <Text style={[type.largeTitle, { fontSize: 40, lineHeight: 44, letterSpacing: -1.6 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {day.name}
          </Text>
          {day.focus ? (
            <Text variant="subhead" color="textSecondary" style={{ marginTop: 2 }}>
              {day.focus}
            </Text>
          ) : null}
        </View>
        <DayFigures day={day} />
        {live ? null : (
          <BigButton
            title="EMPEZAR"
            detail={`${day.name}\n~${dayMinutes(day)} min · ${daySets(day)} series`}
            testID="day-start"
            style={{ height: 64, borderRadius: 14 }}
            onPress={() => router.replace({ pathname: "/sesion", params: { dia: base.id } } as unknown as Href)}
          />
        )}
      </Panel>
      {day.exercises.length ? (
        <Panel style={{ gap: space.xs }}>
          <PanelHeader title={`${day.exercises.length} ejercicios`} trailing="Carga" />
          <DayExercises day={day} suggestions={suggestions} changes={changes} detailed onPress={(e) => router.push(`/entreno/ejercicio/${e.exerciseId}` as Href)} />
        </Panel>
      ) : (
        <EmptyState icon="figure.cooldown" title="Día sin ejercicios" message="Complétalo en pulso.bixku.online." />
      )}
      {live ? (
        <Text variant="footnote" color="textSecondary" style={{ textAlign: "center" }}>
          Termina la sesión en curso para empezar otra.
        </Text>
      ) : null}
    </Screen>
  );
}
