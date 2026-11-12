import type { Substance, SubstanceCorrelation, SubstanceEntry, SubstanceSummary } from "@/contract";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { SwipeRow } from "@/dieta/ui/SwipeRow";
import { heatmapColumns, historyDayTitle, WEEKDAY_LETTERS } from "@/medicacion/model";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { StatCell } from "@/ui/StatCell";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { CORRELATION_SYMBOL, days, entryDetail, entrySubtitle, entryTitle, formSymbol, lastUseCaption, levelOpacity, weeksReadout } from "../model";
import { Glyph } from "./Glyph";

/** One calm colour for the whole feature; levels are its opacity, never red or green. */
export const useTint = () => useTheme().colors.body;

/** Days in a row without use, and when the last one was. */
export function SubstanceHero({ summary }: { summary: SubstanceSummary }) {
  const { type, colors } = useTheme();
  const tint = useTint();
  const caption = lastUseCaption(summary);
  return (
    <Panel style={{ gap: 6 }} testID="substance-hero">
      <PanelHeader title="Sin consumo" trailing={<Icon name="calendar.badge.clock" size={13} tint={tint} />} />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <Text style={[type.hero, { color: colors.text }]}>{summary.daysWithout ?? "—"}</Text>
        {summary.daysWithout != null ? (
          <Text variant="label" color="textSecondary">
            {days(summary.daysWithout)}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text variant="footnote" color="textSecondary">
          {caption}
        </Text>
      ) : null}
      {summary.drinkDays ? (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Icon name="wineglass" size={12} color="textSecondary" />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            Además, {summary.drinkDays} {days(summary.drinkDays)} con bebidas anotadas en Dieta.
          </Text>
        </View>
      ) : null}
    </Panel>
  );
}

export function SubstanceStats({ summary }: { summary: SubstanceSummary }) {
  const avg = summary.avgDaysPerWeek;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <StatCell label="Esta semana" value={summary.daysThisWeek} unit={days(summary.daysThisWeek)} />
      <StatCell label="Promedio" value={avg == null ? null : String(Math.round(avg * 10) / 10).replace(".", ",")} unit="días/sem" />
      <StatCell label="Más largo sin" value={summary.longestWithout} unit={days(summary.longestWithout)} />
    </View>
  );
}

/** Eight weeks as columns, weekdays as rows (lunes first); darker = more that day. Tap a day to read it. */
export function SubstanceHeatmap({ summary }: { summary: SubstanceSummary }) {
  const { colors } = useTheme();
  const tint = useTint();
  const [selected, setSelected] = useState<string | null>(null);
  const columns = heatmapColumns(summary.days);
  const used = summary.days.filter((d) => d.uses > 0).length;
  const picked = summary.days.find((d) => d.date === selected);
  const readout = picked
    ? `${historyDayTitle(picked.date, summary.today)}: ${picked.uses ? `${picked.uses} ${picked.uses === 1 ? "registro" : "registros"}` : "sin consumo"}`
    : `${used} ${days(used)} con consumo`;
  return (
    <Panel style={{ gap: 10 }} testID="substance-heatmap">
      <PanelHeader title="Últimas 8 semanas" trailing={readout} />
      <View style={{ flexDirection: "row", gap: 5 }} accessible accessibilityLabel={`${used} ${days(used)} con consumo en las últimas 8 semanas`}>
        <View style={{ gap: 5 }}>
          {WEEKDAY_LETTERS.map((l) => (
            <View key={l} style={{ height: 22, justifyContent: "center" }}>
              <Text variant="labelSmall" color="textTertiary">
                {l}
              </Text>
            </View>
          ))}
        </View>
        {columns.map((col, c) => (
          <View key={c} style={{ flex: 1, gap: 5 }}>
            {col.map((d, r) =>
              d ? (
                <Pressable
                  key={d.date}
                  onPress={() => {
                    haptics.select();
                    setSelected(selected === d.date ? null : d.date);
                  }}
                  style={{ height: 22, borderRadius: 4, borderWidth: d.date === selected || d.date === summary.today ? 1.5 : 0, borderColor: d.date === selected ? colors.text : tint }}
                >
                  <View style={{ position: "absolute", inset: 0, borderRadius: 4, backgroundColor: tint, opacity: levelOpacity(d.uses > 0 ? Math.max(d.level, 1) : 0) }} />
                </Pressable>
              ) : (
                <View key={`e${r}`} style={{ height: 22 }} />
              ),
            )}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 4 }} accessibilityElementsHidden>
        <Text variant="labelSmall" color="textTertiary">
          Menos
        </Text>
        {[0, 1, 2, 3].map((l) => (
          <View key={l} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: tint, opacity: levelOpacity(l) }} />
        ))}
        <Text variant="labelSmall" color="textTertiary">
          Más
        </Text>
      </View>
    </Panel>
  );
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const weekLabel = (start: string) => {
  const [, m, d] = start.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
};

