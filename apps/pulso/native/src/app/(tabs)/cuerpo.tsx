import type { BodyProjection, BodyScan } from "@/contract";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { View } from "react-native";
import { BodyHero, CompositionCard, EvolutionCard, MetabolismCard, MuscleFatCard, ObesityCard, TrendCard } from "@/cuerpo/ui/Cards";
import { BodyMapCard, BodyMapEmpty } from "@/cuerpo/ui/BodyMap";
import { ScansCard, WeighInsCard } from "@/cuerpo/ui/History";
import { GoalForm, InBodyScanner, ScanForm, type ScanInput } from "@/cuerpo/ui/Forms";
import { isFullScan, type Metric } from "@/cuerpo/model";
import { showMenu } from "@/dieta/ui/SwipeRow";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { useOperation } from "@/data/queries";
import { useHealthSync } from "@/health/sync";
import { IconButton } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { EmptyState, ErrorState, LoadingState } from "@/ui/States";
import { useToast } from "@/ui/Toast";

type SheetState = { kind: "scanner" } | { kind: "entry"; scan: ScanInput | null } | { kind: "goal" };

/** Cuerpo (BodyView.swift in Tablero): the latest scan, the trend and its projection, the InBody analysis, the history. */
export default function Cuerpo() {
  const dashboard = useOperation("get_body_dashboard", {});
  const { run, busy } = useAction();
  const toast = useToast();
  const health = useHealthSync();
  const [metric, setMetric] = useState<Metric>("percentBodyFat");
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const data = dashboard.data;
  const scans = data?.scans ?? [];
  const projections = Object.fromEntries((data?.projections ?? []).map((p) => [p.metric, p])) as Partial<Record<Metric, BodyProjection>>;
  const goals = Object.fromEntries((data?.goals ?? []).map((g) => [g.metric, g.target])) as Partial<Record<Metric, number>>;

  const fail = (error: unknown) => toast.show({ message: describeError(error), tone: "error" });
  const importCSV = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/plain", "text/comma-separated-values", "public.comma-separated-values-text"], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    try {
      const csv = await (await fetch(picked.assets[0].uri)).text();
      const r = await run("import_inbody_csv", { csv });
      toast.show({ message: `${r.imported} mediciones importadas${r.skipped.length ? ` · ${r.skipped.length} filas omitidas` : ""}`, icon: "checkmark.circle.fill" });
    } catch (error) {
      fail(error);
    }
  };
  const syncHealth = async () => {
    try {
      await health.sync();
      void dashboard.refetch();
      toast.show({ message: "Sincronizado con Salud", icon: "heart.text.square" });
    } catch (error) {
      fail(error);
    }
  };
  const add = () =>
    showMenu([
      { title: "Escanear QR de InBody", onPress: () => setSheet({ kind: "scanner" }) },
      { title: "Cargar a mano", onPress: () => setSheet({ kind: "entry", scan: null }) },
      { title: "Importar CSV de InBody", onPress: () => void importCSV() },
      { title: "Sincronizar con Salud", onPress: () => void syncHealth() },
    ]);
  const remove = async (scan: BodyScan) => {
    if (!scan.id) return;
    try {
      await run("delete_body_scan", { id: scan.id });
      toast.show({ message: "Medición borrada", icon: "trash" });
    } catch (error) {
      fail(error);
    }
  };

  const latest = scans[0];
  // The scan the breakdown reads: the newest InBody, else the newest entry with composition.
  const reference = scans.find((s) => s.source === "inbody") ?? scans.find(isFullScan);
  const analysis = data?.analysis;
  return (
    <Screen
      title="Cuerpo"
      accessory={<IconButton icon={busy ? "ellipsis" : "plus"} size={28} accessibilityLabel="Añadir medición" onPress={add} testID="body-add" />}
      refreshing={dashboard.isRefetching}
      onRefresh={() => void dashboard.refetch()}
      testID="cuerpo-screen"
    >
      {!data ? (
        dashboard.isError ? (
          <ErrorState message={describeError(dashboard.error)} onRetry={() => void dashboard.refetch()} />
        ) : (
          <LoadingState lines={4} height={200} />
        )
      ) : !latest ? (
        <EmptyState
          icon="figure.arms.open"
          title="Tu composición corporal"
          message="Escanea el QR de tu InBody para ver músculo, grasa y hacia dónde vas."
          action={{ title: "Escanear QR de InBody", icon: "qrcode.viewfinder", onPress: () => setSheet({ kind: "scanner" }) }}
          secondary={{ title: "Cargar a mano", icon: "square.and.pencil", onPress: () => setSheet({ kind: "entry", scan: null }) }}
        />
      ) : (
        <>
          <BodyHero scans={scans} />
          {analysis?.segments ? <BodyMapCard segments={analysis.segments} scans={scans} /> : <BodyMapEmpty onScan={() => setSheet({ kind: "scanner" })} />}
          <TrendCard projection={projections[metric]} metric={metric} onMetric={setMetric} goal={goals[metric] ?? null} onGoal={() => setSheet({ kind: "goal" })} />
          {reference ? <CompositionCard scan={reference} /> : null}
          {analysis ? <MuscleFatCard analysis={analysis} /> : null}
          {analysis?.obesity.length ? <ObesityCard gauges={analysis.obesity} scans={scans} /> : null}
          <MetabolismCard scans={scans} />
          <EvolutionCard scans={scans} />
          <ScansCard scans={scans} onDelete={(s) => void remove(s)} />
          <WeighInsCard scans={scans} onDelete={(s) => void remove(s)} />
        </>
      )}
      <View />
      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet?.kind === "scanner" ? "QR de InBody" : sheet?.kind === "goal" ? "Meta" : sheet?.kind === "entry" && sheet.scan ? "Tu InBody" : "Nueva medición"}>
        {sheet?.kind === "scanner" ? (
          <InBodyScanner parse={async (payload) => (await run("read_inbody_qr", { payload }, { refresh: false })).scan} onParsed={(scan) => setSheet({ kind: "entry", scan })} onManual={() => setSheet({ kind: "entry", scan: null })} />
        ) : sheet?.kind === "entry" ? (
          <ScanForm
            scan={sheet.scan}
            onSave={async (input) => {
              try {
                await run("save_body_scan", input);
                setSheet(null);
                toast.show({ message: "Medición guardada", icon: "checkmark.circle.fill" });
                return true;
              } catch (error) {
                fail(error);
                return false;
              }
            }}
          />
        ) : sheet?.kind === "goal" ? (
          <GoalForm
            initial={metric}
            goals={goals}
            projections={projections}
            onSave={async (m, target) => {
              try {
                await run("save_body_goal", { metric: m, target });
                setSheet(null);
              } catch (error) {
                fail(error);
              }
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
