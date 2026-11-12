import type { BodyAnalysis, BodyGauge, BodyProjection, BodyScan } from "@/contract";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTheme, type ColorTokens } from "@/theme";
import { haptics } from "@/ui/haptics";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Hairline, Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Segmented } from "@/ui/Segmented";
import { StatCell } from "@/ui/StatCell";
import { Text, TintedText } from "@/ui/Text";
import { StackBar, Pips } from "@/ui/Bars";
import { Gauge } from "@/ui/Gauge";
import { ago, BAND_TITLES, carried, composition, dec, delta, evolution, GAUGE_TITLES, gaugeGood, leanMass, metricInfo, METRICS, shortDate, signed, sourceLabel, waterProteinMineralFat, type Carried, type Delta, type Metric } from "../model";
import { Donut, EvolutionChart, HalfDial, TrendChart } from "./Charts";

const metricColor = (c: ColorTokens, m: string) => (m === "skeletalMuscleMass" ? c.protein : m === "weight" || m === "bmi" ? c.body : c.fat);

/** «▼ 0,4 kg ✓»: arrow, amount, and the verdict as a mark, never hue alone. */
export function DeltaText({ d, unit, small }: { d: Delta | null; unit: string; small?: boolean }) {
  const { colors } = useTheme();
  if (!d) return null;
  const tint = d.good === null ? colors.textSecondary : d.good ? colors.accentText : colors.warning;
  const arrow = d.arrow === "flat" ? "=" : d.arrow === "down" ? "▼" : "▲";
  const mark = d.good === null ? "" : d.good ? " ✓" : " !";
  return (
    <TintedText variant="delta" tint={tint} style={small ? { fontSize: 9.5 } : undefined} accessibilityLabel={d.good === null ? undefined : d.good ? "bien" : "a vigilar"}>
      {arrow} {dec(Math.abs(d.value))} {unit}
      {mark}
    </TintedText>
  );
}

const statDelta = (d: Delta | null, unit: string) => (d ? { text: `${d.arrow === "flat" ? "=" : d.arrow === "down" ? "▼" : "▲"} ${dec(Math.abs(d.value))} ${unit}${d.good === null ? "" : d.good ? " ✓" : " !"}`, tone: d.good === null ? ("flat" as const) : d.good ? ("good" as const) : ("bad" as const) } : null);

/** «hace 3 días» under a value that comes from an older scan than the newest. */
function Age({ c }: { c: Carried | null }) {
  if (!c || c.fresh) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
      <Icon name="clock.arrow.circlepath" size={9} color="textTertiary" />
      <Text variant="labelSmall" color="textTertiary" style={{ fontSize: 9, textTransform: "none", letterSpacing: 0.2 }}>
        {ago(c.at)}
      </Text>
    </View>
  );
}

/**
 * The hero: today's weight big with its change, the InBody score on a dial, and
 * the composition carried forward from the newest scan that measured it, each
 * with how old it is, so a plain weigh-in never blanks fat or muscle.
 */
