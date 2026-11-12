import { Canvas, DashPathEffect, Group, Line, Path, Skia, vec } from "@shopify/react-native-skia";
import type { BodyAnalysis, BodyScan, SegmentValue } from "@/contract";
import { useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { useTheme, type ColorTokens } from "@/theme";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Hairline, Panel, PanelHeader } from "@/ui/Panel";
import { Segmented } from "@/ui/Segmented";
import { Text, TintedText } from "@/ui/Text";
import { BAND_TITLES, dec, ecwBand, pairBalance, SEG_TITLES, segmentScans, SEGMENTS, shortDate, sourceLabel, type Seg } from "../model";

// The front silhouette in a 200×420 box, five segments with gaps between them.
// The person's right is drawn on the viewer's left, as on InBody's sheet.
const HEAD = "M100 13 C111 13 119 23 119 36 C119 50 111 59 100 59 C89 59 81 50 81 36 C81 23 89 13 100 13 Z M92 56 L108 56 L109 70 L91 70 Z";
const TRUNK =
  "M70 76 C78 71 90 70 100 70 C110 70 122 71 130 76 C136 80 137 88 136 96 L132 142 C131 160 129 176 131 192 L135 224 C124 232 112 234 100 234 C88 234 76 232 65 224 L69 192 C71 176 69 160 68 142 L64 96 C63 88 64 80 70 76 Z";
