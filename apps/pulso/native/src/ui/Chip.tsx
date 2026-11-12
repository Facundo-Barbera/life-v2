import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme, type ColorTokens } from "@/theme";
import { Icon, type SFSymbol } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text, TintedText } from "./Text";

type ChipProps = {
  label: string;
  /** A leading status dot (lime by default). */
  dot?: boolean | string;
  icon?: SFSymbol;
  /** Label colour token, or a raw `tint` (a zone colour). */
  color?: keyof ColorTokens;
  tint?: string;
  onPress?: () => void;
  testID?: string;
  trailing?: ReactNode;
};

/** A 24 pt mono chip on a panel: «● SALUD 07:05», «♥ 128», «2/2». */
export function Chip({ label, dot, icon, color = "textSecondary", tint, onPress, testID, trailing }: ChipProps) {
  const { colors, hairline } = useTheme();
  const ink = tint ?? colors[color];
  const body = (
    <View
      testID={onPress ? undefined : testID}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 24, paddingHorizontal: 9, borderRadius: 6, backgroundColor: colors.surface, borderWidth: hairline, borderColor: colors.separator }}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: typeof dot === "string" ? dot : colors.accentText }} /> : null}
      {icon ? <Icon name={icon} size={12} tint={ink} /> : null}
      <TintedText variant="label" tint={ink} numberOfLines={1}>
        {label}
      </TintedText>
      {trailing}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} testID={testID} hitSlop={10} feedback="select">
      {body}
    </PressableScale>
  ) : (
    body
  );
}

/** A filled badge: lime with graphite mono text («LISTO PARA EMPUJAR»), or a tone for warnings. */
export function Pill({ label, tone = "accent" }: { label: string; tone?: "accent" | "warning" | "negative" | "muted" }) {
  const { colors } = useTheme();
  const bg = tone === "accent" ? colors.accent : tone === "warning" ? colors.warning : tone === "negative" ? colors.negative : colors.surfaceRaised;
  return (
    <View style={{ alignSelf: "center", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5, backgroundColor: bg }}>
      <Text variant="label" color={tone === "muted" ? "textSecondary" : "onAccent"} style={{ fontWeight: "700", letterSpacing: 0.44 }}>
        {label}
      </Text>
    </View>
  );
}
