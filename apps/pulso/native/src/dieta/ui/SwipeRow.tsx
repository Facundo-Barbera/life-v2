import { useRef, type ReactNode } from "react";
import { ActionSheetIOS, Pressable, View } from "react-native";
import Swipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { useTheme } from "@/theme";
import { haptics } from "@/ui/haptics";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Text } from "@/ui/Text";

export type MenuAction = { title: string; onPress: () => void; destructive?: boolean };

/** A long-press menu (the SwiftUI context menu), as the system action sheet. */
export function showMenu(actions: MenuAction[], title?: string) {
  if (!actions.length) return;
  haptics.press();
  const options = [...actions.map((a) => a.title), "Cancelar"];
  const destructive = actions.findIndex((a) => a.destructive);
  ActionSheetIOS.showActionSheetWithOptions({ options, title, cancelButtonIndex: actions.length, destructiveButtonIndex: destructive >= 0 ? destructive : undefined }, (i) => actions[i]?.onPress());
}

type Side = { label: string; icon: SFSymbol; color: string; onPress: () => void; /** Ink on the colour; white by default. */ ink?: string };

/**
 * A row that swipes: right-to-left reveals Borrar (or `right`), left-to-right
 * an optional `left` action; long-press opens `menu`; tap does `onPress`.
 */
export function SwipeRow({ children, onPress, onDelete, right, left, menu, menuTitle, testID }: { children: ReactNode; onPress?: () => void; onDelete?: () => void; right?: Side; left?: Side; menu?: MenuAction[]; menuTitle?: string; testID?: string }) {
  const { colors } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const trailing: Side | undefined = right ?? (onDelete ? { label: "Borrar", icon: "trash", color: colors.negative, onPress: onDelete } : undefined);
  const action = (side: Side, align: "flex-start" | "flex-end") => (
    <Pressable
      onPress={() => {
        ref.current?.close();
        side.onPress();
      }}
      style={{ width: 84, backgroundColor: side.color, alignItems: "center", justifyContent: "center", gap: 3, alignSelf: "stretch" }}
      accessibilityLabel={side.label}
    >
      <Icon name={side.icon} size={16} tint={side.ink ?? "white"} />
      <Text variant="labelSmall" style={{ color: side.ink ?? "white", alignSelf: "center" }}>
        {side.label}
      </Text>
      <View style={{ alignSelf: align }} />
    </Pressable>
  );
  const allMenu = [...(menu ?? []), ...(onDelete ? [{ title: "Eliminar", destructive: true, onPress: onDelete }] : [])];
  return (
    <Swipeable
      ref={ref}
      testID={testID}
      friction={1.6}
      rightThreshold={42}
      leftThreshold={42}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={trailing ? () => action(trailing, "flex-end") : undefined}
      renderLeftActions={left ? () => action(left, "flex-start") : undefined}
      onSwipeableWillOpen={() => haptics.select()}
    >
      <Pressable onPress={onPress} onLongPress={allMenu.length ? () => showMenu(allMenu, menuTitle) : undefined} delayLongPress={380} style={{ backgroundColor: colors.surface }}>
        {children}
      </Pressable>
    </Swipeable>
  );
}
