import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme";
import { haptics } from "./haptics";
import { Text } from "./Text";

type Props = {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Under the figure, mono: KG, REPS, KM/H. */
  unit?: string;
  format?: (n: number) => string;
  testID?: string;
  accessibilityLabel?: string;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The live session's ± stepper: 64 pt tall, a 48 pt target each side. A tap
 * steps once with a selection tick; holding repeats, speeding up, and a rigid
 * tap marks the limit.
 */
export function Stepper({ value, onChange, step = 1, min = 0, max = Number.POSITIVE_INFINITY, unit, format = (n) => String(round(n)), testID, accessibilityLabel }: Props) {
  const { colors, hairline, target, type, motion } = useTheme();
  const latest = useRef(value);
  latest.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  const bump = (dir: 1 | -1) => {
    const next = round(Math.min(max, Math.max(min, latest.current + dir * step)));
    if (next === latest.current) {
      haptics.edge();
      return false;
    }
    latest.current = next;
    onChange(next);
    haptics.select();
    return true;
  };

  const hold = (dir: 1 | -1) => {
    let every: number = motion.repeatEvery;
    const tick = () => {
      if (!bump(dir)) return;
      every = Math.max(motion.repeatMin, every * 0.88);
      timer.current = setTimeout(tick, every);
    };
    timer.current = setTimeout(tick, motion.repeatDelay);
  };

  const side = (dir: 1 | -1) => (
    <Pressable
      testID={testID ? `${testID}-${dir > 0 ? "plus" : "minus"}` : undefined}
      accessibilityRole="button"
      accessibilityLabel={dir > 0 ? "Más" : "Menos"}
      onPressIn={() => {
        bump(dir);
        hold(dir);
      }}
      onPressOut={stop}
      style={({ pressed }) => ({ width: 48, height: target.stepper, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}
    >
      <Text style={[type.number, { fontSize: 26, fontWeight: "500", color: colors.textSecondary }]}>{dir > 0 ? "+" : "−"}</Text>
    </Pressable>
  );

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel ?? unit}
      accessibilityValue={{ text: `${format(value)}${unit ? ` ${unit}` : ""}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => bump(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      style={{ flexDirection: "row", alignItems: "center", height: target.stepper, borderRadius: 12, borderCurve: "continuous", backgroundColor: colors.surfaceRaised, borderWidth: hairline, borderColor: colors.separator }}
    >
      {side(-1)}
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text variant="number" numberOfLines={1} adjustsFontSizeToFit testID={testID ? `${testID}-value` : undefined}>
          {format(value)}
        </Text>
        {unit ? (
          <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 9.5, marginTop: 3 }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {side(1)}
    </View>
  );
}
