import type { Substance } from "@/contract";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChipPicker, Section, TextField } from "@/dieta/ui/forms";
import { SwipeRow } from "@/dieta/ui/SwipeRow";
import { ToggleRow } from "@/medicacion/ui/fields";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { addForm, capFirst, days, definitionValid, SYMBOL_SUGGESTIONS, substanceDetail, UNIT_SUGGESTIONS, type Definition } from "../model";
import { useTint } from "./Cards";
import { Glyph } from "./Glyph";

type ManageProps = {
  active: Substance[];
  archived: Substance[];
  onEdit: (s: Substance | null) => void;
  onArchive: (s: Substance, archived: boolean) => void;
  onMove: (s: Substance, by: -1 | 1) => void;
};

/**
 * «Gestionar sustancias» (SubstanceManageView.swift): tap to edit, swipe to
 * archive, long-press to move up or down. Archived ones keep their history
 * and come back from their own panel.
 */
export function ManageList({ active, archived, onEdit, onArchive, onMove }: ManageProps) {
  const { colors } = useTheme();
  return (
    <>
      <Panel style={{ paddingHorizontal: 0, paddingBottom: 8, overflow: "hidden" }} testID="substances-active">
        <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
          <PanelHeader title="Activas" />
        </View>
        {active.map((s, i) => (
          <SwipeRow
            key={s.id}
            onPress={() => onEdit(s)}
            right={{ label: "Archivar", icon: "archivebox", color: colors.textSecondary, onPress: () => onArchive(s, true) }}
            menuTitle={s.name}
            menu={[
              ...(i > 0 ? [{ title: "Subir", onPress: () => onMove(s, -1) }] : []),
              ...(i < active.length - 1 ? [{ title: "Bajar", onPress: () => onMove(s, 1) }] : []),
              { title: "Editar", onPress: () => onEdit(s) },
              { title: "Archivar", onPress: () => onArchive(s, true) },
            ]}
          >
            <Row substance={s} first={i === 0} />
          </SwipeRow>
        ))}
        <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
          <Button title="Nueva sustancia" icon="plus" onPress={() => onEdit(null)} testID="substance-new" />
        </View>
        <Text variant="caption" color="textTertiary" style={{ paddingHorizontal: 14, paddingTop: 8 }}>
          Mantén pulsada una fila para cambiar el orden. Archivar oculta una sustancia sin borrar su historial.
        </Text>
      </Panel>
      {archived.length ? (
        <Panel style={{ paddingHorizontal: 0, paddingBottom: 8, overflow: "hidden" }} testID="substances-archived">
          <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
            <PanelHeader title="Archivadas" />
          </View>
          {archived.map((s, i) => (
            <SwipeRow key={s.id} onPress={() => onEdit(s)} right={{ label: "Restaurar", icon: "arrow.uturn.backward", color: colors.body, onPress: () => onArchive(s, false) }} menu={[{ title: "Restaurar", onPress: () => onArchive(s, false) }]}>
              <Row substance={s} first={i === 0} />
            </SwipeRow>
          ))}
        </Panel>
      ) : null}
    </>
  );
}

function Row({ substance: s, first }: { substance: Substance; first: boolean }) {
  const { colors, hairline } = useTheme();
  const tint = useTint();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: first ? 0 : hairline, borderTopColor: colors.separator, opacity: s.archived ? 0.6 : 1 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
        <Glyph symbol={s.symbol} size={16} tint={tint} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {s.name}
        </Text>
        <Text variant="meta" color="textSecondary" numberOfLines={1}>
          {substanceDetail(s)}
        </Text>
      </View>
      <Icon name="chevron.right" size={12} color="textTertiary" />
    </View>
  );
}

