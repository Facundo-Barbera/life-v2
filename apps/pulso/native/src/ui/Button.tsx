import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";
import { Icon, type SFSymbol } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";

type ButtonProps = {
  title: string;
  onPress?: () => void;
  /** "accent" is the lime fill (one per view); "plain" the raised panel with a hairline. */
  variant?: "accent" | "plain";
  /** 48 pt (rows, inline) or 72 pt (a screen's bottom bar). */
  size?: "md" | "lg";
  icon?: SFSymbol;
  busy?: boolean;
  disabled?: boolean;
  /** Stretch to the parent's width. */
  wide?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

/** Tablero's button: mono uppercase label, squarish 10 pt corners («EMPEZAR», «TOMAR», «PAUSA»). */
export function Button({ title, onPress, variant = "plain", size = "md", icon, busy, disabled, wide, style, testID, accessibilityLabel }: ButtonProps) {
  const { colors, target, hairline } = useTheme();
  const accent = variant === "accent";
  const ink = accent ? "onAccent" : "text";
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        {
          height: size === "lg" ? target.big : target.button,
          paddingHorizontal: 16,
          borderRadius: 10,
          borderCurve: "continuous",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: accent ? colors.accent : colors.surfaceRaised,
          borderWidth: accent ? 0 : hairline,
          borderColor: colors.separator,
          alignSelf: wide ? "stretch" : "auto",
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors[ink]} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "lg" ? 16 : 14} color={ink} weight="bold" /> : null}
          <Text variant="button" color={ink} style={size === "lg" ? { fontSize: 15 } : undefined} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

/**
 * The big lime bar at the bottom of the live session: «HECHO» on the left, what
 * it records and what's next on the right in mono. Fires a success haptic.
 */
export function BigButton({ title, detail, onPress, disabled, testID, style }: { title: string; detail?: string; onPress?: () => void; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle> }) {
  const { colors, target } = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      disabled={disabled}
      feedback="success"
      style={[
        { height: target.done, borderRadius: 18, borderCurve: "continuous", backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, gap: 12 },
        style,
      ]}
    >
      <Text variant="shout" color="onAccent">
        {title}
      </Text>
      {detail ? (
        <View style={{ flexShrink: 1 }}>
          <Text variant="meta" color="onAccent" style={{ textAlign: "right", fontWeight: "700", lineHeight: 15 }} numberOfLines={2}>
            {detail}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/** A square icon button (36–44 pt): the live session's close ✕, a composer's send. */
export function IconButton({ icon, onPress, accent, size = 36, accessibilityLabel, testID }: { icon: SFSymbol; onPress?: () => void; accent?: boolean; size?: number; accessibilityLabel: string; testID?: string }) {
  const { colors, hairline } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={{
        width: size,
        height: size,
        borderRadius: size > 40 ? 10 : 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: accent ? colors.accent : colors.surface,
        borderWidth: accent ? 0 : hairline,
        borderColor: colors.separator,
      }}
    >
      <Icon name={icon} size={size * 0.45} color={accent ? "onAccent" : "text"} />
    </PressableScale>
  );
}
