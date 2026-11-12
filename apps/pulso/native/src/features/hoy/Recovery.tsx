import type { OutputOf } from "@/contract";
import { View } from "react-native";
import { useNow } from "@/shell/session";
import { useTheme } from "@/theme";
import { StackBar } from "@/ui/Bars";
import { Pill } from "@/ui/Chip";
import { Gauge } from "@/ui/Gauge";
import { Panel, PanelHeader } from "@/ui/Panel";
import { Sparkline } from "@/ui/Sparkline";
import { StatCell, delta } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { hm, readinessWord } from "./format";

type Daily = OutputOf<"get_daily">;
type Day = Daily["days"][number];

/** The hero: the recovery dial with its figure, the readiness pill, and what it means. */
export function RecoveryPanel({ daily }: { daily: Daily }) {
  const { type, colors } = useTheme();
  const now = useNow(false);
  const r = daily.readiness;
  const word = readinessWord(r.level, new Date(now));
  return (
    <Panel style={{ paddingBottom: 12 }} testID="recovery">
      <PanelHeader title="Recuperación" trailing={r.baselineDays ? `VS ${Math.min(r.baselineDays, 28)} D` : undefined} />
      <View style={{ alignItems: "center", height: 206, marginTop: -2 }}>
        <Gauge value={r.score == null ? null : r.score / 100}>
          <View style={{ alignItems: "center", marginTop: -14 }}>
            <Text style={[type.gauge, { color: r.score == null ? colors.textTertiary : colors.text }]} testID="readiness-score">
              {r.score ?? "—"}
            </Text>
            <Text variant="labelSmall" color="textSecondary" style={{ marginTop: 4, fontSize: 10.5, letterSpacing: 0.84 }}>
              Recuperación %
            </Text>
            <View style={{ marginTop: 10 }}>
              <Pill label={word} tone={r.score == null ? "muted" : "accent"} />
            </View>
          </View>
        </Gauge>
      </View>
      {r.explanation ? (
        <Text variant="footnote" color="textSecondary" style={{ textAlign: "center", paddingHorizontal: 12 }} numberOfLines={3}>
          {r.explanation}
        </Text>
      ) : null}
    </Panel>
  );
}

const series = (days: Day[], pick: (d: Day) => number | null) => days.slice(-14).map(pick);

/** VFC · REPOSO · SUEÑO: today's value, the change vs your baseline, and 14 days of trend (sleep: its stages). */
export function SignalCells({ daily }: { daily: Daily }) {
  const { colors, space } = useTheme();
  const factor = (key: "hrv" | "resting_hr" | "sleep") => daily.readiness.factors.find((f) => f.key === key);
  const today = daily.days.find((d) => d.date === daily.readiness.date);
  const hrv = factor("hrv");
  const rest = factor("resting_hr");
  const sleep = factor("sleep");
  const sleepMin = sleep?.value ?? today?.sleepMinutes ?? null;
  const diff = (f?: { value: number | null; baseline: number | null }) => (f?.value != null && f.baseline != null ? f.value - f.baseline : null);
  const stages = today && !today.sleepManual ? [today.sleepDeep, today.sleepRem, today.sleepCore, today.sleepAwake] : [];
  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <StatCell label="VFC" value={hrv?.value == null ? null : Math.round(hrv.value)} unit="ms" delta={delta(diff(hrv))} testID="cell-hrv">
        <Sparkline values={series(daily.days, (d) => d.hrv)} />
      </StatCell>
      <StatCell
        label={rest?.estimated ? "Reposo est." : "Reposo"}
        value={rest?.value == null ? null : Math.round(rest.value)}
        unit="lpm"
        delta={delta(diff(rest), undefined, false)}
        testID="cell-resting"
      >
        <Sparkline values={series(daily.days, (d) => d.restingHeartRate)} color={colors.textSecondary} />
      </StatCell>
      <StatCell label="Sueño" value={sleepMin == null ? null : hm(sleepMin)} delta={delta(diff(sleep), hm)} testID="cell-sleep">
        {stages.some((s) => (s ?? 0) > 0) ? (
          <View style={{ height: 22, justifyContent: "center" }}>
            <StackBar
              parts={[
                { value: stages[0] ?? 0, color: colors.sleepDeep },
                { value: stages[1] ?? 0, color: colors.sleepRem },
                { value: stages[2] ?? 0, color: colors.sleepCore },
                { value: stages[3] ?? 0, color: colors.sleepAwake },
              ]}
            />
          </View>
        ) : (
          <Sparkline values={series(daily.days, (d) => d.sleepMinutes)} color={colors.sleep} />
        )}
      </StatCell>
    </View>
  );
}

const GOALS = { steps: 8000, energy: 500, exercise: 30 };

/** Pasos · activas · ejercicio against the daily goals (the SwiftUI Hoy's activity rings, as bars). */
export function ActivityPanel({ day }: { day: Day | undefined }) {
  const { colors, space } = useTheme();
  const items = [
    { label: "Pasos", value: day?.steps, goal: GOALS.steps, fmt: (n: number) => Math.round(n).toLocaleString("es-MX").replace(/,/g, " "), unit: undefined, color: colors.body },
    { label: "Activas", value: day?.activeEnergy, goal: GOALS.energy, fmt: (n: number) => String(Math.round(n)), unit: "kcal", color: colors.energy },
    { label: day?.exerciseMinutesEstimated ? "Ejercicio est." : "Ejercicio", value: day?.exerciseMinutes, goal: GOALS.exercise, fmt: (n: number) => String(Math.round(n)), unit: "min", color: colors.accent },
  ];
  return (
    <Panel testID="activity">
      <PanelHeader title="Actividad" trailing="Meta 8 000 · 500 · 30" />
      <View style={{ flexDirection: "row", gap: space.md, marginTop: 10 }}>
        {items.map((it) => (
          <View key={it.label} style={{ flex: 1 }}>
            <StatCell bare label={it.label} value={it.value == null ? null : it.fmt(it.value)} unit={it.unit} size="numberSmall" />
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.separator, marginTop: 8, overflow: "hidden" }}>
              <View style={{ height: 4, width: `${Math.min(100, ((it.value ?? 0) / it.goal) * 100)}%`, backgroundColor: it.color }} />
            </View>
          </View>
        ))}
      </View>
    </Panel>
  );
}
