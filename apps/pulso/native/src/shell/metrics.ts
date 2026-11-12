import { useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RailContext } from "./session";

/** The floating rail's geometry, shared by the rail, screens (bottom padding) and the toast. */
export const RAIL_HEIGHT = 64;
/** The live session's control, stacked above the rail while a workout is live. */
export const SESSION_HEIGHT = 64;
const STACK_GAP = 8;

/**
 * Where the rail floats: its bottom edge above the screen's, and the content
 * padding that clears it. `height` covers the session control too while one is live.
 */
export function useRailMetrics() {
  const insets = useSafeAreaInsets();
  const rail = useContext(RailContext);
  const bottom = Math.max(insets.bottom - 8, 12);
  const height = RAIL_HEIGHT + (rail?.session && !rail.hidden ? SESSION_HEIGHT + STACK_GAP : 0);
  return { bottom, height, side: 14, contentPadding: bottom + height + 24 };
}
