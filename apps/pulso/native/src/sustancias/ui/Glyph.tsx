import { Text as RNText } from "react-native";
import { Icon } from "@/ui/Icon";
import { glyph } from "../model";

/** A substance's symbol: an emoji as text, else an SF Symbol (the neutral one by default). */
export function Glyph({ symbol, size = 16, tint }: { symbol: string | null; size?: number; tint: string }) {
  const g = glyph(symbol);
  if (g.kind === "emoji") return <RNText style={{ fontSize: size, lineHeight: size * 1.2 }}>{g.text}</RNText>;
  return <Icon name={g.name} size={size} tint={tint} />;
}
