import { Canvas, Circle, DashPathEffect, Group, Line, Path, Skia, vec } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { useTheme } from "@/theme";
import { Text } from "@/ui/Text";
import { nearest, trendDomain } from "../model";

type Pt = { at: number; value: number };
type BandPt = Pt & { low: number; high: number };

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/** A smooth path through points (monotone enough for body data). */
function smooth(points: { x: number; y: number }[]) {
  const p = Skia.PathBuilder.Make();
  points.forEach((pt, i) => {
    if (i === 0) return void p.moveTo(pt.x, pt.y);
    const prev = points[i - 1]!;
    const mx = (prev.x + pt.x) / 2;
    p.cubicTo(mx, prev.y, mx, pt.y, pt.x, pt.y);
  });
  return p.build();
}

/** Drag to read a point: the responder gives x in the chart's own frame. */
function useScrub(onX: (x: number | null) => void) {
  return {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => onX(e.nativeEvent.locationX),
    onResponderMove: (e: GestureResponderEvent) => onX(e.nativeEvent.locationX),
    onResponderRelease: () => onX(null),
  };
}

const month = (ms: number) => new Date(ms).toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
const day = (ms: number) => new Date(ms).toLocaleDateString("es-MX", { day: "numeric", month: "short" }).replace(".", "");
const num1 = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");

/**
 * The trend: observed readings (solid, with dots), the fitted trend and the
 * projection (dashed) with its 80 % band ahead, and the goal as a dotted rule.
 * The engine computes it all; this only draws.
 */
export function TrendChart({ observed, band, goal, color, onSelect, height = 220 }: { observed: Pt[]; band: BandPt[]; goal: number | null; color: string; onSelect: (p: (Pt & { projected: boolean }) | null) => void; height?: number }) {
  const { colors } = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<(Pt & { projected: boolean }) | null>(null);
  const lastAt = observed.at(-1)?.at ?? 0;
  const ahead = band.filter((b) => b.at >= lastAt);
  const [lo, hi] = trendDomain([...observed.map((o) => o.value), ...ahead.flatMap((b) => [b.low, b.high]), ...(goal != null ? [goal] : [])]);
  const t0 = Math.min(observed[0]?.at ?? 0, band[0]?.at ?? Infinity);
  const t1 = Math.max(lastAt, band.at(-1)?.at ?? 0);
  const padR = 34;
  const x = (at: number) => (t1 > t0 ? ((at - t0) / (t1 - t0)) * (w - padR - 8) + 4 : w / 2);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (height - 28);
  const paths = useMemo(() => {
    if (!w) return null;
    const area = Skia.PathBuilder.Make();
    if (ahead.length > 1) {
      ahead.forEach((b, i) => (i ? area.lineTo(x(b.at), y(b.high)) : area.moveTo(x(b.at), y(b.high))));
      [...ahead].reverse().forEach((b) => area.lineTo(x(b.at), y(b.low)));
      area.close();
    }
    return { area: area.build(), trend: smooth(band.map((b) => ({ x: x(b.at), y: y(b.value) }))), obs: smooth(observed.map((o) => ({ x: x(o.at), y: y(o.value) }))) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, observed, band, lo, hi]);
  const candidates = [...observed.map((o) => ({ ...o, projected: false })), ...band.filter((b) => b.at > lastAt).map((b) => ({ at: b.at, value: b.value, projected: true }))];
  const scrub = useScrub((px) => {
    if (px == null || !w) return;
    const at = t0 + ((px - 4) / (w - padR - 8)) * (t1 - t0);
    const p = nearest(candidates, at) ?? null;
    setSel(p);
    onSelect(p);
  });
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * (i + 0.5)) / 4);
  const xTicks = [0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3);
  return (
    <View onLayout={onLayout} style={{ height }} {...scrub}>
      {paths ? (
        <Canvas style={{ position: "absolute", width: w, height }}>
          {ticks.map((v, i) => (
            <Line key={i} p1={vec(0, y(v))} p2={vec(w - padR, y(v))} color={colors.separator} strokeWidth={1} />
          ))}
          <Path path={paths.area} color={color} opacity={0.18} />
          <Path path={paths.trend} style="stroke" strokeWidth={2} color={color} opacity={0.75}>
            <DashPathEffect intervals={[5, 4]} />
          </Path>
          <Path path={paths.obs} style="stroke" strokeWidth={2.5} color={color} strokeCap="round" />
          {observed.map((o, i) => (
            <Circle key={i} cx={x(o.at)} cy={y(o.value)} r={observed.length > 40 ? 1.5 : 3} color={color} />
          ))}
          {goal != null ? (
            <Line p1={vec(0, y(goal))} p2={vec(w - padR, y(goal))} color={colors.textSecondary} strokeWidth={1}>
              <DashPathEffect intervals={[2, 3]} />
            </Line>
          ) : null}
          {sel ? (
            <Group>
              <Line p1={vec(x(sel.at), 0)} p2={vec(x(sel.at), height - 20)} color={colors.textSecondary} opacity={0.4} strokeWidth={1} />
              <Circle cx={x(sel.at)} cy={y(sel.value)} r={6} color={color} />
            </Group>
          ) : null}
        </Canvas>
      ) : null}
      {w
        ? ticks.map((v, i) => (
            <Text key={i} variant="labelSmall" color="textSecondary" style={{ position: "absolute", right: 0, top: y(v) - 6, fontSize: 9 }}>
              {num1(v)}
            </Text>
          ))
        : null}
      {w
        ? xTicks.map((t, i) => (
            <Text key={i} variant="labelSmall" color="textSecondary" style={{ position: "absolute", left: Math.min(x(t), w - padR - 24), bottom: 0, fontSize: 9 }}>
              {t1 - t0 < 60 * 86_400_000 ? day(t) : month(t)}
            </Text>
          ))
        : null}
      {goal != null && w ? (
        <Text variant="labelSmall" color="textSecondary" style={{ position: "absolute", left: 4, top: y(goal) - 14, fontSize: 9 }}>
          Meta {String(goal).replace(".", ",")}
        </Text>
      ) : null}
    </View>
  );
}

