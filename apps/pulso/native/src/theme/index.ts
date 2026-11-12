import { useColorScheme } from "react-native";
import { colors, fonts, hairline, motion, radius, space, target, type, zoneColor, type ColorTokens } from "./tokens";

export { colors, fonts, hairline, motion, radius, space, target, type, zoneColor };
export type { ColorTokens, TypeName } from "./tokens";
export { useAppearance, AppearanceProvider, type AppearancePref } from "./appearance";

export type Theme = {
  dark: boolean;
  colors: ColorTokens;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  motion: typeof motion;
  target: typeof target;
  hairline: number;
};

/** The current palette. Dark is Tablero's main mode; Ajustes can pin light or follow the system (`useAppearance`). */
export function useTheme(): Theme {
  const dark = useColorScheme() !== "light";
  return { dark, colors: dark ? colors.dark : colors.light, space, radius, type, motion, target, hairline };
}
