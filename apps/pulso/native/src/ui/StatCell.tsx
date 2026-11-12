import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme, type TypeName } from "@/theme";
import { Panel } from "./Panel";
import { Text } from "./Text";

export type Delta = { text: string; /** up/down colour the arrow; "flat" is muted. "good" picks lime regardless of direction. */ tone: "good" | "bad" | "flat" };

/** «▲ 6», «▼ 3», «= 0» from a signed change, with whether up is good for this metric. */
export function delta(change: number | null | undefined, format: (n: number) => string = (n) => String(Math.round(n)), upIsGood = true): Delta | null {
  if (change == null || !Number.isFinite(change)) return null;
  const shown = format(Math.abs(change));
  if (shown === format(0)) return { text: `= ${shown}`, tone: "flat" };
  const up = change > 0;
  return { text: `${up ? "▲" : "▼"} ${shown}`, tone: up === upIsGood ? "good" : "bad" };
}

type Props = {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  delta?: Delta | null;
  /** Under the delta: a Sparkline, a StackBar. */
  children?: ReactNode;
  /** Value size: "stat" (26) in a 3-up grid, "number" (34-ish) in a 2-up grid. */
  size?: Extract<TypeName, "stat" | "number" | "hero" | "numberSmall">;
  /** Bare: no panel around it (inside another panel). */
  bare?: boolean;
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A stat cell: mono key, big rounded figure with a mono unit, a delta, and a mini chart. */
export function StatCell({ label, value, unit, delta: d, children, size = "stat", bare, valueColor, style, testID }: Props) {
  const { colors, type } = useTheme();
  const body = (
    <>
      <Text variant="labelSmall" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 8 }}>
        <Text
          testID={testID ? `${testID}-value` : undefined}
          style={[type[size], { color: valueColor ?? colors.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {value ?? "—"}
        </Text>
        {unit && value != null ? (
          <Text variant="label" color="textSecondary" style={{ marginLeft: 3, textTransform: "none", letterSpacing: 0 }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {d ? (
        <Text variant="delta" style={{ marginTop: 5, color: d.tone === "good" ? colors.accentText : d.tone === "bad" ? colors.heart : colors.textSecondary }}>
          {d.text}
        </Text>
      ) : null}
      {children ? <View style={{ marginTop: d ? 6 : 10 }}>{children}</View> : null}
    </>
  );
  if (bare) return <View style={style}>{body}</View>;
  return (
    <Panel size="cell" style={[{ flex: 1 }, style]} testID={testID}>
      {body}
    </Panel>
  );
}