const ARM = "M61 80 C52 82 47 90 46 102 L42 148 C41 158 38 170 36 182 L32 222 C31 230 33 238 38 240 C43 241 46 236 46 228 L50 188 C52 176 55 164 56 152 L60 112 Z";
const LEG = "M67 232 C77 238 88 240 97 240 L96 262 C95 290 92 316 91 338 L89 392 C89 400 90 406 92 412 L74 412 C74 404 75 398 74 392 L70 338 C68 316 66 290 66 262 Z";
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)} ${y}`);
/** Where each segment's leader line lands, in the figure's box. */
const ANCHOR: Record<Seg, [number, number]> = { rightArm: [45, 150], leftArm: [155, 150], trunk: [100, 150], rightLeg: [82, 320], leftLeg: [118, 320] };
/** The figure's visible box: x 30–170, y 10–414. */
const BOX = { x: 30, y: 10, w: 140, h: 404 };
const FIG_H = 300;
const K = FIG_H / BOX.h;
const FIG_W = BOX.w * K;

type Mode = "lean" | "fat" | "ecw";
type Band = "low" | "normal" | "high";
type Tone = { color: string; verdict: "good" | "watch" | "neutral" };

/** Colour is the verdict: lime good, amber to watch, blue neutral (low fat, low water). */
function tone(c: ColorTokens, mode: Mode, band: Band | null): Tone {
  if (!band) return { color: c.textSecondary, verdict: "neutral" };
  if (mode === "lean") return band === "low" ? { color: c.warning, verdict: "watch" } : { color: c.positive, verdict: "good" };
  if (mode === "fat") return band === "high" ? { color: c.warning, verdict: "watch" } : band === "normal" ? { color: c.positive, verdict: "good" } : { color: c.body, verdict: "neutral" };
  return band === "high" ? { color: c.warning, verdict: "watch" } : band === "normal" ? { color: c.water, verdict: "good" } : { color: c.body, verdict: "neutral" };
}

/** Fill strength by how far the segment is from its standard: more mass, a denser fill. */
const strength = (percent: number | null, band: Band | null) => (percent == null ? (band === "high" ? 0.9 : band === "low" ? 0.4 : 0.65) : Math.min(Math.max(0.35 + (percent - 60) / 160, 0.38), 0.95));

type Shown = { kg: number | null; ratio: number | null; percent: number | null; band: Band | null; change: number | null };

/**
 * «Mapa corporal»: the InBody segments on a front silhouette. Each segment is
 * coloured by its lean (or fat) mass against the standard, with its value,
 * % of standard and change since the scan before beside it; then the left vs
 * right balance of arms and legs. Toggle «Agua» shows each segment's ECW ratio.
 */
export function BodyMapCard({ segments, scans }: { segments: NonNullable<BodyAnalysis["segments"]>; scans: BodyScan[] }) {
  const { colors, dark } = useTheme();
  const [mode, setMode] = useState<Mode>(segments.lean ? "lean" : "fat");
  const [w, setW] = useState(0);
  const lean = segmentScans(scans, segments.measuredAt, "segmentalLean");
  const fat = segmentScans(scans, segments.measuredAt, "segmentalFat");
  const ecw = segmentScans(scans, segments.measuredAt, "segmentalEcw");
  const source = lean.current ?? fat.current ?? ecw.current;
  const paths = useMemo(
    () => ({
      head: Skia.Path.MakeFromSVGString(HEAD)!,
      rightArm: Skia.Path.MakeFromSVGString(ARM)!,
      leftArm: Skia.Path.MakeFromSVGString(mirror(ARM))!,
      trunk: Skia.Path.MakeFromSVGString(TRUNK)!,
      rightLeg: Skia.Path.MakeFromSVGString(LEG)!,
      leftLeg: Skia.Path.MakeFromSVGString(mirror(LEG))!,
    }),
    [],
  );

  const shown = (seg: Seg): Shown => {
    if (mode === "ecw") {
      const r = ecw.current?.segmentalEcw?.[seg] ?? null;
      const before = ecw.previous?.segmentalEcw?.[seg];
      return { kg: null, ratio: r, percent: null, band: r != null ? ecwBand(r) : null, change: r != null && before != null ? r - before : null };
    }
    const v: SegmentValue | undefined = (mode === "lean" ? segments.lean : segments.fat)?.[seg];
    const pair = mode === "lean" ? lean : fat;
    const key = mode === "lean" ? "segmentalLean" : "segmentalFat";
    const before = pair.previous?.[key]?.[seg];
    return { kg: v?.kg ?? null, ratio: null, percent: v?.percent ?? null, band: v?.band ?? null, change: v && before != null ? v.kg - before : null };
  };
  const modes = [
    segments.lean ? { value: "lean" as const, label: "Magra" } : null,
    segments.fat ? { value: "fat" as const, label: "Grasa" } : null,
    ecw.current ? { value: "ecw" as const, label: "Agua" } : null,
  ].filter((m): m is { value: Mode; label: string } => !!m);

  const cx = w / 2;
  const fx = (x: number) => cx - FIG_W / 2 + (x - BOX.x) * K;
  const fy = (y: number) => (y - BOX.y) * K;
  const col = Math.max((w - FIG_W) / 2 - 6, 0);
  const lowerIsBetter = mode !== "lean";

  const label = (seg: Seg, side: "left" | "right") => {
    const s = shown(seg);
    const t = tone(colors, mode, s.band);
    const [, ay] = ANCHOR[seg];
    const chg = s.change;
    const flat = chg == null || Math.abs(chg) < (mode === "ecw" ? 0.0005 : 0.005);
    const good = chg == null || flat ? null : (chg < 0) === lowerIsBetter;
    return (
      <View key={seg} style={{ position: "absolute", top: fy(ay) - 30, width: col, [side]: 0, alignItems: side === "left" ? "flex-start" : "flex-end", gap: 2 }} testID={`segment-${seg}`}>
        <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 9 }}>
          {SEG_TITLES[seg]}
        </Text>
        <Text variant="numberSmall" style={{ fontSize: 19, lineHeight: 22 }}>
          {s.ratio != null ? s.ratio.toFixed(3).replace(".", ",") : s.kg != null ? dec(s.kg, 2) : "—"}
          {s.kg != null ? <Text variant="labelSmall" color="textSecondary">{" kg"}</Text> : null}
        </Text>
        {s.band ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: t.color }} />
            <Text variant="labelSmall" style={{ fontSize: 9 }} color={t.verdict === "watch" ? "warning" : "text"}>
              {BAND_TITLES[s.band]}
              {s.percent != null ? ` ${Math.round(s.percent)} %` : ""}
            </Text>
          </View>
        ) : null}
        {chg != null ? (
          <TintedText variant="delta" style={{ fontSize: 9.5 }} tint={good === null ? colors.textSecondary : good ? colors.accentText : colors.warning}>
            {flat ? "=" : chg > 0 ? "▲" : "▼"} {mode === "ecw" ? dec(Math.abs(chg), 3) : dec(Math.abs(chg), 2)}
          </TintedText>
        ) : null}
      </View>
    );
  };

  const trunk = shown("trunk");
  const trunkTone = tone(colors, mode, trunk.band);
  const balanceKey = mode === "fat" ? segments.fat : segments.lean;
  return (
    <Panel style={{ gap: 12 }} testID="body-map">
      <PanelHeader title="Mapa corporal" trailing={`${source ? sourceLabel(source) : "InBody"} · ${shortDate(segments.measuredAt)}`} />
      {modes.length > 1 ? <Segmented options={modes} value={mode} onChange={(m) => (haptics.select(), setMode(m))} testID="body-map-mode" /> : null}
      <View style={{ height: FIG_H + 4 }} onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}>
        {w ? (
          <>
            <Canvas style={{ position: "absolute", width: w, height: FIG_H + 4 }}>
              {/* Scanner rules behind the figure. */}
              {[0.25, 0.5, 0.75].map((f) => (
                <Line key={f} p1={vec(cx - FIG_W / 2 - 8, FIG_H * f)} p2={vec(cx + FIG_W / 2 + 8, FIG_H * f)} color={colors.separator} strokeWidth={1}>
                  <DashPathEffect intervals={[2, 4]} />
                </Line>
              ))}
              {(["rightArm", "leftArm", "rightLeg", "leftLeg"] as Seg[]).map((seg) => {
                const [ax, ay] = ANCHOR[seg];
                const toLeft = seg.startsWith("right");
                return (
                  <Line key={seg} p1={vec(toLeft ? col - 2 : w - col + 2, fy(ay))} p2={vec(fx(ax), fy(ay))} color={colors.textTertiary} strokeWidth={1}>
                    <DashPathEffect intervals={[1.5, 3]} />
                  </Line>
                );
              })}
              <Group transform={[{ translateX: cx - FIG_W / 2 - BOX.x * K }, { translateY: -BOX.y * K }, { scale: K }]}>
                <Path path={paths.head} color={colors.surfaceRaised} />
                <Path path={paths.head} style="stroke" strokeWidth={1.4} color={colors.textTertiary} />
                {SEGMENTS.map((seg) => {
                  const s = shown(seg);
                  const t = tone(colors, mode, s.band);
                  return (
                    <Group key={seg}>
                      <Path path={paths[seg]} color={colors.surfaceRaised} />
                      <Path path={paths[seg]} color={t.color} opacity={strength(s.percent, s.band) * (dark ? 1 : 0.9)} />
                      <Path path={paths[seg]} style="stroke" strokeWidth={1.4} color={dark ? colors.background : colors.text} opacity={dark ? 0.9 : 0.35} />
                    </Group>
                  );
                })}
              </Group>
            </Canvas>
            {label("rightArm", "left")}
            {label("rightLeg", "left")}
            {label("leftArm", "right")}
            {label("leftLeg", "right")}
            <View style={{ position: "absolute", left: cx - 40, width: 80, top: fy(128), alignItems: "center" }} pointerEvents="none">
              <View style={{ alignItems: "center", paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.separator }}>
                <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 8.5 }}>
                  Tronco
                </Text>
                <Text variant="numberSmall" style={{ fontSize: 15, lineHeight: 18 }}>
                  {trunk.ratio != null ? trunk.ratio.toFixed(3).replace(".", ",") : trunk.kg != null ? dec(trunk.kg, 1) : "—"}
                </Text>
                {trunk.band ? (
                  <TintedText variant="labelSmall" style={{ fontSize: 8.5 }} tint={trunkTone.verdict === "watch" ? colors.warning : colors.textSecondary}>
                    {trunk.percent != null ? `${Math.round(trunk.percent)} %` : BAND_TITLES[trunk.band]}
                  </TintedText>
                ) : null}
              </View>
            </View>
          </>
        ) : null}
      </View>
      <Legend mode={mode} />
      {mode !== "ecw" && balanceKey ? (
        <>
          <Hairline />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <BalanceCell title="Brazos" right={balanceKey.rightArm.kg} left={balanceKey.leftArm.kg} />
            <BalanceCell title="Piernas" right={balanceKey.rightLeg.kg} left={balanceKey.leftLeg.kg} />
          </View>
        </>
      ) : null}
      {mode !== "ecw" && segments.balance.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {segments.balance.map((b, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.surfaceRaised }}>
              <Icon name={b.even ? "checkmark" : "scalemass"} size={10} tint={b.even ? colors.accentText : colors.warning} />
              <Text variant="caption">{b.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text variant="footnote" color="textSecondary">
        {mode === "ecw"
          ? "Agua extracelular sobre la total en cada segmento; lo normal es hasta 0,390. Más alto suele indicar inflamación o retención."
          : segments.basis === "height"
            ? "% del estándar para tu altura. ▲▼ cambio desde el escaneo anterior."
            : "% respecto a tu propio peso: añade tu altura al perfil para compararlo con el estándar."}
      </Text>
    </Panel>
  );
}

function Legend({ mode }: { mode: Mode }) {
  const { colors } = useTheme();
  const items: { band: Band; label: string }[] = mode === "lean" ? [{ band: "low", label: "Bajo" }, { band: "normal", label: "Normal" }, { band: "high", label: "Alto" }] : mode === "fat" ? [{ band: "low", label: "Bajo" }, { band: "normal", label: "Normal" }, { band: "high", label: "Alto" }] : [{ band: "normal", label: "Normal" }, { band: "high", label: "Alto" }];
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 14 }}>
      {items.map((it) => (
        <View key={it.band} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2.5, backgroundColor: tone(colors, mode, it.band).color, opacity: strength(it.band === "low" ? 80 : it.band === "normal" ? 100 : 130, it.band) }} />
          <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 9 }}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Right vs left: a balance beam tilting to the heavier side, both values and the difference. */
function BalanceCell({ title, right, left }: { title: string; right: number; left: number }) {
  const { colors } = useTheme();
  const b = pairBalance(right, left);
  const tilt = Math.max(-1, Math.min(1, (b.pct / 10) * (b.stronger === "right" ? -1 : b.stronger === "left" ? 1 : 0)));
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.surfaceRaised, gap: 6 }} testID={`balance-${title}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="labelSmall" color="textSecondary">
          {title}
        </Text>
        <Icon name={b.even ? "checkmark.circle.fill" : "exclamationmark.circle.fill"} size={11} tint={b.even ? colors.accentText : colors.warning} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        {[["D", right], ["I", left]].map(([k, v]) => (
          <View key={k as string} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text variant="labelSmall" color="textSecondary">
              {k as string}
            </Text>
            <Text variant="numberSmall" style={{ fontSize: 15 }}>
              {dec(v as number, 2)}
            </Text>
          </View>
        ))}
      </View>
      {/* The beam: a centre pivot, the heavier side drawn lower. */}
      <View style={{ height: 14, justifyContent: "center" }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: b.even ? colors.accent : colors.warning, transform: [{ rotate: `${tilt * 6}deg` }] }} />
        <View style={{ position: "absolute", left: "50%", marginLeft: -4, bottom: -1, width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: colors.textSecondary }} />
      </View>
      <Text variant="meta" color={b.even ? "textSecondary" : "warning"} style={{ fontSize: 10 }}>
        {b.stronger == null ? "Iguales" : `${b.stronger === "right" ? "Der." : "Izq."} +${dec(b.pct, 1)} %`}
      </Text>
    </View>
  );
}

