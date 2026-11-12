import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EngineProvider, useEngine } from "@/data/session";
import { isNotAvailable, isUnpaired } from "@/data/errors";
import { usePresentation } from "@/health/access";
import { useHealthAutoSync } from "@/health/sync";
import { useMedicationReminders } from "@/medicacion/reminders";
import { RailProvider } from "@/shell/session";
import { AppearanceProvider, useTheme } from "@/theme";
import { ToastProvider } from "@/ui/Toast";
import { useTrainingRoot } from "@/training/root";
import { useWatchLink } from "@/watch/link";
import { useWidgetSync } from "@/widgets";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // No change feed: refetch when the app comes back to the front, and after every write.
        staleTime: 30_000,
        gcTime: 24 * 60 * 60_000,
        retry: (count, error) => !isUnpaired(error) && !isNotAvailable(error) && count < 2,
      },
    },
  });
}

/** The root's modal routes: while one is up, Salud's sheet waits (src/health/access.ts). */
const MODALS = new Set(["sistema", "sesion", "escanear", "sustancias"]);

function Routes() {
  const { credentials, member } = useEngine();
  const { colors, dark } = useTheme();
  const segments = useSegments() as string[];
  usePresentation(MODALS.has(segments[0] ?? ""));
  useWatchLink();
  useHealthAutoSync();
  useWidgetSync();
  useTrainingRoot();
  useMedicationReminders();
  const signedIn = !!credentials;
  const ready = signedIn && !!member;
  if (credentials === undefined || (signedIn && member === undefined))
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={ready}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sistema" options={{ presentation: "modal" }} />
          <Stack.Screen name="sustancias" options={{ presentation: "modal" }} />
          <Stack.Screen name="sesion" options={{ presentation: "fullScreenModal", gestureEnabled: false }} />
          <Stack.Screen name="escanear" options={{ presentation: "formSheet", sheetGrabberVisible: true, sheetAllowedDetents: [1] }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="entrar" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && member === null}>
          <Stack.Screen name="sin-invitacion" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppearanceProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <EngineProvider>
              <RailProvider>
                <ToastProvider>
                  <Routes />
                </ToastProvider>
              </RailProvider>
            </EngineProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </AppearanceProvider>
    </GestureHandlerRootView>
  );
}
