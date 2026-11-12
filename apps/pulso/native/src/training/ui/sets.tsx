import type { SetLog } from "@/contract";
import { ActionSheetIOS, Alert, Pressable, View } from "react-native";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { PressableScale } from "@/ui/Pressable";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { dropsText, type Segment } from "../drops";
import type { LiveSession } from "../live/session";
import { isDone, repRange, type LiveExercise, type LiveSet } from "../live/state";
import { previousText } from "../text";
import { number, shown, snapKg, type WeightUnit } from "../units";

// A set, as Pulso shows it: one row of the same shape for every set — the one
// up next open, the others quiet with a check to log or undo them. In Tablero's
// language the open row's load and repetitions are 64 pt steppers (tap the
// number to type it), done rows carry a lime check, and «HECHO» lives in the bar
// at the bottom. Until the reps are chosen an open set shows the range («8–10»)
// and logs its top. «Otro peso» and removing live in the long press.

/** Segments after the top one a set can have. */
const MAX_DROPS = 3;

/** A number typed in place: "5,2" or "5.2"; null when empty, not a number or negative. */
export function parseNumber(text: string | undefined): number | null {
  const value = Number((text ?? "").replace(",", ".").trim());
  return text?.trim() && Number.isFinite(value) && value >= 0 ? value : null;
}

function typeNumber(title: string, current: string, keyboard: "decimal-pad" | "number-pad", commit: (n: number) => void) {
  Alert.prompt(
    title,
    undefined,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Listo", onPress: (text?: string) => { const n = parseNumber(text); if (n != null) commit(n); } },
    ],
    "plain-text",
    current,
    keyboard,
  );
}

type RowProps = {
  session: LiveSession;
  /** Index of the exercise now (resolved by id, never a stale position). */
  e: number;
  exercise: LiveExercise;
  set: LiveSet;
  s: number;
  previous: SetLog | null;
  unit: WeightUnit;
  /** The set up next (or one opened by hand): the steppers show. */
  open: boolean;
  onOpen: () => void;
  /** In a superset round: the exercise's name over the numbers; the round owns the check. */
  name?: string;
  onInfo?: () => void;
  /** After a set is checked: the drop offer, if any. */
  onToggled?: (set: LiveSet) => void;
  testID?: string;
};

