import type { ReactNode } from "react";
import { Switch, View } from "react-native";
import { useTheme } from "@/theme";
import { PressableScale } from "@/ui/Pressable";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { addDays, daysBetween, minutesOf, shortDate, shortDays, timeOf, WEEKDAY_LETTERS, WEEKDAY_NAMES } from "../model";

/** A time of day on Tablero's stepper: ± 5 minutes a tap, faster while held. */
export function TimeStepper({ value, onChange, step = 5, testID }: { value: string; onChange: (time: string) => void; step?: number; testID?: string }) {
  return (
    <Stepper
      value={minutesOf(value)}
      onChange={(m) => onChange(timeOf(m))}
      step={step}
      min={0}
      max={23 * 60 + 55}
      format={timeOf}
      accessibilityLabel="Hora"
      testID={testID}
    />
  );
}

/** A local day on the stepper, a day a tap, between `min` and `max` ("YYYY-MM-DD"). */
export function DateStepper({ value, onChange, min, max, testID }: { value: string; onChange: (date: string) => void; min?: string; max?: string; testID?: string }) {
  const base = min ?? addDays(value, -3650);
  return (
    <Stepper
      value={daysBetween(base, value)}
      onChange={(n) => onChange(addDays(base, n))}
      min={0}
      max={max ? daysBetween(base, max) : Number.POSITIVE_INFINITY}
      format={(n) => shortDate(addDays(base, n))}
      accessibilityLabel="Fecha"
      testID={testID}
    />
  );
}

/** A label over a control, for a stepper's row inside a Section. */
export function Labeled({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  const { colors, hairline } = useTheme();
  return (
    <View style={{ gap: 8, paddingVertical: 12, borderBottomWidth: last ? 0 : hairline, borderBottomColor: colors.separator }}>
      <Text variant="labelSmall" color="textSecondary">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** A Section row with a switch. */
export function ToggleRow({ label, value, onChange, last, testID }: { label: string; value: boolean; onChange: (on: boolean) => void; last?: boolean; testID?: string }) {
  const { colors, hairline } = useTheme();
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: last ? 0 : hairline, borderBottomColor: colors.separator }}>
      <Text variant="subhead" style={{ flex: 1 }}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} testID={testID} />
    </View>
  );
}

/** L M X J V S D toggles; none on means every day (unless `emptyMeansEvery` is off). */
export function WeekdayPicker({ days, onToggle, emptyMeansEvery = true }: { days: number[]; onToggle: (day: number) => void; emptyMeansEvery?: boolean }) {
  const { colors, hairline } = useTheme();
  return (
    <View style={{ gap: 8, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {WEEKDAY_LETTERS.map((letter, i) => {
          const day = i + 1;
          const on = (emptyMeansEvery && days.length === 0) || days.includes(day);
          return (
            <PressableScale
              key={letter}
              feedback="select"
              onPress={() => onToggle(day)}
              accessibilityLabel={WEEKDAY_NAMES[i]}
              accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.accent : colors.surfaceRaised, borderWidth: on ? 0 : hairline, borderColor: colors.separator }}
            >
              <Text variant="button" color={on ? "onAccent" : "textSecondary"}>
                {letter}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      <Text variant="meta" color="textSecondary">
        {days.length === 0 ? "Todos los días" : shortDays(days)}
      </Text>
    </View>
  );
}
