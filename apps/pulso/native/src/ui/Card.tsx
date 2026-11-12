import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Panel } from "./Panel";

/** The foundation's card, now a Tablero panel with a gap between children. Prefer `Panel` in new code. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Panel style={[{ gap: 8 }, style]}>{children}</Panel>;
}
