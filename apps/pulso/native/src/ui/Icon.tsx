import { SymbolView, type SFSymbol } from "expo-symbols";
import { useTheme, type ColorTokens } from "@/theme";

export type { SFSymbol };

/** An SF Symbol in a theme colour (or a raw `tint`). */
export function Icon({ name, size = 18, color = "text", tint, weight = "semibold" }: { name: SFSymbol; size?: number; color?: keyof ColorTokens; tint?: string; weight?: "regular" | "medium" | "semibold" | "bold" }) {
  const { colors } = useTheme();
  return <SymbolView name={name} size={size} tintColor={tint ?? colors[color]} weight={weight} resizeMode="scaleAspectFit" style={{ width: size, height: size }} />;
}
