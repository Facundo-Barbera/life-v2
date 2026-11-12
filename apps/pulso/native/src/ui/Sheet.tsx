import { useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, PanResponder, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { usePresentation } from "@/health/access";
import { useTheme } from "@/theme";
import { haptics } from "./haptics";
import { Text } from "./Text";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Mono header label («ANOTAR PESO»). */
  title?: string;
  children: ReactNode;
  /** Content taller than the screen scrolls inside the sheet (default); false for content that scrolls itself. */
  scroll?: boolean;
  testID?: string;
};

const OFFSCREEN = 900;

/**
 * A bottom sheet: graphite scrim, a panel that springs up, drag the grabber
 * (or tap the scrim) to dismiss. A component, not a route, so a quick action
 * can open one from anywhere (the rail's fan, a row). For full screens that
 * deserve a URL, use an Expo Router `presentation: "formSheet"` route instead.
 */
export function Sheet({ visible, onClose, title, children, scroll = true, testID }: Props) {
  const { colors, motion, hairline, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(OFFSCREEN);
  const scrim = useSharedValue(0);
  usePresentation(mounted);

  // Unmount once closed even when the slide-out was cut short (a system sheet, the app going
  // to the background): a <Modal> left mounted would stay over the screen as a blank layer.
  const shown = useRef(visible);
  shown.current = visible;
  const unmount = useRef(() => {
    if (!shown.current) setMounted(false);
  }).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      haptics.press();
    } else if (mounted) {
      scrim.value = withTiming(0, { duration: motion.fast });
      y.value = withTiming(OFFSCREEN, { duration: motion.base }, () => scheduleOnRN(unmount));
    }
  }, [visible, mounted, y, scrim, motion, unmount]);

  const onShow = () => {
    y.value = withSpring(0, motion.sheet);
    scrim.value = withTiming(1, { duration: motion.base });
  };

  const close = useRef(onClose);
  close.current = onClose;
  const drag = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => {
        y.value = Math.max(0, g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 0.9) close.current();
        else y.value = withSpring(0, motion.sheet);
      },
    }),
  ).current;

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const shade = useAnimatedStyle(() => ({ opacity: scrim.value }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onShow={onShow} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }} testID={testID}>
        <Animated.View style={[{ position: "absolute", inset: 0, backgroundColor: colors.scrim }, shade]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" />
        </Animated.View>
        <KeyboardAvoidingView behavior="padding">
          <Animated.View
            style={[
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                borderCurve: "continuous",
                borderWidth: hairline,
                borderColor: colors.separator,
                paddingHorizontal: space.gutter + 4,
                paddingBottom: insets.bottom + space.lg,
                maxHeight: height - insets.top - space.sm,
              },
              panel,
            ]}
          >
            <View {...drag.panHandlers} style={{ paddingTop: 10, paddingBottom: title ? 6 : 14, alignItems: "center", gap: 14 }}>
              <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.separator }} />
              {title ? (
                <Text variant="label" color="textSecondary" style={{ alignSelf: "flex-start" }}>
                  {title}
                </Text>
              ) : null}
            </View>
            {scroll ? (
              <ScrollView style={{ flexGrow: 0 }} alwaysBounceVertical={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            ) : (
              <View style={{ flexShrink: 1 }}>{children}</View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