/** «Nueva sustancia» or editing one: name, symbol, unit, forms and an optional weekly maximum. */
export function SubstanceForm({ initial, substance, onSave, onArchive }: { initial: Definition; substance: Substance | null; onSave: (d: Definition) => Promise<boolean>; onArchive: (archived: boolean) => Promise<unknown> }) {
  const { colors, type } = useTheme();
  const tint = useTint();
  const [d, setD] = useState(initial);
  const [newForm, setNewForm] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Definition>) => setD((x) => ({ ...x, ...patch }));
  const name = d.name.trim();

  const save = async () => {
    setSaving(true);
    await onSave({ ...d, forms: addForm(d.forms, newForm) });
    setSaving(false);
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= d.forms.length) return;
    const forms = [...d.forms];
    [forms[i], forms[j]] = [forms[j]!, forms[i]!];
    set({ forms });
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: "center", gap: 8 }} accessibilityElementsHidden>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
          <Glyph symbol={d.symbol} size={32} tint={tint} />
        </View>
        <Text style={[type.headline, { color: name ? colors.text : colors.textTertiary }]}>{name || "Sin nombre"}</Text>
      </View>

      <Section>
        <TextField value={d.name} onChange={(v) => set({ name: v })} placeholder="Nombre" testID="substance-name" />
      </Section>

      <Section title="Símbolo" footer="Opcional. Sin símbolo se usa uno neutro.">
        <TextField value={d.symbol} onChange={(v) => set({ symbol: v })} placeholder="Emoji o nombre de SF Symbol" />
        <View style={{ paddingBottom: 10 }}>
          <ChipPicker options={SYMBOL_SUGGESTIONS.map((s) => ({ value: s, label: s }))} value={d.symbol || null} onChange={(s) => set({ symbol: d.symbol === s ? "" : s })} />
        </View>
      </Section>

      <Section title="Unidad" footer="En qué cuentas la cantidad al registrar.">
        <TextField value={d.unit} onChange={(v) => set({ unit: v })} placeholder="veces" />
        <View style={{ paddingBottom: 10 }}>
          <ChipPicker options={UNIT_SUGGESTIONS.map((u) => ({ value: u, label: u }))} value={d.unit || null} onChange={(unit) => set({ unit })} />
        </View>
      </Section>

      <Section title="Formas" footer="Opcional. La primera se elige por defecto al registrar.">
        {d.forms.map((f, i) => (
          <View key={f} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
            <Text variant="subhead" style={{ flex: 1 }}>
              {capFirst(f)}
            </Text>
            {i > 0 ? (
              <Pressable hitSlop={8} onPress={() => move(i, -1)} accessibilityLabel={`Subir ${f}`}>
                <Icon name="arrow.up" size={14} color="textSecondary" />
              </Pressable>
            ) : null}
            <Pressable hitSlop={8} onPress={() => set({ forms: d.forms.filter((x) => x !== f) })} accessibilityLabel={`Quitar ${f}`}>
              <Icon name="minus.circle.fill" size={18} tint={colors.negative} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextField value={newForm} onChange={setNewForm} placeholder="Añadir forma (p. ej. fumado)" />
          </View>
          {newForm.trim() ? (
            <Pressable
              hitSlop={8}
              accessibilityLabel="Añadir forma"
              onPress={() => {
                set({ forms: addForm(d.forms, newForm) });
                setNewForm("");
              }}
            >
              <Icon name="plus.circle.fill" size={20} tint={tint} />
            </Pressable>
          ) : null}
        </View>
      </Section>

      <Section title="Tu máximo" footer="Opcional y solo para ti: una referencia, no un juicio.">
        <ToggleRow label="Máximo de días por semana" value={d.maxDaysPerWeek != null} onChange={(on) => set({ maxDaysPerWeek: on ? (substance?.maxDaysPerWeek ?? 3) : null })} last={d.maxDaysPerWeek == null} />
        {d.maxDaysPerWeek != null ? (
          <View style={{ paddingVertical: 10 }}>
            <Stepper value={d.maxDaysPerWeek} min={0} max={7} onChange={(n) => set({ maxDaysPerWeek: n })} format={(n) => `${n} ${days(n)}`} unit="POR SEMANA" />
          </View>
        ) : null}
      </Section>

      <Button title="Guardar" variant="accent" wide busy={saving} disabled={!definitionValid(d)} onPress={() => void save()} testID="substance-save" />
      {substance ? (
        <View style={{ gap: 6, alignItems: "center" }}>
          <Button title={substance.archived ? "Restaurar" : "Archivar"} icon={substance.archived ? "arrow.uturn.backward" : "archivebox"} onPress={() => void onArchive(!substance.archived)} />
          <Text variant="caption" color="textTertiary" style={{ textAlign: "center" }}>
            {substance.archived ? "Vuelve a aparecer al registrar y en los resúmenes." : "Deja de aparecer al registrar; su historial se conserva."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