/** Days with use per ISO week, this week lighter, the person's own maximum as a dashed rule. Tap a week to read it. */
export function SubstanceWeeks({ summary, goal }: { summary: SubstanceSummary; goal: number | null }) {
  const { colors, hairline } = useTheme();
  const tint = useTint();
  const [selected, setSelected] = useState<string | null>(null);
  const H = 120;
  const week = summary.weeks.find((w) => w.weekStart === selected) ?? null;
  return (
    <Panel style={{ gap: 10 }} testID="substance-weeks">
      <PanelHeader title="Días por semana" trailing={weeksReadout(summary, week)} />
      <View style={{ height: H, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        {goal != null ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: (Math.min(goal, 7) / 7) * H, borderTopWidth: hairline, borderStyle: "dashed", borderColor: colors.textSecondary }}>
            <Text variant="labelSmall" color="textSecondary" style={{ position: "absolute", left: 0, bottom: 2 }}>
              Tu máximo
            </Text>
          </View>
        ) : null}
        {summary.weeks.map((w, i) => {
          const current = i === summary.weeks.length - 1;
          const dim = selected != null && selected !== w.weekStart;
          return (
            <Pressable
              key={w.weekStart}
              onPress={() => {
                haptics.select();
                setSelected(selected === w.weekStart ? null : w.weekStart);
              }}
              accessibilityLabel={`Semana del ${weekLabel(w.weekStart)}: ${w.days} ${days(w.days)}`}
              style={{ flex: 1, height: H, justifyContent: "flex-end" }}
            >
              <View style={{ height: Math.max(w.days ? 6 : 2, (w.days / 7) * H), borderRadius: 5, backgroundColor: tint, opacity: (current ? 0.45 : 0.9) * (dim ? 0.45 : 1) }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {summary.weeks.map((w, i) => (
          <Text key={w.weekStart} variant="labelSmall" color="textTertiary" style={{ flex: 1, textAlign: "center" }} numberOfLines={1}>
            {i % 2 === 0 ? weekLabel(w.weekStart) : " "}
          </Text>
        ))}
      </View>
    </Panel>
  );
}

export type BarRow = { id: string; label: string; symbol?: string | null; uses: number };

/** Uses split some way (time of day, form, substance) as soft horizontal bars. */
export function SubstanceBars({ title, rows }: { title: string; rows: BarRow[] }) {
  const { colors, type } = useTheme();
  const tint = useTint();
  const top = Math.max(1, ...rows.map((r) => r.uses));
  return (
    <Panel style={{ gap: 10 }}>
      <PanelHeader title={title} />
      {rows.map((r) => (
        <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessible accessibilityLabel={`${r.label}: ${r.uses}`}>
          <View style={{ width: 120, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Glyph symbol={r.symbol ?? null} size={13} tint={colors.textSecondary} />
            <Text variant="subhead" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {r.label}
            </Text>
          </View>
          <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: "hidden" }}>
            <View style={{ width: `${(r.uses / top) * 100}%`, minWidth: r.uses ? 8 : 0, height: 10, borderRadius: 5, backgroundColor: tint }} />
          </View>
          <Text style={[type.numberSmall, { fontSize: 14, color: colors.text, minWidth: 22, textAlign: "right" }]}>{r.uses}</Text>
        </View>
      ))}
    </Panel>
  );
}

/** Soft comparisons between nights with and without use: only the ones with enough nights speak. */
export function SubstanceCorrelations({ correlations }: { correlations: SubstanceCorrelation[] }) {
  const tint = useTint();
  const ready = correlations.filter((c) => c.enough && c.text);
  const waiting = correlations.filter((c) => !c.enough || !c.text);
  return (
    <Panel style={{ gap: 10 }} testID="substance-correlations">
      <PanelHeader title="Tu sueño y recuperación" />
      {!ready.length && waiting[0] ? (
        <Text variant="footnote" color="textSecondary">
          Hacen falta más noches para comparar ({waiting[0].nWith} con · {waiting[0].nWithout} sin).
        </Text>
      ) : (
        <>
          {ready.map((c) => (
            <View key={c.key} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Icon name={CORRELATION_SYMBOL[c.key] ?? "chart.bar"} size={15} tint={tint} />
              <Text variant="subhead" style={{ flex: 1 }}>
                {c.text}
              </Text>
            </View>
          ))}
          {waiting.map((c) => (
            <Text key={c.key} variant="footnote" color="textSecondary">
              {c.label}: hacen falta más noches para comparar ({c.nWith} con · {c.nWithout} sin).
            </Text>
          ))}
        </>
      )}
      <Text variant="caption" color="textTertiary">
        Son comparaciones entre tus noches, no causas.
      </Text>
    </Panel>
  );
}

/** The person's own weekly maximum, if they want one. Never suggested, never coloured as a verdict. Steps save after a pause. */
export function SubstanceGoal({ maxDays, daysThisWeek, onChange }: { maxDays: number | null; daysThisWeek: number; onChange: (max: number | null) => Promise<unknown> }) {
  const tint = useTint();
  const { colors } = useTheme();
  const [value, setValue] = useState(maxDays ?? 3);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (maxDays != null && !timer.current) setValue(maxDays);
  }, [maxDays]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const step = (n: number) => {
    setValue(n);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (n !== maxDays) void onChange(n);
    }, 700);
  };
  return (
    <Panel style={{ gap: 10 }} testID="substance-goal">
      <PanelHeader title="Tu máximo" />
      {maxDays != null ? (
        <>
          <Stepper value={value} min={0} max={7} onChange={step} format={(n) => `${n} ${days(n)}`} unit="POR SEMANA" accessibilityLabel="Máximo de días por semana" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text variant="subhead" color="textSecondary" style={{ flex: 1 }}>
              Esta semana: {daysThisWeek} de {maxDays}
            </Text>
            <View style={{ flexDirection: "row", gap: 4 }} accessibilityElementsHidden>
              {Array.from({ length: Math.max(maxDays, daysThisWeek) }, (_, i) => (
                <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tint, opacity: i < daysThisWeek ? 1 : 0.18 }} />
              ))}
            </View>
          </View>
          <Pressable onPress={() => void onChange(null)} accessibilityRole="button" style={{ alignSelf: "flex-start", paddingVertical: 4 }}>
            <Text variant="button" style={{ color: colors.textSecondary }}>
              Quitar el máximo
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text variant="subhead" color="textSecondary">
            Opcional: un máximo de días por semana que eliges tú. Solo sirve de referencia.
          </Text>
          <Button title="Elegir un máximo" icon="plus" onPress={() => void onChange(value)} style={{ alignSelf: "flex-start" }} />
        </>
      )}
    </Panel>
  );
}

