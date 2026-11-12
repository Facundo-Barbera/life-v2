import type { DietTargetProposal, DietWeekReview } from "@/contract";
import { View } from "react-native";
import { Button } from "@/ui/Button";
import { Hairline, Panel, PanelHeader } from "@/ui/Panel";
import { StatCell } from "@/ui/StatCell";
import { Text } from "@/ui/Text";
import { int } from "../model";

const one = (n: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(n);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${one(Math.abs(n))}`;

const CONFIDENCE: Record<DietWeekReview["expenditure"]["confidence"], string> = { none: "", low: "confianza baja", medium: "confianza media", high: "confianza alta" };
const STATUS: Record<DietWeekReview["weight"]["status"], { label: string; color: "accentText" | "warning" } | null> = {
  unknown: null,
  gaining: { label: "subiendo", color: "warning" },
  slow: { label: "lento", color: "warning" },
  inRange: { label: "en rango", color: "accentText" },
  fast: { label: "rápido", color: "warning" },
};

/** «Revisión semanal» (Progreso, and on Hoy while a proposal waits): rate, expenditure and the Coach's pending targets. */
export function WeeklyReview({ review, busy, onResolve, compact }: { review: DietWeekReview; busy: boolean; onResolve: (p: DietTargetProposal, accept: boolean) => void; compact?: boolean }) {
  const { weight, expenditure, logging, decision, pending } = review;
  const status = STATUS[weight.status];
  return (
    <Panel style={{ gap: 10 }} testID="diet-review">
      <PanelHeader title="Revisión semanal" accent trailing={`${logging.lastWeekComplete}/7 días`} />
      {compact ? null : (
        <>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <StatCell
              bare
              label="Ritmo"
              value={weight.ratePercentPerWeek == null ? null : signed(weight.ratePercentPerWeek)}
              unit="%/sem"
              size="numberSmall"
              style={{ flex: 1 }}
            >
              {status ? (
                <Text variant="labelSmall" color={status.color}>
                  {status.label}
                </Text>
              ) : null}
            </StatCell>
            <StatCell bare label="Tendencia" value={weight.trendKg == null ? null : one(weight.trendKg)} unit="kg" size="numberSmall" style={{ flex: 1 }} />
            <StatCell bare label="Gasto" value={expenditure.kcal == null ? null : `~${int(expenditure.kcal)}`} unit="kcal" size="numberSmall" style={{ flex: 1 }}>
              {expenditure.confidence !== "none" ? (
                <Text variant="labelSmall" color="textSecondary">
                  {CONFIDENCE[expenditure.confidence]}
                </Text>
              ) : null}
            </StatCell>
          </View>
          <Text variant="footnote" color="textSecondary">
            {decision.reason}
          </Text>
          {review.notes.map((n) => (
            <Text key={n} variant="caption" color="textSecondary">
              {n}
            </Text>
          ))}
        </>
      )}
      {pending ? <Proposal proposal={pending} busy={busy} onResolve={onResolve} /> : null}
    </Panel>
  );
}

function Proposal({ proposal, busy, onResolve }: { proposal: DietTargetProposal; busy: boolean; onResolve: (p: DietTargetProposal, accept: boolean) => void }) {
  const before = proposal.previous;
  return (
    <View style={{ gap: 10 }} testID="diet-proposal">
      <Hairline />
      <Text variant="label" color="accentText">
        Propuesta del Coach
      </Text>
      <Text variant="rowTitle">
        {before ? `${int(before.kcal)} → ${int(proposal.kcal)} kcal` : `${int(proposal.kcal)} kcal`}
        {"  "}
        <Text variant="meta" color="textSecondary">
          {`P ${int(proposal.protein)} · C ${int(proposal.carbs)} · G ${int(proposal.fat)} g`}
        </Text>
      </Text>
      <Text variant="footnote" color="textSecondary">
        {proposal.reason}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Descartar" style={{ flex: 1 }} busy={busy} onPress={() => onResolve(proposal, false)} testID="diet-proposal-discard" />
        <Button title="Aceptar" variant="accent" style={{ flex: 1 }} busy={busy} onPress={() => onResolve(proposal, true)} testID="diet-proposal-accept" />
      </View>
    </View>
  );
}
