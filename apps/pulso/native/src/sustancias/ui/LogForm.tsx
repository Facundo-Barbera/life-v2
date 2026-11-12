import type { Substance, SubstanceAmount, SubstanceContext, SubstanceEntry } from "@/contract";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { ChipPicker, FieldRow, NumberField, num, Section, str, TextField } from "@/dieta/ui/forms";
import { DateStepper, Labeled, TimeStepper } from "@/medicacion/ui/fields";
import { addDays, dateKey } from "@/medicacion/model";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Segmented } from "@/ui/Segmented";
import { Text } from "@/ui/Text";
import { AMOUNT_LABEL, AMOUNTS, capFirst, choices, clampToNow, CONTEXT_LABEL, CONTEXTS, showsThc, switchSubstance, unitLabel, type UseDraft } from "../model";

/**
 * Log or edit one use (SubstanceLogSheet.swift). Defaults make the common case
 * one tap: now, the substance on screen, its first form, Normal. Everything
 * below the amount is optional.
 */
export function LogForm({ initial, entry, substances, onSave, onDelete }: { initial: UseDraft; entry: SubstanceEntry | null; substances: Substance[]; onSave: (d: UseDraft) => Promise<boolean>; onDelete: () => Promise<unknown> }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(initial);
  const [quantity, setQuantity] = useState(str(initial.quantity));
  const [thc, setThc] = useState(str(initial.thcMg));
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<UseDraft>) => setDraft((d) => clampToNow({ ...d, ...patch }, new Date()));
  const substance = substances.find((s) => s.id === draft.substanceId);
  const list = choices(substances, draft.substanceId);
  const forms = [...(substance?.forms ?? []), ...(draft.form && !substance?.forms.includes(draft.form) ? [draft.form] : [])];
  const today = dateKey(new Date());

  const save = async () => {
    setSaving(true);
    await onSave(clampToNow(draft, new Date()));
    setSaving(false);
  };

  return (
    <View style={{ gap: 14 }}>
      <Section title="Qué y cuándo">
        <View style={{ paddingVertical: 10 }}>
          <ChipPicker
            testID="use-substance"
            options={list.map((s) => ({ value: s.id, label: s.name }))}
            value={draft.substanceId}
            onChange={(id) => {
              const s = substances.find((x) => x.id === id);
              if (s) setDraft((d) => switchSubstance(d, s));
            }}
          />
        </View>
        <Labeled label="Día">
          <DateStepper value={draft.date} min={addDays(today, -365)} max={today} onChange={(date) => set({ date })} />
        </Labeled>
        <Labeled label="Hora" last>
          <TimeStepper value={draft.time} onChange={(time) => set({ time })} />
        </Labeled>
      </Section>

      {forms.length ? (
        <Section title="Forma">
          <View style={{ paddingVertical: 10 }}>
            <ChipPicker testID="use-form" options={forms.map((f) => ({ value: f, label: capFirst(f) }))} value={draft.form} onChange={(form) => set({ form })} />
          </View>
        </Section>
      ) : null}

      <Section title="Cuánto">
        <View style={{ paddingVertical: 10 }}>
          <Segmented<SubstanceAmount> testID="use-amount" value={draft.amount} onChange={(amount) => set({ amount })} options={AMOUNTS.map((a) => ({ value: a, label: AMOUNT_LABEL[a] }))} />
        </View>
      </Section>

      <Section title="Opcional">
        <FieldRow label={unitLabel(substance?.unit ?? "veces")}>
          <NumberField
            value={quantity}
            onChange={(v) => {
              setQuantity(v);
              set({ quantity: num(v) });
            }}
            testID="use-quantity"
          />
        </FieldRow>
        {showsThc(draft) ? (
          <FieldRow label="mg de THC">
            <NumberField
              value={thc}
              onChange={(v) => {
                setThc(v);
                set({ thcMg: num(v) });
              }}
              unit="mg"
            />
          </FieldRow>
        ) : null}
        <View style={{ paddingVertical: 10 }}>
          <ChipPicker<SubstanceContext>
            testID="use-context"
            options={CONTEXTS.map((c) => ({ value: c, label: CONTEXT_LABEL[c] }))}
            value={draft.context}
            onChange={(c) => set({ context: draft.context === c ? null : c })}
          />
        </View>
        <TextField value={draft.note} onChange={(note) => set({ note })} placeholder="Nota" multiline />
      </Section>

      <Button title={entry ? "Guardar" : "Registrar"} variant="accent" wide busy={saving} onPress={() => void save()} testID="use-save" />
      {entry ? (
        <Pressable
          accessibilityRole="button"
          style={{ alignItems: "center", paddingVertical: 10 }}
          onPress={() =>
            Alert.alert("¿Eliminar este registro?", undefined, [
              { text: "Cancelar", style: "cancel" },
              { text: "Eliminar", style: "destructive", onPress: () => void onDelete() },
            ])
          }
        >
          <Text variant="button" style={{ color: colors.negative }}>
            Eliminar registro
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
