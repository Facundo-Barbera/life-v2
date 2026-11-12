import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { useEffect, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { Easing, useDerivedValue, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme";

// Tablero's instruments, drawn with Skia. Each sweeps from 0 to its value on
// mount (and springs to every new value) with a short-bounce spring.

function clamp01(n: number) {
  "worklet";
  return Math.min(Math.max(n, 0), 1);
}

/** Springs a shared value 0 → `to` on mount and to each new `to` after. */
function useSweep(to: number, transition: "spring" | "timing" | "none" = "spring") {
  const { motion } = useTheme();
  const v = useSharedValue(0);
  useEffect(() => {
    if (transition === "none") v.value = to;
    else if (transition === "timing") v.value = withTiming(to, { duration: 1000, easing: Easing.linear });
    else v.value = withSpring(to, motion.sweep);
  }, [to, transition, v, motion.sweep]);
  return v;
}

function arc(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  const p = Skia.PathBuilder.Make();
  p.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, startDeg, sweepDeg);
  return p.build();
}

type GaugeProps = {
  /** 0–1; null draws only the track (no data). */
  value: number | null;
  size?: number;
  stroke?: number;
  /** Fill colour; lime by default. */
  color?: string;
  /** Centred over the dial: the figure, its label, a pill. */
  children?: ReactNode;
  testID?: string;
};

/**
 * The recovery dial: a 270° arc open at the bottom, a tick ring outside it,
 * sweeping 0 → value. In light mode the lime runs as a thin core over an ink
 * stroke so it reads on white (the mock's rule: lime is only a fill).
 */
export function Gauge({ value, size = 228, stroke = 12, color, children, testID }: GaugeProps) {
  const { colors, dark } = useTheme();
  const c = size / 2;
  const r = size * (90 / 228);
  const tickR = size * (104 / 228);
  const START = 135;
  const SWEEP = 270;
  const track = useMemo(() => arc(c, c, r, START, SWEEP), [c, r]);
  const ticks = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = ((START + (SWEEP * i) / n) * Math.PI) / 180;
      const r0 = tickR - 2.5;
      const r1 = tickR + 2.5;
      p.moveTo(c + r0 * Math.cos(a), c + r0 * Math.sin(a));
      p.lineTo(c + r1 * Math.cos(a), c + r1 * Math.sin(a));
    }
    return p.build();
  }, [c, tickR]);
  const progress = useSweep(value == null ? 0 : clamp01(value));
  const end = useDerivedValue(() => clamp01(progress.value));
  const fill = color ?? colors.accent;
  return (
    <View testID={testID} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Canvas style={{ position: "absolute", width: size, height: size }}>
        <Path path={ticks} style="stroke" strokeWidth={1.6} color={colors.textSecondary} opacity={dark ? 0.7 : 0.6} />
        <Path path={track} style="stroke" strokeWidth={stroke} color={colors.separator} />
        {dark ? (
          <Path path={track} style="stroke" strokeWidth={stroke} color={fill} start={0} end={end} />
        ) : (
          <Group>
            <Path path={track} style="stroke" strokeWidth={stroke} color={colors.text} start={0} end={end} />
            <Path path={track} style="stroke" strokeWidth={stroke / 2} color={fill} start={0} end={end} />
          </Group>
        )}
      </Canvas>
      {children}
    </View>
  );
}

export type Zone = { min: number; max: number };

type NeedleProps = {
  /** Beats per minute now; null parks the needle at the start. */
  bpm: number | null;
  /** Zones 1–5, low to high (`hrZones` from get_training_program). */
  zones: Zone[];
  /** The zone the session aims for (1–5): drawn at full strength, the others dimmed. */
  target?: number;
  width?: number;
};

/** Zone of a heart rate, 1–5 (0 under zone 1). */
export function zoneOf(bpm: number, zones: Zone[]): number {
  for (let i = zones.length - 1; i >= 0; i--) if (bpm >= zones[i]!.min) return i + 1;
  return 0;
}

/**
 * The heart-rate needle: a half dial split into the five zones (each a fifth of
 * the arc), the target zone bright, the rest dimmed, and a needle that springs
 * to the current pulse inside its zone.
 */
export function NeedleGauge({ bpm, zones, target, width = 170 }: NeedleProps) {
  const { colors } = useTheme();
  const zoneColors = [colors.z1, colors.z2, colors.z3, colors.z4, colors.z5];
  const h = width * (120 / 220);
  const cx = width / 2;
  const cy = width * (110 / 220);
  const r = width * (90 / 220);
  const stroke = width * (14 / 220);
  const segments = useMemo(
    () => zoneColors.map((_, i) => arc(cx, cy, r, 180 + i * 36 + (i ? 1.8 : 0), 36 - (i ? 1.8 : 0))),
    [cx, cy, r],
  );
  // Position along the dial, 0–1: the zone's fifth plus where bpm sits inside it.
  const position = (() => {
    if (bpm == null || zones.length < 5) return 0;
    const z = zoneOf(bpm, zones);
    if (z === 0) return 0;
    const { min, max } = zones[z - 1]!;
    return clamp01(((z - 1) + clamp01((bpm - min) / Math.max(1, max - min))) / 5);
  })();
  const p = useSweep(position);
  const needle = useDerivedValue(() => {
    const a = Math.PI + p.value * Math.PI;
    const len = r * 0.82;
    const path = Skia.PathBuilder.Make();
    path.moveTo(cx, cy);
    path.lineTo(cx + len * Math.cos(a), cy + len * Math.sin(a));
    return path.build();
  });
  return (
    <Canvas style={{ width, height: h }}>
      {segments.map((seg, i) => (
        <Path key={i} path={seg} style="stroke" strokeWidth={stroke} color={zoneColors[i]!} opacity={target && target !== i + 1 ? 0.35 : 1} />
      ))}
      <Path path={needle} style="stroke" strokeWidth={4} strokeCap="round" color={colors.text} />
      <Circle cx={cx} cy={cy} r={7} color={colors.text} />
    </Canvas>
  );
}

type RingProps = {
  /** 0–1 of the ring filled. */
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  /** "timing" for a countdown updated every second (linear 1 s steps); "spring" otherwise. */
  transition?: "spring" | "timing" | "none";
  children?: ReactNode;
  testID?: string;
};

/** A full ring with a round cap from 12 o'clock: the rest timer, a dose or water goal. */
export function Ring({ progress, size = 108, stroke = 9, color, transition = "spring", children, testID }: RingProps) {
  const { colors } = useTheme();
  const c = size / 2;
  const r = (size - stroke) / 2 - 0.5;
  const path = useMemo(() => arc(c, c, r, -90, 359.999), [c, r]);
  const v = useSweep(clamp01(progress), transition);
  const end = useDerivedValue(() => clamp01(v.value));
  return (
    <View testID={testID} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Canvas style={{ position: "absolute", width: size, height: size }}>
        <Path path={path} style="stroke" strokeWidth={stroke} color={colors.separator} />
        <Path path={path} style="stroke" strokeWidth={stroke} strokeCap="round" color={color ?? colors.accent} start={0} end={end} />
      </Canvas>
      {children}
    </View>
  );
}