/** Before any scan with segments: what the map will show, and the way to get it. */
export function BodyMapEmpty({ onScan }: { onScan: () => void }) {
  const { colors } = useTheme();
  const paths = useMemo(() => [HEAD, ARM, mirror(ARM), TRUNK, LEG, mirror(LEG)].map((d) => Skia.Path.MakeFromSVGString(d)!), []);
  const k = 120 / BOX.h;
  return (
    <Panel style={{ flexDirection: "row", gap: 14, alignItems: "center" }} testID="body-map-empty">
      <Canvas style={{ width: BOX.w * k, height: 120 }}>
        <Group transform={[{ translateX: -BOX.x * k }, { translateY: -BOX.y * k }, { scale: k }]}>
          {paths.map((p, i) => (
            <Path key={i} path={p} style="stroke" strokeWidth={3} color={colors.textTertiary}>
              <DashPathEffect intervals={[8, 6]} />
            </Path>
          ))}
        </Group>
      </Canvas>
      <View style={{ flex: 1, gap: 6 }}>
        <Text variant="label" color="textSecondary">
          Mapa corporal
        </Text>
        <Text variant="footnote" color="textSecondary">
          Con un InBody que mida por segmentos verás músculo y grasa de cada brazo, pierna y tronco, y si estás equilibrado.
        </Text>
        <Text variant="button" color="accentText" onPress={onScan} suppressHighlighting>
          Escanear QR
        </Text>
      </View>
    </Panel>
  );
}