export function SetRow({ session, e, exercise, set, s, previous, unit, open, onOpen, name, onInfo, onToggled, testID }: RowProps) {
  const { colors, space, radius, hairline } = useTheme();
  const done = isDone(set);
  const range = repRange(exercise, set);
  const kg = done ? set.weightKg : snapKg(set.weightKg, unit);
  const weight = shown(kg, unit);
  const needsLoad = !["bodyweight", "band"].includes(exercise.equipment);
  const repsText = range ? `${range[0]}–${range[1]}` : String(set.reps);
  const caption = previous ? `ANT ${previousText(previous.weightKg, previous.reps, unit).toUpperCase()}` : null;

  const more = () => {
    const options: { label: string; run: () => void; destructive?: boolean }[] = [];
    if (needsLoad && set.drops.length < MAX_DROPS)
      options.push({ label: "Otro peso", run: () => { const d = session.nextDrop(e, s); if (d) session.addDrop(e, s, d); } });
    if (set.drops.length) options.push({ label: "Quitar el último peso", run: () => session.removeDrop(e, s, set.drops.length - 1) });
    if (!done) options.push({ label: "Eliminar serie", run: () => session.removeSet(e, s), destructive: true });
    if (!options.length) return;
    haptics.press();
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...options.map((o) => o.label), "Cancelar"], cancelButtonIndex: options.length, destructiveButtonIndex: options.findIndex((o) => o.destructive) },
      (i) => options[i]?.run(),
    );
  };

  const toggle = () => {
    session.toggle(e, s);
    const after = session.state.exercises.find((x) => x.id === exercise.id)?.sets.find((x) => x.id === set.id);
    if (after && isDone(after)) onToggled?.(after);
  };

  const label = name ?? `SERIE ${s + 1}`;
  const background = open && !done ? colors.surfaceRaised : colors.surface;

  return (
    <Pressable onPress={open ? undefined : onOpen} onLongPress={more} testID={testID} accessibilityHint="Mantén pulsado para otro peso o eliminarla">
      <View
        style={{
          backgroundColor: name ? "transparent" : background,
          borderRadius: radius.md,
          borderCurve: "continuous",
          borderWidth: name ? 0 : open && !done ? 1.5 : hairline,
          borderColor: open && !done ? colors.accentText : colors.separator,
          padding: name ? 0 : space.md,
          gap: space.sm,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Pressable onPress={onInfo} disabled={!onInfo} style={{ flex: 1 }}>
            <Text variant={name ? "rowTitle" : "label"} color={name ? "text" : open && !done ? "accentText" : "textSecondary"} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
          {caption ? (
            <Text variant="meta" color="textTertiary" numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>
        {open ? (
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              {needsLoad || weight > 0 ? (
                <Typed onPress={() => typeNumber("Peso", number(weight), "decimal-pad", (n) => session.setWeight(e, s, n))}>
                  <Stepper
                    testID={testID ? `${testID}-kg` : undefined}
                    value={weight}
                    step={1}
                    unit={unit.toUpperCase()}
                    format={(n) => number(n)}
                    onChange={(next) => session.stepWeight(e, s, next > weight)}
                    accessibilityLabel="Peso"
                  />
                </Typed>
              ) : (
                <View style={{ height: 64, alignItems: "center", justifyContent: "center" }}>
                  <Text variant="label" color="textSecondary">
                    SIN LASTRE
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Typed onPress={() => typeNumber("Repeticiones", range ? "" : String(set.reps), "number-pad", (n) => session.setReps(e, s, n))}>
                <Stepper
                  testID={testID ? `${testID}-reps` : undefined}
                  value={range ? range[1] : set.reps}
                  step={1}
                  unit="REPS"
                  format={(n) => (range ? `${range[0]}–${range[1]}` : String(n))}
                  onChange={(next) => session.adjustReps(e, s, next > (range ? range[1] : set.reps) ? 1 : -1)}
                  accessibilityLabel="Repeticiones"
                />
              </Typed>
            </View>
            {name ? null : <Check done={done} onPress={toggle} testID={testID ? `${testID}-check` : undefined} />}
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", gap: space.lg }}>
              {needsLoad || weight > 0 ? (
                <Text variant="stat" color={done ? "text" : "textSecondary"}>
                  {number(weight)}
                  <Text variant="labelSmall" color="textSecondary">
                    {` ${unit.toUpperCase()}`}
                  </Text>
                </Text>
              ) : (
                <Text variant="label" color="textSecondary">
                  SIN LASTRE
                </Text>
              )}
              <Text variant="stat" color={done ? "text" : "textSecondary"}>
                {repsText}
                <Text variant="labelSmall" color="textSecondary">
                  {" REPS"}
                </Text>
              </Text>
            </View>
            {name ? null : <Check done={done} onPress={toggle} testID={testID ? `${testID}-check` : undefined} />}
          </View>
        )}
        {set.drops.map((drop, d) => (
          <DropLine key={d} drop={drop} done={done} unit={unit} open={open} onStep={(up) => session.stepDropWeight(e, s, d, up)} onReps={(reps) => session.setDropReps(e, s, d, reps)} />
        ))}
      </View>
    </Pressable>
  );
}

/** A stepper whose number can be tapped to type it. */
function Typed({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <View>
      {children}
      <Pressable accessibilityLabel="Escribir el número" onPress={onPress} style={{ position: "absolute", left: 48, right: 48, top: 0, bottom: 0 }} />
    </View>
  );
}

/** The quiet check of a set: lime when done (tap to undo), hollow to log it as it stands. */
export function Check({ done, onPress, testID }: { done: boolean; onPress: () => void; testID?: string }) {
  const { colors, radius, hairline } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback={done ? "tap" : "success"}
      accessibilityLabel={done ? "Desmarcar serie" : "Marcar como hecha"}
      style={{
        width: 56,
        height: 56,
        borderRadius: radius.md,
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: done ? colors.accent : colors.surfaceRaised,
        borderWidth: done ? 0 : hairline,
        borderColor: colors.separator,
      }}
    >
      <Icon name="checkmark" size={20} color={done ? "onAccent" : "textTertiary"} weight="bold" />
    </PressableScale>
  );
}

/** "↳ 60 kg × 3": a drop, stepped in place while the row is open. */
function DropLine({ drop, done, unit, open, onStep, onReps }: { drop: Segment; done: boolean; unit: WeightUnit; open: boolean; onStep: (up: boolean) => void; onReps: (reps: number) => void }) {
  const { space } = useTheme();
  const kg = done ? drop.weightKg : snapKg(drop.weightKg, unit);
  const weight = shown(kg, unit);
  if (!open)
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon name="arrow.turn.down.right" size={13} color="accentText" />
        <Text variant="numberSmall" color="textSecondary">
          {dropsText([{ weightKg: kg, reps: drop.reps }], unit)}
        </Text>
      </View>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Icon name="arrow.turn.down.right" size={15} color="accentText" />
      <View style={{ flex: 1 }}>
        <Stepper value={weight} step={1} unit={`BAJASTE A · ${unit.toUpperCase()}`} format={(n) => number(n)} onChange={(next) => onStep(next > weight)} />
      </View>
      <View style={{ flex: 1 }}>
        <Stepper value={drop.reps} min={1} unit="REPS" onChange={onReps} />
      </View>
    </View>
  );
}

/** "¿Bajaste el peso para terminarla?" with the lighter load and the reps missing, one tap to add them. */
export function DropPrompt({ drop, unit, onAccept }: { drop: Segment; unit: WeightUnit; onAccept: () => void }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }}>
      <Icon name="arrow.turn.down.right" size={14} color="accentText" />
      <Text variant="footnote" color="textSecondary" style={{ flex: 1 }} numberOfLines={2}>
        ¿Bajaste el peso para terminarla?
      </Text>
      <Button title={dropsText([drop], unit)} onPress={onAccept} accessibilityLabel={`Sí, añadir ${dropsText([drop], unit)}`} />
    </View>
  );
}
