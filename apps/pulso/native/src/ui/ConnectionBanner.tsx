import { View } from "react-native";
import { useEngine } from "@/data/session";
import { useTheme } from "@/theme";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Shown while the Mac doesn't answer; what's on screen is the last thing it said. */
export function ConnectionBanner() {
  const { reachability, recheck } = useEngine();
  const { colors, radius, space, hairline } = useTheme();
  if (reachability !== "unreachable") return null;
  return (
    <View
      testID="connection-banner"
      style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.gutter, gap: space.sm, borderWidth: hairline, borderColor: colors.warning, flexDirection: "row", alignItems: "center" }}
    >
      <Icon name="wifi.exclamationmark" size={18} tint={colors.warning} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" style={{ color: colors.warning }}>
          Sin conexión
        </Text>
        <Text variant="footnote" color="textSecondary">
          Revisa tu internet. Te muestro lo último que llegó.
        </Text>
      </View>
      <Button title="Reintentar" onPress={recheck} />
    </View>
  );
}