export function BodyHero({ scans }: { scans: BodyScan[] }) {
  const { colors } = useTheme();
  const latest = scans[0]!;
  const weight = carried(scans, "weight");
  const fat = carried(scans, "percentBodyFat");
  const muscle = carried(scans, "skeletalMuscleMass");
  const fatKg = carried(scans, "bodyFatMass");
  const score = carried(scans, "inbodyScore");
  const cell = (label: string, c: Carried | null, unit: string, lowerIsBetter: boolean, testID: string) => (
    <View style={{ flex: 1, padding: 10, borderRadius: 11, backgroundColor: colors.surfaceRaised }} testID={testID}>
      <StatCell bare label={label} value={c ? dec(c.value) : null} unit={unit} delta={statDelta(delta(c?.value, c?.previous, lowerIsBetter), unit)} size="stat" testID={`${testID}-cell`} />
      <Age c={c} />
    </View>
  );
  return (
    <Panel style={{ gap: 14 }} testID="body-hero">
      <PanelHeader title="Composición" trailing={`${shortDate(latest.measuredAt)} · ${sourceLabel(latest)}`} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="labelSmall" color="textSecondary">
            Peso
          </Text>
          <Text variant="gauge" style={{ fontSize: 66, lineHeight: 70 }} adjustsFontSizeToFit numberOfLines={1} testID="hero-weight">
            {weight ? dec(weight.value) : "—"}
            <Text variant="label" color="textSecondary">
              {" "}
              kg
            </Text>
          </Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <DeltaText d={delta(weight?.value, weight?.previous, true)} unit="kg" />
            {weight ? (
              <Text variant="labelSmall" color="textTertiary" style={{ fontSize: 9 }}>
                {weight.previous != null ? "vs anterior" : ""}
              </Text>
            ) : null}
          </View>
        </View>
        {score ? (
          <View style={{ alignItems: "center" }} testID="hero-score">
            <Gauge value={score.value / 100} size={118} stroke={9}>
              <Text variant="stat" style={{ fontSize: 30, lineHeight: 32 }}>
                {dec(score.value, 0)}
              </Text>
              <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 8.5 }}>
                InBody
              </Text>
            </Gauge>
            <Text variant="labelSmall" color="textTertiary" style={{ fontSize: 9, marginTop: -8 }}>
              {score.fresh ? "puntos" : ago(score.at)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {cell("Grasa", fat, "%", true, "hero-fat")}
        {cell("Músculo", muscle, "kg", false, "hero-muscle")}
        {cell("M. grasa", fatKg, "kg", true, "hero-fatkg")}
      </View>
    </Panel>
  );
}

/** «Tendencia»: pick a metric, read the trend and where it goes; «Fijar meta». */
export function TrendCard({ projection, metric, onMetric, goal, onGoal }: { projection: BodyProjection | undefined; metric: Metric; onMetric: (m: Metric) => void; goal: number | null; onGoal: () => void }) {
  const { colors } = useTheme();
  const [sel, setSel] = useState<{ at: number; value: number; projected: boolean } | null>(null);
  const info = metricInfo(metric);
  const color = metricColor(colors, metric);
  const p = projection;
  const value = sel?.value ?? p?.current ?? p?.observed.at(-1)?.value ?? 0;
  return (
    <Panel style={{ gap: 10 }} testID="trend-card">
      <PanelHeader
        title="Tendencia"
        trailing={
          <PressableScale onPress={onGoal} style={{ flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 8, height: 26, borderRadius: 6, backgroundColor: colors.surfaceRaised }} testID="goal-button">
            <Icon name="flag.checkered" size={11} color="accentText" />
            <Text variant="labelSmall">{goal != null ? "Meta" : "Fijar meta"}</Text>
          </PressableScale>
        }
      />
      <Segmented options={METRICS.map((m) => ({ value: m.value, label: m.title }))} value={metric} onChange={(m) => (setSel(null), onMetric(m))} />
      {!p || p.observed.length < 3 ? (
        <TrendWaiting observed={p?.observed ?? []} unit={p?.unit ?? info.unit} title={info.title} note={p?.note} />
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <Text variant="number">
              {dec(value)}
              <Text variant="label" color="textSecondary">
                {" "}
                {p.unit}
              </Text>
            </Text>
            {sel ? (
              <Text variant="meta" color="textSecondary">
                {shortDate(sel.at)} · {sel.projected ? "proyección" : "medición"}
              </Text>
            ) : p.slopePerWeek != null ? (
              <View style={{ alignItems: "flex-end" }}>
                <DeltaText d={delta(p.slopePerWeek, 0, info.lowerIsBetter)} unit={`${p.unit}/sem`} />
                <Text variant="labelSmall" color="textSecondary">
                  tendencia
                </Text>
              </View>
            ) : null}
          </View>
          <TrendChart observed={p.observed} band={p.band} goal={goal} color={color} onSelect={(s) => (s && haptics.select(), setSel(s))} />
          {p.horizons.length ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              {p.horizons.map((h) => (
                <View key={h.weeks} style={{ flex: 1, padding: 8, borderRadius: 9, backgroundColor: colors.surfaceRaised, gap: 2 }}>
                  <Text variant="labelSmall" color="textSecondary">
                    {h.weeks} sem
                  </Text>
                  <Text variant="numberSmall">{dec(h.value)}</Text>
                  <Text variant="labelSmall" color="textTertiary" style={{ fontSize: 9 }}>
                    {dec(h.low)}–{dec(h.high)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {p.goal ? (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Icon name={p.goal.eta != null ? "flag.checkered" : "flag"} size={12} tint={color} />
              <TintedText variant="footnote" tint={color} style={{ flex: 1 }}>
                {p.goal.message}
              </TintedText>
            </View>
          ) : (
            <Text variant="footnote" color="textSecondary">
              {p.note}
            </Text>
          )}
        </>
      )}
    </Panel>
  );
}

/**
 * Under three readings a trend line is noise: show the readings there are as
 * dated tiles, how many more it takes, and the engine's reason.
 */
function TrendWaiting({ observed, unit, title, note }: { observed: { at: number; value: number }[]; unit: string; title: string; note?: string }) {
  const { colors } = useTheme();
  const missing = 3 - observed.length;
  return (
    <View style={{ gap: 12, paddingVertical: 4 }} testID="trend-waiting">
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[0, 1, 2].map((i) => {
          const o = observed[i];
          return (
            <View key={i} style={{ flex: 1, height: 64, padding: 9, borderRadius: 10, gap: 3, backgroundColor: o ? colors.surfaceRaised : "transparent", borderWidth: 1, borderColor: colors.separator, borderStyle: o ? "solid" : "dashed", justifyContent: "center" }}>
              {o ? (
                <>
                  <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 9 }}>
                    {shortDate(o.at)}
                  </Text>
                  <Text variant="numberSmall">
                    {dec(o.value)}
                    <Text variant="labelSmall" color="textSecondary">{` ${unit}`}</Text>
                  </Text>
                </>
              ) : (
                <Icon name="plus" size={14} color="textTertiary" />
              )}
            </View>
          );
        })}
      </View>
      <Pips count={3} current={observed.length} />
      <View style={{ gap: 3 }}>
        <Text variant="headline">
          {observed.length ? `Faltan ${missing} ${missing === 1 ? "medición" : "mediciones"} de ${title.toLowerCase()}` : `Sin datos de ${title.toLowerCase()}`}
        </Text>
        <Text variant="footnote" color="textSecondary">
          {note && observed.length ? note : "Aparecen con tus mediciones de InBody o de Salud. Con tres en días distintos, separadas una semana, verás hacia dónde vas."}
        </Text>
      </View>
    </View>
  );
}

/** A small tile: mono key, rounded figure, unit, an optional note. */
function Tile({ label, value, unit, note, testID }: { label: string; value: string; unit?: string; note?: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexBasis: "45%", flexGrow: 1, flexShrink: 1, padding: 9, borderRadius: 9, backgroundColor: colors.surfaceRaised, gap: 3 }} testID={testID}>
      <Text variant="labelSmall" color="textSecondary" numberOfLines={1} style={{ fontSize: 9 }}>
        {label}
      </Text>
      <Text variant="numberSmall" numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text variant="labelSmall" color="textSecondary">{` ${unit}`}</Text> : null}
      </Text>
      {note ? (
        <Text variant="labelSmall" color="textTertiary" numberOfLines={1} style={{ fontSize: 8.5 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * «Desglose»: what the weight is made of. The donut splits muscle, fat and the
 * rest of the lean mass; the bar is InBody's analysis (water + protein +
 * minerals + fat = weight).
 */
export function CompositionCard({ scan }: { scan: BodyScan }) {
  const { colors } = useTheme();
  const hue: Record<string, string> = { muscle: colors.protein, fat: colors.fat, rest: colors.carbs, water: colors.water, protein: colors.protein, mineral: colors.textSecondary };
  const slices = composition(scan);
  const lean = leanMass(scan);
  const parts = waterProteinMineralFat(scan);
  if (!slices.length && !parts) return null;
  return (
    <Panel style={{ gap: 14 }} testID="body-composition">
      <PanelHeader title="Desglose" trailing={`${sourceLabel(scan)} · ${shortDate(scan.measuredAt)}`} />
      {slices.length ? (
        <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
          <Donut slices={slices.map((s) => ({ kg: s.kg, color: hue[s.key]! }))}>
            {lean != null ? (
              <View style={{ alignItems: "center" }}>
                <Text variant="numberSmall">{dec(lean)}</Text>
                <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 8.5 }}>
                  kg magro
                </Text>
              </View>
            ) : null}
          </Donut>
          <View style={{ flex: 1, gap: 8 }}>
            {slices.map((s) => (
              <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: hue[s.key] }} />
                <Text variant="subhead" style={{ flex: 1 }}>
                  {s.title}
                </Text>
                <Text variant="numberSmall" style={{ fontSize: 15 }}>
                  {dec(s.kg)} <Text variant="labelSmall" color="textSecondary">kg</Text>
                </Text>
                <Text variant="labelSmall" color="textTertiary" style={{ width: 30, textAlign: "right", fontSize: 9 }}>
                  {scan.weight ? `${Math.round((s.kg / scan.weight) * 100)}%` : ""}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {parts ? (
        <View style={{ gap: 8 }}>
          <Hairline />
          <StackBar height={12} parts={parts.map((x) => ({ value: x.kg, color: hue[x.key]! }))} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            {parts.map((x) => (
              <View key={x.key} style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: hue[x.key] }} />
                  <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 8.5 }} numberOfLines={1}>
                    {x.title}
                  </Text>
                </View>
                <Text variant="numberSmall" style={{ fontSize: 15 }}>
                  {dec(x.kg)}
                  <Text variant="labelSmall" color="textSecondary">{x.key === "water" ? " L" : " kg"}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {scan.softLeanMass != null || scan.boneMineralContent != null || scan.bodyCellMass != null || scan.smi != null ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {scan.softLeanMass != null ? <Tile label="Magra blanda" value={dec(scan.softLeanMass)} unit="kg" /> : null}
          {scan.bodyCellMass != null ? <Tile label="Masa celular" value={dec(scan.bodyCellMass)} unit="kg" /> : null}
          {scan.boneMineralContent != null ? <Tile label="Mineral óseo" value={dec(scan.boneMineralContent, 2)} unit="kg" /> : null}
          {scan.smi != null ? <Tile label="SMI" value={dec(scan.smi)} unit="kg/m²" note="brazos + piernas / altura²" /> : null}
        </View>
      ) : null}
    </Panel>
  );
}

/** An InBody-style linear meter for a ratio: the normal zone shaded, the value as a pin, the previous as a tick. */
function RatioMeter({ value, previous, min, max, low, high }: { value: number; previous: number | null; min: number; max: number; low: number; high: number }) {
  const { colors } = useTheme();
  const at = (v: number) => `${Math.min(Math.max((v - min) / (max - min), 0), 1) * 100}%` as const;
  const over = value > high || value < low;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: 18, justifyContent: "center" }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.separator }} />
        <View style={{ position: "absolute", left: at(low), width: `${((high - low) / (max - min)) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.accent, opacity: 0.45 }} />
        {previous != null ? <View style={{ position: "absolute", left: at(previous), marginLeft: -1, width: 2, height: 12, borderRadius: 1, backgroundColor: colors.textSecondary }} /> : null}
        <View style={{ position: "absolute", left: at(value), marginLeft: -7, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: colors.surface, backgroundColor: over ? colors.warning : colors.text }} />
      </View>
      <View style={{ height: 11 }}>
        {[min, low, high, max].map((t, i) => (
          <Text key={i} variant="labelSmall" color="textTertiary" style={{ position: "absolute", fontSize: 8.5, ...(i === 3 ? { right: 0 } : { left: at(t), marginLeft: i ? -12 : 0 }) }}>
            {dec(t, 3)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * «Metabolismo y agua»: basal metabolic rate, body water split into
 * intracellular and extracellular, the ECW/TBW ratio against InBody's normal
 * (0,360–0,390), and the phase angle. Each value from its newest scan.
 */
export function MetabolismCard({ scans }: { scans: BodyScan[] }) {
  const { colors } = useTheme();
  const bmr = carried(scans, "bmr");
  const tbw = carried(scans, "totalBodyWater");
  const icw = carried(scans, "intracellularWater");
  const ecw = carried(scans, "extracellularWater");
  const ratio = carried(scans, "ecwRatio");
  const phase = carried(scans, "phaseAngle");
  if (!bmr && !tbw && !ratio && !phase) return null;
  const ref = [bmr, tbw, ratio, phase].filter((c): c is Carried => !!c).sort((a, b) => b.at - a.at)[0]!;
  return (
    <Panel style={{ gap: 14 }} testID="body-metabolism">
      <PanelHeader title="Metabolismo y agua" trailing={shortDate(ref.at)} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {bmr ? (
          <View style={{ flex: 1 }}>
            <StatCell bare label="Metabolismo basal" value={dec(bmr.value, 0)} unit="kcal" size="number" delta={statDelta(delta(bmr.value, bmr.previous, false), "kcal")} />
            <Text variant="labelSmall" color="textTertiary" style={{ fontSize: 9, marginTop: 3, textTransform: "none", letterSpacing: 0.2 }}>
              en reposo, al día
            </Text>
          </View>
        ) : null}
        {tbw ? (
          <View style={{ flex: 1 }}>
            <StatCell bare label="Agua total" value={dec(tbw.value)} unit="L" size="number" />
            {icw && ecw ? (
              <View style={{ marginTop: 8, gap: 4 }}>
                <StackBar height={6} parts={[{ value: icw.value, color: colors.water }, { value: ecw.value, color: colors.body }]} />
                <Text variant="labelSmall" color="textSecondary" style={{ fontSize: 8.5 }}>
                  Intra {dec(icw.value)} · Extra {dec(ecw.value)} L
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {ratio ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text variant="subhead">Agua extracelular / total</Text>
            <Text variant="numberSmall">{dec(ratio.value, 3)}</Text>
          </View>
          <RatioMeter value={ratio.value} previous={ratio.previous} min={0.34} max={0.42} low={0.36} high={0.39} />
          <Text variant="footnote" color="textSecondary">
            {ratio.value > 0.39 ? "Por encima de lo normal: puede ser retención de líquidos o inflamación." : "Dentro de lo normal: agua bien repartida."}
          </Text>
        </View>
      ) : null}
      {phase ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Tile label="Ángulo de fase" value={dec(phase.value)} unit="°" note={phase.previous != null ? `antes ${dec(phase.previous)}°` : "salud celular"} />
        </View>
      ) : null}
    </Panel>
  );
}

function BandChip({ gauge }: { gauge: Pick<BodyGauge, "metric" | "band"> }) {
  const { colors } = useTheme();
  const good = gaugeGood(gauge);
  const tint = good === true ? colors.accentText : good === false ? colors.warning : colors.textSecondary;
  const icon: SFSymbol = good === true ? "checkmark.circle.fill" : good === false ? "exclamationmark.circle.fill" : "info.circle.fill";
  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 7, height: 22, borderRadius: 6, backgroundColor: colors.surfaceRaised }}>
      <Icon name={icon} size={10} tint={tint} />
      <TintedText variant="labelSmall" tint={tint}>
        {BAND_TITLES[gauge.band]}
      </TintedText>
    </View>
  );
}

/** One InBody bar: the value against the normal zone, a tick for the previous scan, the ticks under it. */
export function GaugeBar({ gauge }: { gauge: BodyGauge }) {
  const { colors } = useTheme();
  const color = metricColor(colors, gauge.metric);
  const unit = gauge.unit === "nivel" ? "" : ` ${gauge.unit}`;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text variant="subhead" style={{ flex: 1 }}>
          {GAUGE_TITLES[gauge.metric]}
        </Text>
        <Text variant="numberSmall">
          {dec(gauge.value)}
          <Text variant="labelSmall" color="textSecondary">
            {unit}
          </Text>
        </Text>
        <BandChip gauge={gauge} />
      </View>
      <View style={{ height: 16, justifyContent: "center" }}>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.separator }} />
        <View style={{ position: "absolute", left: `${gauge.at.low * 100}%`, width: `${(gauge.at.high - gauge.at.low) * 100}%`, top: 0, bottom: 0, backgroundColor: colors.text, opacity: 0.07, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.textSecondary }} />
        <View style={{ position: "absolute", left: 0, width: `${Math.max(gauge.at.value * 100, 3)}%`, height: 10, borderRadius: 5, backgroundColor: color }} />
        {gauge.at.previous != null ? <View style={{ position: "absolute", left: `${gauge.at.previous * 100}%`, width: 2.5, top: 0, bottom: 0, borderRadius: 2, backgroundColor: colors.text, opacity: 0.55 }} /> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {gauge.ticks
          .filter((_, i) => i % 2 === 0)
          .map((t, i) => (
            <Text key={i} variant="labelSmall" color="textTertiary" style={{ fontSize: 8.5 }}>
              {t}
            </Text>
          ))}
      </View>
      <Text variant="meta" color="textSecondary" numberOfLines={2}>
        Normal {dec(gauge.normal.low)}–{dec(gauge.normal.high)}
        {unit}
        {gauge.percent != null ? ` · ${Math.round(gauge.percent)} % del estándar` : ""}
        {gauge.previous != null ? ` · antes ${dec(gauge.previous)}${unit}` : ""}
      </Text>
    </View>
  );
}

export function MuscleFatCard({ analysis }: { analysis: BodyAnalysis }) {
  const b = analysis.basis;
  return (
    <Panel style={{ gap: 14 }}>
      <PanelHeader title="Músculo y grasa" />
      {analysis.muscleFat ? (
        <>
          {analysis.muscleFat.gauges.map((g) => (
            <GaugeBar key={g.metric} gauge={g} />
          ))}
          {b ? (
            <Text variant="footnote" color="textSecondary">
              % del estándar para {(b.heightCm / 100).toFixed(2).replace(".", ",")} m{b.sex ? (b.sex === "male" ? " (hombre)" : " (mujer)") : ""}: {dec(b.standardWeight)} kg.
              {b.heightFrom === "scan" ? " Altura deducida del IMC del escaneo." : ""}
              {b.sex == null ? " Sin sexo en el perfil uso un promedio." : ""}
            </Text>
          ) : null}
        </>
      ) : (
        <View style={{ gap: 4 }}>
          <Text variant="headline">{b ? "Falta un escaneo completo" : "Falta tu altura"}</Text>
          <Text variant="footnote" color="textSecondary">
            {b ? "Con un escaneo de InBody (peso, músculo y grasa) verás dónde está cada uno." : "Añade altura y sexo a tu perfil (en Ajustes de pulso.bixku.online) y comparo peso, músculo y grasa con lo normal para ti."}
          </Text>
        </View>
      )}
    </Panel>
  );
}

/** «Obesidad»: BMI and % fat against their normal ranges, the visceral fat dial with its area, waist and waist-hip ratio. */
export function ObesityCard({ gauges, scans }: { gauges: BodyGauge[]; scans: BodyScan[] }) {
  const { colors } = useTheme();
  const visceral = gauges.find((g) => g.metric === "visceralFatLevel");
  const vfa = carried(scans, "visceralFatArea");
  const waist = carried(scans, "waistCircumference");
  const whr = carried(scans, "waistHipRatio");
  const bars = gauges.filter((g) => g.metric !== "visceralFatLevel");
  return (
    <Panel style={{ gap: 14 }} testID="body-obesity">
      <PanelHeader title="Obesidad" />
      {bars.map((g) => (
        <GaugeBar key={g.metric} gauge={g} />
      ))}
      {visceral ? (
        <>
          {bars.length ? <Hairline /> : null}
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }} testID="visceral">
            <HalfDial at={visceral.at} color={colors.text} good={colors.positive} caution={colors.warning} width={140} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text variant="labelSmall" color="textSecondary">
                Grasa visceral
              </Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text variant="stat">{dec(visceral.value, 0)}</Text>
                <BandChip gauge={visceral} />
              </View>
              <Text variant="footnote" color="textSecondary">
                Nivel de 1 a 20; sano hasta 9.{visceral.previous != null ? ` Antes ${dec(visceral.previous, 0)}.` : ""}
              </Text>
            </View>
          </View>
        </>
      ) : null}
      {vfa || waist || whr ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {vfa ? <Tile label="Área visceral" value={dec(vfa.value, 0)} unit="cm²" note={vfa.value < 100 ? "normal < 100" : "alto ≥ 100"} /> : null}
          {waist ? <Tile label="Cintura" value={dec(waist.value)} unit="cm" note={waist.previous != null ? `antes ${dec(waist.previous)}` : undefined} /> : null}
          {whr ? <Tile label="Cintura/cadera" value={dec(whr.value, 2)} note={whr.value <= 0.9 ? "normal ≤ 0,90" : "alto > 0,90"} /> : null}
        </View>
      ) : null}
    </Panel>
  );
}

/** «Evolución»: weight, muscle and fat as change since the first of the last 24 full scans. */
export function EvolutionCard({ scans }: { scans: BodyScan[] }) {
  const { colors } = useTheme();
  const points = useMemo(() => evolution(scans), [scans]);
  const [i, setI] = useState(points.length - 1);
  if (points.length < 2)
    return (
      <Panel style={{ gap: 4 }}>
        <PanelHeader title="Evolución" />
        <Text variant="headline">Hace falta otro escaneo</Text>
        <Text variant="footnote" color="textSecondary">
          Con dos escaneos de InBody verás cómo cambian peso, músculo y grasa.
        </Text>
      </Panel>
    );
  const shown = points[Math.min(i, points.length - 1)]!;
  const series = [
    { key: "weight", title: "Peso", color: colors.body },
    { key: "muscle", title: "Músculo", color: colors.protein },
    { key: "fat", title: "Masa grasa", color: colors.fat },
  ];
  return (
    <Panel style={{ gap: 10 }}>
      <PanelHeader title="Evolución" trailing={`${shortDate(shown.at)} · desde el ${shortDate(points[0]!.at)}`} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {series.map((s) => (
          <View key={s.key} style={{ flex: 1 }}>
            <TintedText variant="labelSmall" tint={s.color}>
              {s.title}
            </TintedText>
            <Text variant="numberSmall">{signed(shown[s.key as "weight"])} kg</Text>
          </View>
        ))}
      </View>
      <EvolutionChart points={points} series={series} onSelect={(n) => (haptics.select(), setI(n))} />
    </Panel>
  );
}
