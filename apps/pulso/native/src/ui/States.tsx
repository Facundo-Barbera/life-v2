import { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { Button } from "./Button";
import { Icon, type SFSymbol } from "./Icon";
import { Panel } from "./Panel";
import { Text } from "./Text";

type Action = { title: string; onPress: () => void; icon?: SFSymbol };

/**
 * A designed empty state: an icon, a short line, and the first action. The
 * person's real data starts empty, so this is what most screens show first.
 */
export function EmptyState({ icon, title, message, action, secondary, bare, testID }: { icon?: SFSymbol; title: string; message?: string; action?: Action; secondary?: Action; bare?: boolean; testID?: string }) {
  const { colors } = useTheme();
  const body = (
    <View style={{ gap: 10, alignItems: "flex-start" }} testID={testID}>
      {icon ? (
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={19} color="accentText" />
        </View>
      ) : null}
      <Text variant="headline">{title}</Text>
      {message ? (
        <Text variant="subhead" color="textSecondary">
          {message}
        </Text>
      ) : null}
      {action || secondary ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {action ? <Button title={action.title} icon={action.icon} variant="accent" onPress={action.onPress} /> : null}
          {secondary ? <Button title={secondary.title} icon={secondary.icon} onPress={secondary.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
  return bare ? body : <Panel>{body}</Panel>;
}

/** Something failed: what, and «Reintentar». */
export function ErrorState({ title = "No se pudo cargar", message, onRetry, bare }: { title?: string; message?: string; onRetry?: () => void; bare?: boolean }) {
  return <EmptyState bare={bare} icon="exclamationmark.triangle.fill" title={title} message={message} action={onRetry ? { title: "Reintentar", onPress: onRetry, icon: "arrow.clockwise" } : undefined} />;
}

/** A placeholder block that breathes while loading (no spinners in panels). */
export function Skeleton({ height = 16, width = "100%", radius = 6, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [o]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: colors.surfaceRaised }, pulse, style]} />;
}

/** A panel-shaped loading placeholder: a header line and a few blocks. */
export function LoadingState({ lines = 2, height }: { lines?: number; height?: number }) {
  return (
    <Panel style={{ gap: 12, minHeight: height }}>
      <Skeleton height={11} width="40%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={i === 0 ? 28 : 14} width={i === 0 ? "55%" : "85%"} />
      ))}
    </Panel>
  );
}
