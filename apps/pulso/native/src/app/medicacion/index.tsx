import type { Medication, MedicationKind } from "@/contract";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { showMenu } from "@/dieta/ui/SwipeRow";
import { describeError } from "@/data/errors";
import { cabinetLine, dateKey, draftFromNudge, draftOf, newDraft, todayItems, usual, type MedicationDraft } from "@/medicacion/model";
import { AdherencePanel } from "@/medicacion/ui/Adherence";
import { MedicationEditor } from "@/medicacion/ui/Editor";
import { CabinetPanel, HistoryPanel } from "@/medicacion/ui/Lists";
import { MedicationHero, NudgesPanel, TodaySections } from "@/medicacion/ui/Today";
import { useAskForReminders } from "@/medicacion/reminders";
import { useMedicacion, useMedicationActions } from "@/medicacion/useMedicacion";
import { IconButton } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { EmptyState, ErrorState, LoadingState } from "@/ui/States";

type Editing = { draft: MedicationDraft; medication: Medication | null; key: string };

/** Re-renders every half minute, so «Toca ahora» / «Se pasó» follow the clock. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Medicación (MedicationView.swift in Tablero): a compact hero of today, schedule
 * suggestions, today in sections, constancy, what you take and the history.
 * `?nuevo=medicamento|suplemento` opens the editor straight away.
 */
export default function Medicacion() {
  const data = useMedicacion();
  const actions = useMedicationActions();
  const now = useClock();
  const params = useLocalSearchParams<{ nuevo?: string }>();
  const [editing, setEditing] = useState<Editing | null>(null);
  const today = dateKey(now);
  const askForReminders = useAskForReminders();
  const scheduled = data.active.some((m) => !m.schedule.asNeeded);

  // Reminders need permission: asked once there is something scheduled to remind of.
  useEffect(() => {
    if (scheduled) void askForReminders();
  }, [scheduled, askForReminders]);

  const items = useMemo(() => todayItems(data.medications, data.day, data.history, now), [data.medications, data.day, data.history, now]);
  const usualNames = useMemo(() => usual(items, data.nudges, data.history, now), [items, data.nudges, data.history, now]);

  const create = (kind: MedicationKind) => setEditing({ draft: newDraft(kind, today), medication: null, key: `new-${kind}-${Date.now()}` });
  const open = (m: Medication) => setEditing({ draft: draftOf(m), medication: m, key: m.id });
  const add = () =>
    showMenu([
      { title: "Medicamento", onPress: () => create("medicamento") },
      { title: "Suplemento", onPress: () => create("suplemento") },
    ]);

  useEffect(() => {
    if (params.nuevo === "medicamento" || params.nuevo === "suplemento") create(params.nuevo);
    // Only on arrival.
  }, []);

  const subtitle = cabinetLine(data.medications);
  return (
    <Screen
      title={subtitle ? `Medicación · ${subtitle}` : "Medicación"}
      leading={<IconButton icon="chevron.left" size={28} accessibilityLabel="Atrás" onPress={() => router.back()} testID="back" />}
      accessory={<IconButton icon="plus" size={28} accessibilityLabel="Añadir" onPress={add} testID="medication-add" />}
      refreshing={data.refreshing}
      onRefresh={() => void data.refetch()}
      testID="medicacion-screen"
    >
      {!data.loaded ? (
        data.error ? (
          <ErrorState message={describeError(data.error)} onRetry={() => void data.refetch()} />
        ) : (
          <LoadingState lines={3} height={140} />
        )
      ) : !data.medications.length ? (
        <EmptyState
          icon="pills.fill"
          title="Anota tus medicamentos y suplementos"
          message="Te recordamos cada toma y llevas la cuenta sin pensar."
          action={{ title: "Añadir medicamento", icon: "pills.fill", onPress: () => create("medicamento") }}
          secondary={{ title: "Añadir suplemento", icon: "leaf.fill", onPress: () => create("suplemento") }}
          testID="medication-empty"
        />
      ) : (
        <>
          <MedicationHero items={items} usual={usualNames} streak={data.adherence?.overall.currentStreak ?? 0} />
          <NudgesPanel
            nudges={data.nudges}
            onDismiss={data.dismiss}
            onAccept={(n) => {
              const m = data.medications.find((x) => x.id === n.medicationId);
              if (m) setEditing({ draft: draftFromNudge(m, n, today), medication: m, key: `nudge-${m.id}` });
            }}
          />
          <TodaySections
            items={items}
            actions={{ take: (s) => void actions.take(s), skip: (s) => void actions.skip(s), undo: (s) => void actions.undo(s), takeNow: (m) => void actions.takeNow(m), removeEvent: (e) => void actions.removeEvent(e) }}
          />
          {data.adherence ? <AdherencePanel report={data.adherence} /> : null}
          <CabinetPanel medications={data.medications} lowStock={data.lowStock} onOpen={open} />
          <HistoryPanel history={data.history} medications={data.medications} today={today} onRemove={(e) => void actions.removeEvent(e)} />
        </>
      )}
      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.medication ? editing.medication.name : editing?.draft.kind === "suplemento" ? "Nuevo suplemento" : "Nuevo medicamento"}
        testID="medication-editor"
      >
        {editing ? (
          <MedicationEditor
            key={editing.key}
            initial={editing.draft}
            medication={editing.medication}
            today={today}
            onSave={async (draft) => {
              const ok = await actions.save(draft, editing.medication?.id ?? null);
              if (ok) setEditing(null);
              return ok;
            }}
            onDelete={async () => {
              if (!editing.medication) return false;
              const ok = await actions.remove(editing.medication);
              if (ok) setEditing(null);
              return ok;
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
