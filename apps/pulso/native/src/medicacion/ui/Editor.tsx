import type { Medication, MedicationKind, MedicationSchedule, TrainingRule } from "@/contract";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { ChipPicker, FieldRow, NumberField, Section, str, num, TextField } from "@/dieta/ui/forms";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Segmented } from "@/ui/Segmented";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import {
  addDays,
  adoptFrequency,
  adoptKind,
  applyPreset,
  becomeTiming,
  DEFAULT_ANY_TIME_REMINDER,
  DEFAULT_TRAINING,
  draftValid,
  FORMS,
  FREQUENCIES,
  frequencyOf,
  INSTRUCTION_PRESETS,
  isMixed,
  MEAL_LABEL,
  MEAL_SYMBOL,
  MEALS,
  PART_LABEL,
  PART_SYMBOL,
  PARTS,
  PRESETS,
  presetSummary,
  readBack,
  TIME_PICKS,
  timeLabel,
  TIMING_SYMBOL,
  TIMINGS,
  timingOf,
  toggleDay,
  toggleMeal,
  toggleTime,
  toggleWindow,
  TRAINING_WINDOWS,
  UNITS,
  windowRange,
  type Frequency,
  type MedicationDraft,
  type Timing,
} from "../model";
import { DateStepper, Labeled, TimeStepper, ToggleRow, WeekdayPicker } from "./fields";

type Props = {
  /** The draft it opens with: a new one, a medication's, or a suggestion's. */
  initial: MedicationDraft;
  /** Editing this one; null for a new medication. */
  medication: Medication | null;
  today: string;
  onSave: (draft: MedicationDraft) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
};

/**
 * Add or edit a medication (MedicationEditor.swift). The schedule is two plain
 * questions, read back in one line above them: «¿Cada cuándo?» and «¿Cuándo
 * durante el día?». Only the chosen option's controls show.
 */
