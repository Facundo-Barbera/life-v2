import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { motion } from "@/theme";
import { haptics } from "./haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Haptic on press-in; null for none. */
  feedback?: keyof typeof haptics | null;
};

/** A Pressable that springs to 0.97 while held and taps the Taptic Engine. Every tappable thing in Tablero is one. */
export function PressableScale({ children, style, feedback = "tap", onPressIn, onPressOut, disabled, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? "button"}
      onPressIn={(e) => {
        scale.value = withSpring(motion.pressScale, motion.press);
        if (feedback) haptics[feedback]();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, motion.press);
        onPressOut?.(e);
      }}
      style={[style, animated, disabled ? { opacity: 0.45 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}
