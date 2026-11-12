import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "@/theme";
import { haptics } from "@/ui/haptics";
import { Icon } from "@/ui/Icon";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { RAIL_HEIGHT, SESSION_HEIGHT, useRailMetrics } from "./metrics";
import { QuickLog } from "./QuickLog";
import { formatTimer, useNow, useRail, type RailSession } from "./session";
import { TABS } from "./tabs";

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const PAD = 7;
const GAP = 2;
/** The active tab is this many inactive tabs wide (it shows its label). */
const ACTIVE = 1.9;

/**
 * The floating rail (Tablero's tab bar): five tabs, the active one widened
 * with its name on a lime pill that springs between them. Long-press anywhere
 * on it for the quick-log fan. During a live session the session's control
 * (timer and «VOLVER») rides on top of it, so the tabs stay one tap away.
 */
export function Rail({ state, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const metrics = useRailMetrics();
  const { session, hidden } = useRail();
  const [fan, setFan] = useState(false);
  const [width, setWidth] = useState(0);

  const routes = state.routes.filter((r) => TABS.some((t) => t.name === r.name));
  const activeName = state.routes[state.index]?.name;
  const active = Math.max(
    0,
    routes.findIndex((r) => r.name === activeName),
  );
  const unit = width > 0 ? (width - PAD * 2 - GAP * (routes.length - 1)) / (routes.length - 1 + ACTIVE) : 0;

  const pillX = useSharedValue(0);
  useEffect(() => {
    pillX.value = withSpring(PAD + active * (unit + GAP), { damping: 20, stiffness: 260, mass: 0.9 });
  }, [active, unit, pillX]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.value }] }));

  if (hidden) return null;

  const go = (name: string, key: string) => {
    if (activeName !== name) navigateToTab(key);
  };

  return (
    <>
      <View pointerEvents="box-none" style={{ position: "absolute", left: metrics.side, right: metrics.side, bottom: metrics.bottom, gap: 8 }}>
        {session ? (
          <View
            style={{
              height: SESSION_HEIGHT,
              borderRadius: 20,
              borderCurve: "continuous",
              backgroundColor: colors.rail,
              borderWidth: 1,
              borderColor: colors.railBorder,
              shadowColor: "#000",
              shadowOpacity: 0.45,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 10 },
            }}
          >
            <SessionControl session={session} />
          </View>
        ) : null}
        <Pressable
          testID="rail"
          onLongPress={() => {
            haptics.press();
            setFan(true);
          }}
          delayLongPress={380}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{
            height: RAIL_HEIGHT,
            borderRadius: 20,
            borderCurve: "continuous",
            backgroundColor: colors.rail,
            borderWidth: 1,
            borderColor: colors.railBorder,
            shadowColor: "#000",
            shadowOpacity: 0.45,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: PAD, gap: GAP }}>
            {unit > 0 ? (
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: 0,
                    top: (RAIL_HEIGHT - 2 - 50) / 2,
                    height: 50,
                    width: unit * ACTIVE,
                    borderRadius: 14,
                    backgroundColor: colors.accent,
                  },
                  pill,
                ]}
              />
            ) : null}
            {routes.map((route, i) => {
              const tab = TABS.find((t) => t.name === route.name)!;
              const on = i === active;
              return (
                <RailTab
                  key={route.key}
                  title={tab.title}
                  symbol={tab.symbol}
                  on={on}
                  width={unit * (on ? ACTIVE : 1)}
                  onPress={() => go(route.name, route.key)}
                  onLongPress={() => {
                    haptics.press();
                    setFan(true);
                  }}
                />
              );
            })}
          </View>
        </Pressable>
      </View>
      <QuickLog open={fan} onClose={() => setFan(false)} />
    </>
  );
}

function RailTab({
  title,
  symbol,
  on,
  width,
  onPress,
  onLongPress,
}: {
  title: string;
  symbol: (typeof TABS)[number]["symbol"];
  on: boolean;
  width: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const w = useSharedValue(width);
  useEffect(() => {
    w.value = withSpring(width, { damping: 20, stiffness: 260, mass: 0.9 });
  }, [width, w]);
  const sized = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <Animated.View style={[{ height: 50 }, sized]}>
      <Pressable
        testID={`tab-${title.toLowerCase()}`}
        accessibilityRole="tab"
        accessibilityLabel={title}
        accessibilityState={{ selected: on }}
        onPressIn={() => !on && haptics.tap()}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={380}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}
      >
        <Icon name={symbol} size={19} tint={on ? colors.onAccent : colors.railInk} weight={on ? "bold" : "medium"} />
        {on ? (
          <Animated.View entering={FadeIn.duration(180).delay(60)} exiting={FadeOut.duration(80)}>
            <Text variant="button" style={{ color: colors.onAccent, fontSize: 12 }} numberOfLines={1}>
              {title}
            </Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The rail during a live session: «TORSO A · 7/18 / DESCANSO», the timer in lime, «VOLVER». */
function SessionControl({ session }: { session: RailSession }) {
  const { colors } = useTheme();
  const now = useNow(!!session.timer);
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 7, gap: 10 }}
      testID="rail-session"
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" style={{ color: "#E9EEF0", fontWeight: "700" }} numberOfLines={1}>
          {session.title}
        </Text>
        {session.subtitle ? (
          <Text variant="label" style={{ color: colors.railInk, marginTop: 3 }} numberOfLines={1}>
            {session.subtitle}
          </Text>
        ) : null}
      </View>
      {session.timer ? (
        <Text variant="number" style={{ color: colors.accent, fontSize: 28 }} numberOfLines={1} testID="rail-timer">
          {formatTimer(session.timer, now)}
        </Text>
      ) : null}
      <PressableScale
        testID="rail-volver"
        onPress={session.onReturn}
        feedback="press"
        style={{ height: 50, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
      >
        <Text variant="button" color="onAccent" style={{ fontSize: 12 }}>
          Volver
        </Text>
      </PressableScale>
    </Animated.View>
  );
}
