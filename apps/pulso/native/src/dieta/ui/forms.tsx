import type { ReactNode } from "react";
import { ScrollView, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { useTheme } from "@/theme";
import { Icon } from "@/ui/Icon";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { SLOT_ICONS, SLOT_TITLES, SLOTS, type MealSlot } from "../model";

/** A numeric string → number, accepting a decimal comma; null when blank or not a number. */
export const num = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() && Number.isFinite(n) ? n : null;
};
export const str = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));

/** A mono section label over a group of fields. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const { colors, radius, hairline } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {title ? (
        <Text variant="label" color="textSecondary" style={{ paddingHorizontal: 4 }}>
          {title}
        </Text>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: hairline, borderColor: colors.separator, paddingHorizontal: 14 }}>{children}</View>
      {footer ? (
        <Text variant="footnote" color="textSecondary" style={{ paddingHorizontal: 4 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** One row of a Section: label left, field right, a hairline between rows. */
export function FieldRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  const { colors, hairline } = useTheme();
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: last ? 0 : hairline, borderBottomColor: colors.separator }}>
      <Text variant="subhead" style={{ flex: 1 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function NumberField({ value, onChange, placeholder = "—", unit, width = 96, testID, autoFocus, keyboard = "decimal-pad" }: { value: string; onChange: (s: string) => void; placeholder?: string; unit?: string; width?: number; testID?: string; autoFocus?: boolean; keyboard?: KeyboardTypeOptions }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboard}
        autoFocus={autoFocus}
        selectTextOnFocus
        style={[type.numberSmall, { color: colors.text, width, textAlign: "right", paddingVertical: 10 }]}
      />
      {unit !== undefined ? (
        <Text variant="labelSmall" color="textSecondary" style={{ width: 44 }} numberOfLines={1} adjustsFontSizeToFit>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

export function TextField({ value, onChange, placeholder, testID, autoFocus, multiline }: { value: string; onChange: (s: string) => void; placeholder?: string; testID?: string; autoFocus?: boolean; multiline?: boolean }) {
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      autoFocus={autoFocus}
      multiline={multiline}
      style={{ color: colors.text, fontSize: 15, paddingVertical: 13, minHeight: multiline ? 72 : undefined }}
    />
  );
}

/** Mono chips in a row; the chosen one is lime. */
export function ChipPicker<T extends string | number>({ options, value, onChange, testID, wrap }: { options: { value: T; label: string; icon?: Parameters<typeof Icon>[0]["name"] }[]; value: T | null; onChange: (v: T) => void; testID?: string; wrap?: boolean }) {
  const { colors, hairline } = useTheme();
  const Box = ({ children }: { children: ReactNode }) =>
    wrap ? (
      <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 2 }}>
        {children}
      </View>
    ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }} testID={testID} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    );
  return (
    <Box>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={String(o.value)}
            feedback="select"
            onPress={() => onChange(o.value)}
            accessibilityState={{ selected: on }}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 11, borderRadius: 8, backgroundColor: on ? colors.accent : colors.surfaceRaised, borderWidth: on ? 0 : hairline, borderColor: colors.separator }}
          >
            {o.icon ? <Icon name={o.icon} size={12} color={on ? "onAccent" : "textSecondary"} /> : null}
            <Text variant="meta" color={on ? "onAccent" : "text"}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </Box>
  );
}

export function SlotPicker({ value, onChange }: { value: MealSlot; onChange: (s: MealSlot) => void }) {
  return <ChipPicker options={SLOTS.map((s) => ({ value: s, label: SLOT_TITLES[s], icon: SLOT_ICONS[s] }))} value={value} onChange={onChange} testID="slot-picker" wrap />;
}

/** «P 32 · C 50 · G 9» with the macro hues. */
export function MacroLine({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const { colors } = useTheme();
  const part = (k: string, v: number, c: string) => (
    <Text variant="meta" style={{ color: c }}>
      {k} {Math.round(v)}
    </Text>
  );
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {part("P", protein, colors.protein)}
      {part("C", carbs, colors.carbs)}
      {part("G", fat, colors.fat)}
    </View>
  );
}

