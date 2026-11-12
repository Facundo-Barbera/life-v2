import { Tabs } from "expo-router";
import { Rail } from "@/shell/Rail";
import { TABS } from "@/shell/tabs";
import { useTheme } from "@/theme";

// Pulso's five tabs, each one a domain, on Tablero's floating rail (a custom
// tab bar, not the system one): see src/shell/Rail.tsx.
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs tabBar={(props) => <Rail {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
