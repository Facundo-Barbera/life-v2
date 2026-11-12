import { Children, isValidElement, type ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "@/theme";
import { Icon, type SFSymbol } from "./Icon";
import { PressableScale } from "./Pressable";
import { Text } from "./Text";

type Props = {
  title: string;
  /** Mono uppercase line under the title: «6 EJ · 55 MIN». */
  subtitle?: string;
  icon?: SFSymbol;
  /** Icon tint override (a raw colour); accent text by default. */
  iconTint?: string;
  /** A Button, a figure, a chevron. */
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
};

/** A list row: 36 pt icon tile, title + mono subtitle, trailing action; at least 56 pt tall. */
export function ListRow({ title, subtitle, icon, iconTint, trailing, onPress, testID }: Props) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 6 }}>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={17} tint={iconTint ?? colors.accentText} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="rowTitle" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" color="textSecondary" style={{ marginTop: 3 }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} testID={testID} feedback="select">
      {body}
    </PressableScale>
  ) : (
    <View testID={testID}>{body}</View>
  );
}

/** Rows inside a panel, separated by 1 pt hairlines (none above the first). Use inside `<Panel style={{ paddingVertical: 4 }}>`. */
export function Rows({ children }: { children: ReactNode }) {
  const { colors, hairline } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View>
      {items.map((child, i) => (
        <View key={child.key ?? i} style={i ? { borderTopWidth: hairline, borderTopColor: colors.separator } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}
