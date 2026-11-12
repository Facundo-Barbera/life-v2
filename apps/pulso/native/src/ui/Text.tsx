import { Text as RNText, type TextProps } from "react-native";
import { useTheme, type ColorTokens, type TypeName } from "@/theme";

type Props = TextProps & { variant?: TypeName; color?: keyof ColorTokens };

/** Every string on screen goes through here, so the type scale is the only source of sizes. */
export function Text({ variant = "body", color = "text", style, ...rest }: Props) {
  const theme = useTheme();
  return <RNText {...rest} style={[theme.type[variant], { color: theme.colors[color] }, style]} />;
}

/** Text whose colour is a raw value (a zone colour, a chart hue) rather than a token. */
export function TintedText({ tint, variant = "body", style, ...rest }: TextProps & { variant?: TypeName; tint: string }) {
  const theme = useTheme();
  return <RNText {...rest} style={[theme.type[variant], { color: tint }, style]} />;
}
