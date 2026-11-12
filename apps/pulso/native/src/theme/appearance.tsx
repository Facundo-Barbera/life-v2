import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";

// Tablero is dark first: the app opens dark unless the person picks light or
// "Sistema" in Ajustes. The choice overrides the app's colour scheme natively
// (Appearance.setColorScheme), so `useColorScheme`, the status bar and system
// sheets all follow it.

export type AppearancePref = "dark" | "light" | "system";

const KEY = "pulso.appearance";

function apply(pref: AppearancePref) {
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

type AppearanceState = { pref: AppearancePref; setPref(pref: AppearancePref): void };

const AppearanceContext = createContext<AppearanceState>({ pref: "dark", setPref: () => undefined });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<AppearancePref>("dark");
  useEffect(() => {
    apply("dark");
    SecureStore.getItemAsync(KEY).then(
      (saved) => {
        if (saved === "light" || saved === "system" || saved === "dark") {
          setPrefState(saved);
          apply(saved);
        }
      },
      () => undefined,
    );
  }, []);
  const setPref = useCallback((next: AppearancePref) => {
    setPrefState(next);
    apply(next);
    void SecureStore.setItemAsync(KEY, next).catch(() => undefined);
  }, []);
  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export const useAppearance = () => useContext(AppearanceContext);
