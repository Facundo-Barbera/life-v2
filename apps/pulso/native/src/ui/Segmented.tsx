import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { haptics } from "./haptics";
import { Text } from "./Text";

type Props<T extends string> = { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; testID?: string };

/** A segmented control: mono labels on the raised well, a lime thumb that springs to the choice. */
export function Segmented<T extends string>({ options, value, onChange, testID }: Props<T>) {
  const { colors, hairline, motion } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = options.length ? (width - 6) / options.length : 0;
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(index * segment, motion.pill) }] }), [index, segment]);
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: "row", height: 40, padding: 3, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: hairline, borderColor: colors.separator }}
    >
      {width > 0 ? <Animated.View style={[{ position: "absolute", top: 3, bottom: 3, left: 3, width: segment, borderRadius: 7, backgroundColor: colors.accent }, thumb]} /> : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              haptics.select();
              onChange(o.value);
            }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Text variant="button" color={on ? "onAccent" : "textSecondary"} style={{ fontSize: 12 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
