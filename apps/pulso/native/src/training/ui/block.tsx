import type { BlockProposal, ProgramWeek, TrainingBlock } from "@/contract";
import { useState } from "react";
import { Alert, View } from "react-native";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Pill } from "@/ui/Chip";
import { Hairline, Panel, PanelHeader } from "@/ui/Panel";
import { Text } from "@/ui/Text";
import { diffSections, weekLabel, weekLines } from "../selector";

// The block's plan on Entreno: which week of the block this is (and whether
// it is a deload, with what it changes), and the Coach's proposal for the
// next block, which only starts when the person accepts it.

/** «Semana 3 de 6» with a DESCARGA badge and the week's changes. */
export function WeekPlanLine({ block, week }: { block: TrainingBlock; week: ProgramWeek }) {
  const { space } = useTheme();
  const label = weekLabel(block, week);
  const lines = weekLines(week);
  return (
    <View style={{ gap: space.xs }} testID="entreno-week-plan">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text variant="subhead" style={{ fontWeight: "600" }}>
          {label.title}
        </Text>
        {label.deload ? <Pill label="DESCARGA" tone="muted" /> : null}
      </View>
      {lines.map((line) => (
        <Text key={line} variant="footnote" color="textSecondary">
          {line}
        </Text>
      ))}
    </View>
  );
}

/** The pending next block: why, what stays and changes, and «Aceptar» / «Descartar». */
export function ProposalCard({ proposal, onAccept, onDiscard }: { proposal: BlockProposal; onAccept: () => Promise<unknown>; onDiscard: () => Promise<unknown> }) {
  const { space } = useTheme();
  const [busy, setBusy] = useState<"accept" | "discard" | null>(null);
  const act = (which: "accept" | "discard", fn: () => Promise<unknown>) => {
    setBusy(which);
    fn()
      .catch((e: unknown) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Inténtalo otra vez."))
      .finally(() => setBusy(null));
  };
  const accept = () =>
    Alert.alert(`¿Empezar ${proposal.name}?`, "Tu bloque actual termina hoy. Lo que hiciste, tus récords y tus cargas se quedan.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Empezar", onPress: () => act("accept", onAccept) },
    ]);

  return (
    <Panel style={{ gap: space.md }} testID="entreno-proposal">
      <PanelHeader title="Propuesta del Coach" accent trailing={`${proposal.weeks} semanas`} />
      <View style={{ gap: space.xs }}>
        <Text variant="headline">{proposal.name}</Text>
        <Text variant="subhead" color="textSecondary">
          {proposal.rationale}
        </Text>
        {proposal.diff.structure.map((line) => (
          <Text key={line} variant="footnote" color="textTertiary">
            {line}
          </Text>
        ))}
      </View>
      {diffSections(proposal.diff).map((section) => (
        <View key={section.title} style={{ gap: space.xs }}>
          <Hairline />
          <Text variant="label" color={section.tone === "accent" ? "accentText" : section.tone === "negative" ? "negative" : "textSecondary"}>
            {section.title}
          </Text>
          {section.items.map((item) => (
            <View key={item.exerciseId} style={{ gap: 2 }}>
              <Text variant="body" numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="footnote" color="textSecondary">
                {item.why ? `${item.detail} · ${item.why}` : item.detail}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Descartar" onPress={() => act("discard", onDiscard)} busy={busy === "discard"} disabled={busy != null} wide testID="proposal-discard" />
        <Button title="Aceptar" variant="accent" onPress={accept} busy={busy === "accept"} disabled={busy != null} wide testID="proposal-accept" />
      </View>
    </Panel>
  );
}