/** Evolution: weight, muscle and fat as change since the first scan, with a zero rule; drag to read. */
export function EvolutionChart({ points, series, onSelect, height = 200 }: { points: { at: number }[]; series: { key: string; color: string }[]; onSelect: (i: number) => void; height?: number }) {
  const { colors } = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState(points.length - 1);
  const val = (p: { at: number }, key: string) => (p as unknown as Record<string, number>)[key] ?? 0;
  const values = points.flatMap((p) => series.map((s) => val(p, s.key)));
  const m = Math.max(0.5, ...values.map(Math.abs)) * 1.15;
  const t0 = points[0]?.at ?? 0;
  const t1 = points.at(-1)?.at ?? 1;
  const x = (at: number) => (t1 > t0 ? ((at - t0) / (t1 - t0)) * (w - 40) + 6 : w / 2);
  const y = (v: number) => 8 + (1 - (v + m) / (2 * m)) * (height - 28);
  const scrub = useScrub((px) => {
    if (px == null || !w) return;
    const at = t0 + ((px - 6) / (w - 40)) * (t1 - t0);
    const p = nearest(points, at);
    const i = p ? points.indexOf(p) : -1;
    if (i >= 0 && i !== sel) {
      setSel(i);
      onSelect(i);
    }
  });
  return (
    <View onLayout={onLayout} style={{ height }} {...scrub}>
      {w ? (
        <Canvas style={{ position: "absolute", width: w, height }}>
          <Line p1={vec(0, y(0))} p2={vec(w - 34, y(0))} color={colors.textSecondary} opacity={0.4} strokeWidth={1}>
            <DashPathEffect intervals={[3, 3]} />
          </Line>
          {series.map((s) => {
            const pts = points.map((p) => ({ x: x(p.at), y: y(val(p, s.key)) }));
            const area = Skia.PathBuilder.Make();
            pts.forEach((pt, i) => (i ? area.lineTo(pt.x, pt.y) : area.moveTo(pt.x, y(0)) && area.lineTo(pt.x, pt.y)));
            if (pts.length) area.lineTo(pts.at(-1)!.x, y(0)).close();
            const p = points[sel];
            return (
              <Group key={s.key}>
                <Path path={area.build()} color={s.color} opacity={0.1} />
                <Path path={smooth(pts)} style="stroke" strokeWidth={2.5} color={s.color} strokeCap="round" />
                {p ? <Circle cx={x(p.at)} cy={y(val(p, s.key))} r={4} color={s.color} /> : null}
              </Group>
            );
          })}
          {points[sel] ? <Line p1={vec(x(points[sel]!.at), 0)} p2={vec(x(points[sel]!.at), height - 20)} color={colors.textSecondary} opacity={0.35} strokeWidth={1} /> : null}
        </Canvas>
      ) : null}
      {w
        ? [-m / 1.15, 0, m / 1.15].map((v, i) => (
            <Text key={i} variant="labelSmall" color="textSecondary" style={{ position: "absolute", right: 0, top: y(v) - 6, fontSize: 9 }}>
              {v > 0.05 ? "+" : v < -0.05 ? "−" : ""}
              {num1(Math.abs(v))}
            </Text>
          ))
        : null}
    </View>
  );
}

