import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEngine } from "@/data/session";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Text } from "@/ui/Text";

/** Signed in, but the account has no invitation (no life.members row). */
export default function SinInvitacion() {
  const { credentials, unpair } = useEngine();
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.xl, paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.lg, gap: 10 }}>
      <Text variant="label" color="accentText">
        ◆ Pulso
      </Text>
      <Text variant="largeTitle">Sin invitación</Text>
      <Text variant="callout" color="textSecondary">
        {`Tu cuenta${credentials?.email ? ` (${credentials.email})` : ""} existe, pero no tiene invitación. Pídele a quien administra Pulso que te invite con este mismo correo.`}
      </Text>
      <View style={{ flex: 1 }} />
      <Button title="Cerrar sesión" onPress={() => void unpair()} size="lg" />
    </View>
  );
}
