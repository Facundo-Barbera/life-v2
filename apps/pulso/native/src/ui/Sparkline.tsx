import { Canvas, Path, Rect, Skia } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";

type Props = {
  /** Oldest first; nulls are gaps (the line skips them). */
  values: (number | null | undefined)[];
  height?: number;
  /** Raw colour; the accent text colour (lime / olive) by default. */
  color?: string;
  strokeWidth?: number;
  /** A shaded band in value space (a target zone, a baseline range). */
  band?: { from: number; to: number; color?: string };
  /** Fixed value range; defaults to the data's own (plus the band's). */
  domain?: [number, number];
  testID?: string;
};

/** A tiny trend line under a stat (VFC, reposo) or a heart-rate curve with its zone band. */
export function Sparkline({ values, height = 22, color, strokeWidth = 2, band, domain, testID }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const points = values.map((v, i) => (v == null || !Number.isFinite(v) ? null : { i, v }));
  const shown = points.filter((p): p is { i: number; v: number } => p !== null);
  const { path, bandRect } = useMemo(() => {
    if (width === 0 || shown.length < 2) return { path: null, bandRect: null };
    const all = shown.map((p) => p.v).concat(band ? [band.from, band.to] : []);
    let [lo, hi] = domain ?? [Math.min(...all), Math.max(...all)];
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const pad = strokeWidth;
    const x = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * width);
    const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
    const p = Skia.PathBuilder.Make();
    let pen = false;
    for (const point of points) {
      if (!point) {
        pen = false;
        continue;
      }
      if (pen) p.lineTo(x(point.i), y(point.v));
      else p.moveTo(x(point.i), y(point.v));
      pen = true;
    }
    const b = band ? { y: y(Math.max(band.from, band.to)), h: Math.abs(y(band.from) - y(band.to)) } : null;
    return { path: p.build(), bandRect: b };
  }, [width, height, JSON.stringify(values), band?.from, band?.to, domain?.[0], domain?.[1], strokeWidth]);
  const ink = color ?? colors.accentText;
  return (
    <View testID={testID} style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {path ? (
        <Canvas style={{ width, height }}>
          {bandRect && band ? <Rect x={0} y={bandRect.y} width={width} height={bandRect.h} color={band.color ?? ink} opacity={0.14} /> : null}
          <Path path={path} style="stroke" strokeWidth={strokeWidth} strokeJoin="round" strokeCap="round" color={ink} />
        </Canvas>
      ) : (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ height: 1, backgroundColor: colors.separator }} />
        </View>
      )}
    </View>
  );
}