/** A donut of slices (Skia arcs with a small gap). */
export function Donut({ slices, size = 128, children }: { slices: { kg: number; color: string }[]; size?: number; children?: React.ReactNode }) {
  const total = slices.reduce((t, s) => t + s.kg, 0) || 1;
  const r = size / 2 - 12;
  let start = -90;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Canvas style={{ position: "absolute", width: size, height: size }}>
        {slices.map((s, i) => {
          const sweep = (s.kg / total) * 360;
          const p = Skia.PathBuilder.Make();
          p.addArc({ x: size / 2 - r, y: size / 2 - r, width: r * 2, height: r * 2 }, start + 1.5, Math.max(sweep - 3, 0.5));
          start += sweep;
          return <Path key={i} path={p.build()} style="stroke" strokeWidth={18} color={s.color} />;
        })}
      </Canvas>
      {children}
    </View>
  );
}

/**
 * Visceral fat as a half dial: the healthy arc up to the normal's top, the rest
 * dashed in caution, a tick ring, and a needle on the value.
 */
export function HalfDial({ at, color, good, caution, width = 120, children }: { at: { value: number; high: number }; color: string; good: string; caution: string; width?: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const W = width;
  const H = W * 0.6;
  const r = W / 2 - 12;
  const cx = W / 2;
  const cy = H - 4;
  const arcPath = (from: number, to: number) => {
    const p = Skia.PathBuilder.Make();
    p.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, 180 + 180 * from, 180 * (to - from));
    return p.build();
  };
  const ticks = useMemo(() => {
    const p = Skia.PathBuilder.Make();
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (Math.PI * i) / 20;
      const r0 = r + 8;
      const r1 = r + (i % 5 === 0 ? 12 : 10);
      p.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
      p.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
    }
    return p.build();
  }, [cx, cy, r]);
  const v = Math.min(Math.max(at.value, 0), 1);
  const a = Math.PI + Math.PI * v;
  const len = r - 14;
  return (
    <View style={{ width: W, height: H, alignItems: "center", justifyContent: "flex-end" }}>
      <Canvas style={{ position: "absolute", width: W, height: H }}>
        <Path path={ticks} style="stroke" strokeWidth={1.2} color={colors.textSecondary} opacity={0.6} />
        <Path path={arcPath(0, at.high)} style="stroke" strokeWidth={9} color={good} opacity={0.85} />
        <Path path={arcPath(Math.min(at.high + 0.02, 1), 1)} style="stroke" strokeWidth={9} color={caution} opacity={0.55}>
          <DashPathEffect intervals={[3, 3]} />
        </Path>
        <Line p1={vec(cx, cy)} p2={vec(cx + len * Math.cos(a), cy + len * Math.sin(a))} color={color} strokeWidth={3} strokeCap="round" />
        <Circle cx={cx} cy={cy} r={4} color={color} />
      </Canvas>
      <View style={{ position: "absolute", top: H * 0.38 }}>{children}</View>
    </View>
  );
}
