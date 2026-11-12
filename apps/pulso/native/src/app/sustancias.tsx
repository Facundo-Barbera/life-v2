import type { Substance, SubstanceEntry } from "@/contract";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChipPicker } from "@/dieta/ui/forms";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { operationKey } from "@/data/keys";
import { useOperation } from "@/data/queries";
import { dateKey } from "@/medicacion/model";
import { confirmIdentity, consumeGrant } from "@/sustancias/access";
import {
  capFirst,
  definitionOf,
  definitionPatch,
  emptyDefinition,
  formSymbol,
  isEmpty,
  moveId,
  NEUTRAL_SYMBOL,
  newUse,
  sortSubstances,
  TIME_SYMBOL,
  useInput,
  useOf,
  type Definition,
  type UseDraft,
} from "@/sustancias/model";
import { SubstanceBars, SubstanceCorrelations, SubstanceEntries, SubstanceGoal, SubstanceHeatmap, SubstanceHero, SubstanceStats, SubstanceWeeks } from "@/sustancias/ui/Cards";
import { LogForm } from "@/sustancias/ui/LogForm";
import { ManageList, SubstanceForm } from "@/sustancias/ui/Manage";
import { useTheme } from "@/theme";
import { Button, IconButton } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { ScreenHeader } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { EmptyState, ErrorState, LoadingState } from "@/ui/States";
import { useToast } from "@/ui/Toast";

type Gate = "checking" | "open" | "locked";
type Logging = { draft: UseDraft; entry: SubstanceEntry | null; key: string };
type Editing = { definition: Definition; substance: Substance | null; key: string };

const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

/**
 * Sustancias (SubstancesView.swift in Tablero): a private, non-judgmental log of
 * when the person uses something, to see how often and how it sits with their
 * sleep. Opens only after a fresh Face ID check, closes when Pulso goes to the
 * background, and keeps nothing cached once it closes.
 */
export default function Sustancias() {
  const [gate, setGate] = useState<Gate>(() => (consumeGrant() ? "open" : "checking"));
  const queries = useQueryClient();

  const unlock = async () => {
    setGate("checking");
    setGate((await confirmIdentity()) ? "open" : "locked");
  };
  useEffect(() => {
    if (gate === "checking") void unlock();
    // Only on arrival: a later «Desbloquear» asks again.
  }, []);

  // More private than the rest of the app: leaving Pulso closes it, and coming back asks again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") close();
    });
    return () => {
      sub.remove();
      queries.removeQueries({ queryKey: operationKey("get_substance_overview").slice(0, 2) });
    };
  }, [queries]);

  if (gate !== "open") return <Locked checking={gate === "checking"} onUnlock={() => void unlock()} />;
  return <Open />;
}

function Frame({ title, leading, accessory, children }: { title: string; leading?: ReactNode; accessory?: ReactNode; children: ReactNode }) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: space.md, paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.xxl, gap: space.sm }}
      keyboardShouldPersistTaps="handled"
      testID="sustancias-screen"
    >
      <ScreenHeader title={title} leading={leading ?? <IconButton icon="xmark" onPress={close} accessibilityLabel="Cerrar" testID="close" />} accessory={accessory} />
      {children}
    </ScrollView>
  );
}

function Locked({ checking, onUnlock }: { checking: boolean; onUnlock: () => void }) {
  return (
    <Frame title="Privado">
      {checking ? null : (
        <EmptyState icon={NEUTRAL_SYMBOL} title="Confirma que eres tú" message="Esta sección se abre solo con Face ID o tu código." action={{ title: "Desbloquear", icon: "faceid", onPress: onUnlock }} testID="sustancias-locked" />
      )}
    </Frame>
  );
}

