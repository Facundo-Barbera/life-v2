import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme, type ColorTokens } from "@/theme";
import { Text } from "./Text";

type PanelProps = { children: ReactNode; style?: StyleProp<ViewStyle>; /** "cell" is the smaller, tighter panel of a stat grid. */ size?: "panel" | "cell"; testID?: string };

/** Tablero's panel: a flat surface with a 1 pt inner hairline, 16 pt corners (12 for a cell). */
export function Panel({ children, style, size = "panel", testID }: PanelProps) {
  const { colors, radius, space, hairline } = useTheme();
  const cell = size === "cell";
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: cell ? radius.md : radius.lg,
          borderWidth: hairline,
          borderColor: colors.separator,
          padding: cell ? 11 : space.gutter,
          borderCurve: "continuous",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A panel's header line: mono uppercase label left, a quiet note right
 * («RECUPERACIÓN … VS 14 D»). `accent` colours the label (◆ Resumen del Coach).
 */
export function PanelHeader({ title, trailing, accent, color }: { title: ReactNode; trailing?: ReactNode; accent?: boolean; color?: keyof ColorTokens }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      {typeof title === "string" ? (
        <Text variant="label" color={color ?? (accent ? "accentText" : "textSecondary")} numberOfLines={1} style={{ flexShrink: 1 }}>
          {accent ? `◆ ${title}` : title}
        </Text>
      ) : (
        title
      )}
      {typeof trailing === "string" ? (
        <Text variant="label" color="textSecondary" numberOfLines={1}>
          {trailing}
        </Text>
      ) : (
        trailing
      )}
    </View>
  );
}

/** A full-width 1 pt divider inside a panel. */
export function Hairline({ inset = 0 }: { inset?: number }) {
  const { colors, hairline } = useTheme();
  return <View style={{ height: hairline, backgroundColor: colors.separator, marginLeft: inset }} />;
}