export function MedicationEditor({ initial, medication, today, onSave, onDelete }: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(initial);
  const [doseField, setDoseField] = useState(str(initial.dose));
  const [preset, setPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const s = draft.schedule;
  const set = (patch: Partial<MedicationDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setSchedule = (next: MedicationSchedule) => setDraft((d) => ({ ...d, schedule: next }));
  const frequency = frequencyOf(s);
  const timing = timingOf(s);
  const units = UNITS[draft.kind].includes(draft.unit) || !draft.unit ? UNITS[draft.kind] : [...UNITS[draft.kind], draft.unit];
  const forms = draft.form && !FORMS[draft.kind].includes(draft.form) ? [...FORMS[draft.kind], draft.form] : FORMS[draft.kind];
  const valid = draftValid(draft);

  const save = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };
  const confirmDelete = () =>
    Alert.alert(`¿Eliminar ${draft.name} y su historial?`, "Para dejar de tomarlo sin perder el historial, ponle una fecha de fin o pásalo a pausa.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => void onDelete() },
    ]);

  return (
    <View style={{ gap: 14 }}>
      <Segmented<MedicationKind>
        testID="medication-kind"
        value={draft.kind}
        onChange={(kind) => setDraft((d) => adoptKind(d, kind))}
        options={[
          { value: "medicamento", label: "Medicamento" },
          { value: "suplemento", label: "Suplemento" },
        ]}
      />

      {!medication && draft.kind === "suplemento" ? (
        <Section title="Habituales" footer={preset ? presetSummary(PRESETS.find((p) => p.name === preset)!) : undefined}>
          <View style={{ paddingVertical: 10 }}>
            <ChipPicker
              testID="medication-presets"
              options={PRESETS.map((p) => ({ value: p.name, label: p.name, icon: p.symbol }))}
              value={preset}
              onChange={(name) => {
                const p = PRESETS.find((x) => x.name === name)!;
                setPreset(name);
                setDraft((d) => applyPreset(d, p));
                setDoseField(str(p.dose));
              }}
            />
          </View>
        </Section>
      ) : null}

      <Section>
        <TextField value={draft.name} onChange={(name) => set({ name })} placeholder={draft.kind === "suplemento" ? "Nombre (p. ej. Creatina)" : "Nombre (p. ej. Ibuprofeno)"} testID="medication-name" />
      </Section>

      <Section title="Dosis">
        <FieldRow label="Cantidad">
          <NumberField
            value={doseField}
            onChange={(v) => {
              setDoseField(v);
              set({ dose: num(v) });
            }}
            unit={draft.unit}
            testID="medication-dose"
          />
        </FieldRow>
        <Labeled label="Unidad">
          <ChipPicker options={units.map((u) => ({ value: u, label: u }))} value={draft.unit} onChange={(unit) => set({ unit })} />
          <TextField value={units.includes(draft.unit) ? "" : draft.unit} onChange={(unit) => set({ unit })} placeholder="Otra unidad" />
        </Labeled>
        <Labeled label="Forma" last>
          <ChipPicker options={[{ value: "", label: "Sin especificar" }, ...forms.map((f) => ({ value: f, label: f }))]} value={draft.form ?? ""} onChange={(form) => set({ form: form || null })} />
        </Labeled>
      </Section>

      <Section title="Horario">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }} accessible>
          <Icon name={TIMING_SYMBOL[timing]} size={16} color="accentText" />
          <Text variant="subhead" style={{ flex: 1 }} testID="medication-readback">
            {readBack(s)}
          </Text>
        </View>
      </Section>

      <Section title="¿Cada cuándo?" footer={frequencyFooter(s, frequency)}>
        <View style={{ paddingVertical: 10 }}>
          <ChipPicker<Frequency> wrap testID="medication-frequency" options={FREQUENCIES} value={frequency} onChange={(f) => setSchedule(adoptFrequency(s, f, draft.startDate))} />
        </View>
        {frequency === "someDays" ? <WeekdayPicker days={s.days} onToggle={(day) => setSchedule({ ...s, days: toggleDay(s.days, day) })} /> : null}
        {frequency === "everyN" && s.interval ? (
          <>
            <Labeled label={`Cada ${s.interval.every} ${s.interval.unit === "week" ? (s.interval.every === 1 ? "semana" : "semanas") : s.interval.every === 1 ? "día" : "días"}`}>
              <Stepper value={s.interval.every} min={1} max={52} onChange={(every) => setSchedule({ ...s, interval: { ...s.interval!, every } })} accessibilityLabel="Cada" />
              <Segmented<"week" | "day">
                value={s.interval.unit}
                onChange={(unit) => setSchedule({ ...s, interval: { ...s.interval!, unit } })}
                options={[
                  { value: "week", label: "Semanas" },
                  { value: "day", label: "Días" },
                ]}
              />
            </Labeled>
            <Labeled label="A partir del" last={s.interval.unit === "day"}>
              <DateStepper value={s.interval.start} onChange={(start) => setSchedule({ ...s, interval: { ...s.interval!, start } })} />
            </Labeled>
            {s.interval.unit === "week" ? <WeekdayPicker days={s.days} emptyMeansEvery={false} onToggle={(day) => setSchedule({ ...s, days: toggleDay(s.days, day, false) })} /> : null}
          </>
        ) : null}
        {frequency === "monthly" ? (
          <Labeled label="El día" last>
            <Stepper value={s.monthDay ?? 1} min={1} max={31} onChange={(monthDay) => setSchedule({ ...s, monthDay })} accessibilityLabel="Día del mes" />
          </Labeled>
        ) : null}
      </Section>

      {!s.asNeeded ? (
        <Section title="¿Cuándo durante el día?" footer={timingFooter(s, timing)}>
          <View style={{ paddingVertical: 10 }}>
            <ChipPicker<Exclude<Timing, "asNeeded">>
              wrap
              testID="medication-timing"
              options={TIMINGS.map((t) => ({ value: t.value, label: t.label, icon: t.symbol }))}
              value={timing === "asNeeded" ? null : timing}
              onChange={(t) => setSchedule(becomeTiming(s, t))}
            />
          </View>
          {timing === "fixed" ? <FixedTimes schedule={s} onChange={setSchedule} /> : null}
          {timing === "window" ? <Windows schedule={s} onChange={setSchedule} /> : null}
          {timing === "training" && s.training ? <Training rule={s.training} onChange={(training) => setSchedule({ ...s, training })} /> : null}
          {timing === "meal" ? (
            <View style={{ paddingBottom: 10 }}>
              <MultiChips options={MEALS.map((m) => ({ value: m, label: MEAL_LABEL[m], icon: MEAL_SYMBOL[m] }))} on={s.meals} onToggle={(m) => setSchedule({ ...s, meals: toggleMeal(s.meals, m) })} />
            </View>
          ) : null}
        </Section>
      ) : null}

      {timing === "anyTime" ? (
        <Section title="Recordatorio" footer={s.reminder == null ? "Opcional. Sin él, Pulso no te avisa." : "Solo si a esa hora aún no la marcas como tomada."}>
          <ToggleRow label="Recordatorio si no la has tomado" value={s.reminder != null} onChange={(on) => setSchedule({ ...s, reminder: on ? DEFAULT_ANY_TIME_REMINDER : null })} last={s.reminder == null} />
          {s.reminder != null ? (
            <Labeled label="A las" last>
              <TimeStepper value={s.reminder} onChange={(reminder) => setSchedule({ ...s, reminder })} />
            </Labeled>
          ) : null}
        </Section>
      ) : null}

      <Section title="Existencias" footer={draft.stock != null ? "Cada toma marcada como tomada descuenta una dosis." : undefined}>
        <ToggleRow
          label="Llevar la cuenta de existencias"
          value={draft.stock != null}
          onChange={(on) => set({ stock: on ? (draft.stock ?? 30) : null, lowStockThreshold: on ? (draft.lowStockThreshold ?? 7) : null })}
          last={draft.stock == null}
        />
        {draft.stock != null ? (
          <>
            <Labeled label={`Quedan ${Math.round(draft.stock)} dosis`}>
              <Stepper value={draft.stock} min={0} max={10_000} onChange={(stock) => set({ stock })} unit="DOSIS" />
            </Labeled>
            <Labeled label={`Avisar con ${Math.round(draft.lowStockThreshold ?? 0)} o menos`} last>
              <Stepper value={draft.lowStockThreshold ?? 0} min={0} max={100} onChange={(lowStockThreshold) => set({ lowStockThreshold })} />
            </Labeled>
          </>
        ) : null}
      </Section>

      <Section title="Detalles">
        <View style={{ paddingTop: 10 }}>
          <ChipPicker options={INSTRUCTION_PRESETS.map((p) => ({ value: p, label: p }))} value={draft.instructions} onChange={(p) => set({ instructions: draft.instructions === p ? null : p })} />
        </View>
        <TextField value={draft.instructions ?? ""} onChange={(v) => set({ instructions: v || null })} placeholder="Indicaciones" />
        <Labeled label="Desde">
          <DateStepper value={draft.startDate} onChange={(startDate) => set({ startDate, endDate: draft.endDate && draft.endDate < startDate ? startDate : draft.endDate })} />
        </Labeled>
        <ToggleRow label="Hasta una fecha" value={draft.endDate != null} onChange={(on) => set({ endDate: on ? addDays(today, 30) : null })} />
        {draft.endDate != null ? (
          <Labeled label="Hasta">
            <DateStepper value={draft.endDate} min={draft.startDate} onChange={(endDate) => set({ endDate })} />
          </Labeled>
        ) : null}
        <ToggleRow label="Activo" value={draft.active} onChange={(active) => set({ active })} />
        <TextField value={draft.notes ?? ""} onChange={(v) => set({ notes: v || null })} placeholder="Notas" multiline />
      </Section>

      <Button title="Guardar" variant="accent" wide busy={saving} disabled={!valid} onPress={() => void save()} testID="medication-save" />
      {medication ? (
        <Pressable onPress={confirmDelete} style={{ alignItems: "center", paddingVertical: 10 }} accessibilityRole="button" testID="medication-delete">
          <Text variant="button" style={{ color: colors.negative }}>
            Eliminar
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function frequencyFooter(s: MedicationSchedule, f: Frequency): string | undefined {
  if (f === "asNeeded") return "Sin horario, avisos ni constancia: anota cada toma con + en Medicación.";
  if (f === "monthly" && (s.monthDay ?? 1) > 28) return "En los meses más cortos, el último día.";
  if (f === "everyN" && s.interval?.unit === "week") return "Cuenta las semanas desde la fecha de inicio.";
  return undefined;
}

function timingFooter(s: MedicationSchedule, t: Timing): string | undefined {
  const lines: string[] = [];
  if (t === "fixed") lines.push("Te avisamos en cada toma, con «Tomada» y «Posponer» en la notificación.");
  if (t === "window") lines.push("Una toma cuando quieras dentro de la franja. Te avisamos al empezar, y solo cuenta como olvidada si se acaba el día.");
  if (t === "anyTime") lines.push("Toca ese día, sin hora: cuando quieras. Solo cuenta como olvidada si se acaba el día.");
  if (t === "training")
    lines.push(
      s.training?.restDayTime == null
        ? "Te avisamos al terminar tu entreno, en Pulso o en Salud. Los días sin entreno no toca."
        : "Te avisamos al terminar tu entreno, en Pulso o en Salud. Los días sin entreno, a la hora que elijas.",
    );
  if (t === "meal") lines.push("A la hora de cada comida de tu calendario.");
  if (t === "bedtime") lines.push("Media hora antes de tu hora de dormir.");
  if (isMixed(s)) lines.push("Este horario combina varios momentos; cambiar el momento lo reemplaza.");
  return lines.join(" ") || undefined;
}

/** Several chips on at once (meals, parts of the day, quick times); the toggles keep at least one. */
function MultiChips<T extends string>({ options, on, onToggle }: { options: { value: T; label: string; icon?: Parameters<typeof Icon>[0]["name"] }[]; on: T[]; onToggle: (v: T) => void }) {
  const { colors, hairline } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const active = on.includes(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => onToggle(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 11, borderRadius: 8, backgroundColor: active ? colors.accent : colors.surfaceRaised, borderWidth: active ? 0 : hairline, borderColor: colors.separator }}
          >
            {o.icon ? <Icon name={o.icon} size={12} color={active ? "onAccent" : "textSecondary"} /> : null}
            <Text variant="meta" color={active ? "onAccent" : "text"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FixedTimes({ schedule: s, onChange }: { schedule: MedicationSchedule; onChange: (s: MedicationSchedule) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingBottom: 10, gap: 4 }}>
      {s.times.map((t, i) => (
        <Labeled key={i} label={timeLabel(t)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <TimeStepper value={t} onChange={(time) => onChange({ ...s, times: s.times.map((x, j) => (j === i ? time : x)).sort() })} />
            </View>
            {s.times.length > 1 ? (
              <Pressable hitSlop={10} onPress={() => onChange({ ...s, times: s.times.filter((_, j) => j !== i) })} accessibilityLabel="Quitar hora">
                <Icon name="minus.circle.fill" size={20} tint={colors.negative} />
              </Pressable>
            ) : null}
          </View>
        </Labeled>
      ))}
      <MultiChips options={TIME_PICKS.map((p) => ({ value: p.time, label: `${p.label} ${p.time}`, icon: p.symbol }))} on={s.times} onToggle={(t) => onChange({ ...s, times: toggleTime(s.times, t) })} />
    </View>
  );
}

function Windows({ schedule: s, onChange }: { schedule: MedicationSchedule; onChange: (s: MedicationSchedule) => void }) {
  const set = (part: string, patch: { start?: string; end?: string }) => onChange({ ...s, windows: s.windows.map((w) => (w.part === part ? { ...w, ...patch } : w)) });
  return (
    <View style={{ paddingBottom: 10, gap: 4 }}>
      <MultiChips options={PARTS.map((p) => ({ value: p, label: PART_LABEL[p], icon: PART_SYMBOL[p] }))} on={s.windows.map((w) => w.part)} onToggle={(p) => onChange({ ...s, windows: toggleWindow(s.windows, p) })} />
      {s.windows.map((w) => (
        <Labeled key={w.part} label={`${PART_LABEL[w.part]} · ${windowRange(w)}`}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <TimeStepper value={w.start} onChange={(start) => set(w.part, { start })} />
            </View>
            <View style={{ flex: 1 }}>
              <TimeStepper value={w.end} onChange={(end) => set(w.part, { end })} />
            </View>
          </View>
        </Labeled>
      ))}
    </View>
  );
}

function Training({ rule, onChange }: { rule: TrainingRule; onChange: (r: TrainingRule) => void }) {
  const windows = TRAINING_WINDOWS.includes(rule.withinMinutes) ? TRAINING_WINDOWS : [...TRAINING_WINDOWS, rule.withinMinutes].sort((a, b) => a - b);
  return (
    <View style={{ paddingBottom: 10 }}>
      <Labeled label="Dentro de">
        <ChipPicker<number> options={windows.map((m) => ({ value: m, label: `${m} min` }))} value={rule.withinMinutes} onChange={(withinMinutes) => onChange({ ...rule, withinMinutes })} />
      </Labeled>
      <Labeled label="Días sin entreno" last={rule.restDayTime == null}>
        <Segmented<"no" | "si">
          value={rule.restDayTime == null ? "no" : "si"}
          onChange={(v) => onChange({ ...rule, restDayTime: v === "si" ? (DEFAULT_TRAINING.restDayTime ?? "09:00") : null })}
          options={[
            { value: "no", label: "No tomar" },
            { value: "si", label: "A una hora" },
          ]}
        />
      </Labeled>
      {rule.restDayTime != null ? (
        <Labeled label="A las" last>
          <TimeStepper value={rule.restDayTime} onChange={(restDayTime) => onChange({ ...rule, restDayTime })} />
        </Labeled>
      ) : null}
    </View>
  );
}