function Open() {
  const today = dateKey(new Date());
  const { run } = useAction();
  const toast = useToast();
  const [scope, setScope] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [logging, setLogging] = useState<Logging | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const overview = useOperation("get_substance_overview", scope ? { substance: scope, date: today } : { date: today }, { gcTime: 0, placeholderData: keepPreviousData });
  const data = overview.data;

  // The first answer says which substance the engine starts on.
  useEffect(() => {
    if (data && scope == null) setScope(data.summary.substanceId ?? "all");
  }, [data, scope]);

  const substances = sortSubstances(data?.substances ?? []);
  const active = substances.filter((s) => !s.archived);
  const archived = substances.filter((s) => s.archived);
  const shown = data?.summary.substanceId ? substances.find((s) => s.id === data.summary.substanceId) : undefined;
  const logDefault = shown ?? active[0];
  const fail = (e: unknown) => toast.show({ message: describeError(e), tone: "error" });

  const startLog = () => logDefault && setLogging({ draft: newUse(logDefault, new Date()), entry: null, key: `new-${Date.now()}` });
  const openEntry = (e: SubstanceEntry) => setLogging({ draft: useOf(e), entry: e, key: e.id });

  const saveUse = async (d: UseDraft) => {
    try {
      const input = useInput(d);
      if (logging?.entry) await run("update_substance_use", { id: logging.entry.id, ...input });
      else await run("record_substance_use", input);
      haptics.success();
      setLogging(null);
      // Logged for another substance than the one on screen: follow it there.
      if (scope && scope !== "all" && scope !== d.substanceId && active.some((s) => s.id === d.substanceId)) setScope(d.substanceId);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };
  const removeUse = async (e: SubstanceEntry) => {
    try {
      await run("remove_substance_use", { id: e.id });
      haptics.tap();
      setLogging(null);
    } catch (error) {
      fail(error);
    }
  };
  const setGoal = async (id: string, maxDaysPerWeek: number | null) => {
    try {
      await run("update_substance", { id, maxDaysPerWeek });
    } catch (e) {
      fail(e);
    }
  };
  const archive = async (s: Substance, value: boolean) => {
    try {
      await run("update_substance", { id: s.id, archived: value });
      // Archived while on screen: Todas is the one view that always exists.
      if (value && scope === s.id) setScope("all");
      setEditing(null);
    } catch (e) {
      fail(e);
    }
  };
  const move = async (s: Substance, by: -1 | 1) => {
    try {
      await run("reorder_substances", { ids: moveId(active.map((x) => x.id), s.id, by) });
      haptics.select();
    } catch (e) {
      fail(e);
    }
  };
  const saveSubstance = async (d: Definition) => {
    try {
      const patch = definitionPatch(d);
      if (editing?.substance) await run("update_substance", { id: editing.substance.id, ...patch });
      else await run("add_substance_type", patch);
      haptics.success();
      setEditing(null);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const summary = data?.summary;
  const sheets = (
    <>
      <Sheet visible={!!logging} onClose={() => setLogging(null)} title={logging?.entry ? "Editar registro" : "Registrar"} testID="use-sheet">
        {logging ? <LogForm key={logging.key} initial={logging.draft} entry={logging.entry} substances={substances} onSave={saveUse} onDelete={() => (logging.entry ? removeUse(logging.entry) : Promise.resolve())} /> : null}
      </Sheet>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.substance ? "Editar sustancia" : "Nueva sustancia"} testID="substance-sheet">
        {editing ? <SubstanceForm key={editing.key} initial={editing.definition} substance={editing.substance} onSave={saveSubstance} onArchive={(v) => (editing.substance ? archive(editing.substance, v) : Promise.resolve())} /> : null}
      </Sheet>
    </>
  );

  if (managing)
    return (
      <>
        <Frame title="Gestionar sustancias" leading={<IconButton icon="chevron.left" onPress={() => setManaging(false)} accessibilityLabel="Atrás" testID="manage-back" />}>
          <ManageList
            active={active}
            archived={archived}
            onEdit={(s) => setEditing({ definition: s ? definitionOf(s) : emptyDefinition(), substance: s, key: s?.id ?? `new-${Date.now()}` })}
            onArchive={(s, v) => void archive(s, v)}
            onMove={(s, by) => void move(s, by)}
          />
        </Frame>
        {sheets}
      </>
    );

  return (
    <>
      <Frame
        title="Sustancias"
        accessory={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <IconButton icon="slider.horizontal.3" onPress={() => setManaging(true)} accessibilityLabel="Gestionar sustancias" testID="substances-manage" />
            <IconButton icon="plus" accent onPress={startLog} accessibilityLabel="Registrar" testID="substances-log" />
          </View>
        }
      >
        {active.length ? (
          <ChipPicker
            testID="substance-scope"
            options={[{ value: "all", label: "Todas" }, ...active.map((s) => ({ value: s.id, label: s.name }))]}
            value={scope ?? data?.summary.substanceId ?? "all"}
            onChange={(v) => {
              haptics.select();
              setScope(v);
            }}
          />
        ) : null}
        {!data || !summary ? (
          overview.isError ? (
            <ErrorState message={describeError(overview.error)} onRetry={() => void overview.refetch()} />
          ) : (
            <LoadingState lines={3} height={160} />
          )
        ) : isEmpty(data) ? (
          <EmptyState
            icon={NEUTRAL_SYMBOL}
            title={shown ? `Sin registros de ${shown.name.toLowerCase()}` : "Sin registros todavía"}
            message="Anota cuándo consumes para ver con qué frecuencia y cómo se lleva con tu sueño. Solo tú lo ves."
            action={logDefault ? { title: "Registrar", icon: "plus", onPress: startLog } : undefined}
            testID="substances-empty"
          />
        ) : (
          <>
            <SubstanceHero summary={summary} />
            <SubstanceStats summary={summary} />
            <SubstanceHeatmap summary={summary} />
            <SubstanceWeeks summary={summary} goal={shown?.maxDaysPerWeek ?? null} />
            {!summary.substanceId && summary.bySubstance.some((b) => b.uses > 0) ? (
              <SubstanceBars
                title="Por sustancia"
                rows={summary.bySubstance.map((b) => {
                  const s = substances.find((x) => x.id === b.substanceId);
                  return { id: b.substanceId, label: s?.name ?? b.substanceId, symbol: s?.symbol, uses: b.uses };
                })}
              />
            ) : null}
            {shown && summary.byForm.filter((f) => f.uses > 0).length > 1 ? (
              <SubstanceBars title="Forma" rows={summary.byForm.map((f) => ({ id: f.form, label: capFirst(f.form), symbol: formSymbol(f.form) ?? shown.symbol, uses: f.uses }))} />
            ) : null}
            {summary.timeOfDay.some((t) => t.uses > 0) ? <SubstanceBars title="Momento del día" rows={summary.timeOfDay.map((t) => ({ id: t.key, label: t.label, symbol: TIME_SYMBOL[t.key], uses: t.uses }))} /> : null}
            {summary.correlations.length ? <SubstanceCorrelations correlations={summary.correlations} /> : null}
            {shown ? <SubstanceGoal key={shown.id} maxDays={shown.maxDaysPerWeek} daysThisWeek={summary.daysThisWeek} onChange={(max) => setGoal(shown.id, max)} /> : null}
            <SubstanceEntries entries={data.entries} substances={substances} mixed={!summary.substanceId} today={today} onOpen={openEntry} onDelete={(e) => void removeUse(e)} />
          </>
        )}
        {!active.length && data ? <Button title="Nueva sustancia" icon="plus" onPress={() => setManaging(true)} /> : null}
      </Frame>
      {sheets}
    </>
  );
}