/** The last 60 days, newest first: tap to edit, swipe to edit or delete. */
export function SubstanceEntries({ entries, substances, mixed, today, onOpen, onDelete }: { entries: SubstanceEntry[]; substances: Substance[]; mixed: boolean; today: string; onOpen: (e: SubstanceEntry) => void; onDelete: (e: SubstanceEntry) => void }) {
  const { colors, hairline } = useTheme();
  const tint = useTint();
  const byId = new Map(substances.map((s) => [s.id, s]));
  if (!entries.length) return null;
  return (
    <Panel style={{ paddingHorizontal: 0, paddingBottom: 8, overflow: "hidden" }} testID="substance-entries">
      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        <PanelHeader title="Registros" trailing={String(entries.length)} />
      </View>
      {entries.map((e, i) => {
        const s = byId.get(e.substanceId);
        const detail = entryDetail(e, s?.unit ?? "veces");
        const symbol = mixed ? s?.symbol : ((e.form ? formSymbol(e.form) : null) ?? s?.symbol);
        return (
          <View key={e.id} style={i ? { borderTopWidth: hairline, borderTopColor: colors.separator } : undefined}>
            <SwipeRow onPress={() => onOpen(e)} onDelete={() => onDelete(e)} left={{ label: "Editar", icon: "pencil", color: tint, onPress: () => onOpen(e) }} menu={[{ title: "Editar", onPress: () => onOpen(e) }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                  <Glyph symbol={symbol ?? null} size={16} tint={tint} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="rowTitle" numberOfLines={1}>
                    {entryTitle(e, s?.name ?? "Sustancia", mixed)}
                  </Text>
                  <Text variant="meta" color="textSecondary" numberOfLines={1}>
                    {entrySubtitle(e, today)}
                  </Text>
                  {e.note ? (
                    <Text variant="footnote" color="textTertiary" numberOfLines={1}>
                      {e.note}
                    </Text>
                  ) : null}
                </View>
                {detail ? (
                  <Text variant="numberSmall" style={{ fontSize: 14, color: colors.textSecondary }} numberOfLines={1}>
                    {detail}
                  </Text>
                ) : null}
              </View>
            </SwipeRow>
          </View>
        );
      })}
      <Text variant="caption" color="textTertiary" style={{ paddingHorizontal: 14, paddingTop: 8 }}>
        Últimos 60 días. Desliza para editar o eliminar.
      </Text>
    </Panel>
  );
}
