import { View } from "react-native";
import { useTheme } from "@/theme";

/** A proportional bar of coloured parts with 2 pt gaps: last night's sleep stages. */
export function StackBar({ parts, height = 6 }: { parts: { value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  return (
    <View style={{ flexDirection: "row", height, gap: 2, borderRadius: 2, overflow: "hidden" }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p, i) => (
          <View key={i} style={{ flex: p.value, backgroundColor: p.color }} />
        ))}
    </View>
  );
}

/**
 * The session's progress strip: `count` cells, those before `current` done
 * (grey), `current` (one index or a [from, to] range for a superset) lime, the rest empty.
 */
export function SegmentBar({ count, done, current, height = 5 }: { count: number; done: number; current?: number | [number, number]; height?: number }) {
  const { colors } = useTheme();
  const [from, to] = current == null ? [-1, -1] : typeof current === "number" ? [current, current] : current;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{ flex: 1, height, borderRadius: 1, backgroundColor: i >= from && i <= to ? colors.accent : i < done ? colors.textSecondary : colors.separator }}
        />
      ))}
    </View>
  );
}

/** Round pips (superset round 2/3): done grey, current lime, rest empty. */
export function Pips({ count, current }: { count: number; current: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: 18, height: 6, borderRadius: 2, backgroundColor: i === current ? colors.accent : i < current ? colors.textSecondary : colors.separator }} />
      ))}
    </View>
  );
}

/** Water glasses: `count` blocks, the first `filled` in zone-2 blue. */
export function BlockMeter({ count, filled, color, height = 22 }: { count: number; filled: number; color?: string; height?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, height, borderRadius: 3, backgroundColor: i < filled ? (color ?? colors.z2) : colors.separator }} />
      ))}
    </View>
  );
}
