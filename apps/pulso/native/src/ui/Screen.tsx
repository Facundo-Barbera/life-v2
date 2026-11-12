import { type ReactNode, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEngine } from "@/data/session";
import { useRailMetrics } from "@/shell/metrics";
import { useTheme } from "@/theme";
import { Chip } from "./Chip";
import { ConnectionBanner } from "./ConnectionBanner";
import { Text } from "./Text";

type DayNav = { prev?: { label: string; onPress: () => void }; next?: { label: string; onPress: () => void } };

type Props = {
  /** The mono top line: «MIÉ 21 OCT», «COACH», «DIETA · MIÉ 21». */
  title: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Right side of the top line (a Chip). */
  accessory?: ReactNode;
  /** Left side, before the title (a close button). */
  leading?: ReactNode;
  /** «‹ MAR · DIETA · MIÉ 21 · JUE ›»: the title centred between day chips. */
  dayNav?: DayNav;
  /** false for screens that manage their own scrolling (a chat). */
  scroll?: boolean;
  /** Pinned above the rail (Coach's composer, Dieta's action bar). */
  footer?: ReactNode;
  /** Extra bottom room for a footer's height. */
  footerHeight?: number;
  testID?: string;
};

/**
 * A tab's page in Tablero: a mono top line instead of a large title, the
 * connection banner when the Mac isn't there, panels 8 pt apart, pull to
 * refresh, and room at the bottom for the floating rail (and a footer).
 */
export function Screen({ title, children, refreshing = false, onRefresh, accessory, leading, dayNav, scroll = true, footer, footerHeight = 0, testID }: Props) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const rail = useRailMetrics();
  const { recheck } = useEngine();
  // Only a pull shows the spinner: background refetches (tab focus, engine events) also
  // flip `refreshing`, and a programmatic spinner pushes the page down under a blank band.
  const [pulled, setPulled] = useState(false);
  useEffect(() => {
    if (!refreshing) setPulled(false);
  }, [refreshing]);
  const header = <ScreenHeader title={title} accessory={accessory} leading={leading} dayNav={dayNav} />;
  const bottom = rail.contentPadding + (footer ? footerHeight + space.sm : 0);
  const content = (
    <>
      {header}
      <ConnectionBanner />
      {children}
    </>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID={testID}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.gutter, paddingBottom: bottom, gap: space.sm }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                tintColor={colors.textSecondary}
                refreshing={pulled && refreshing}
                onRefresh={() => {
                  setPulled(true);
                  recheck();
                  onRefresh();
                }}
              />
            ) : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + space.xs, paddingHorizontal: space.gutter, paddingBottom: bottom, gap: space.sm }}>{content}</View>
      )}
      {footer ? (
        <View style={{ position: "absolute", left: space.gutter, right: space.gutter, bottom: rail.bottom + rail.height + space.sm + 8 }}>{footer}</View>
      ) : null}
    </View>
  );
}

/** The top line on its own, for screens that build their own layout. */
export function ScreenHeader({ title, accessory, leading, dayNav }: Pick<Props, "title" | "accessory" | "leading" | "dayNav">) {
  if (dayNav)
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingTop: 6, paddingBottom: 6, minHeight: 36 }}>
        <View style={{ minWidth: 64, alignItems: "flex-start" }}>{dayNav.prev ? <Chip label={`‹ ${dayNav.prev.label}`} onPress={dayNav.prev.onPress} testID="day-prev" /> : null}</View>
        <Text variant="label" style={{ fontWeight: "700" }} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ minWidth: 64, alignItems: "flex-end" }}>{dayNav.next ? <Chip label={`${dayNav.next.label} ›`} onPress={dayNav.next.onPress} testID="day-next" /> : null}</View>
      </View>
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, paddingTop: 6, paddingBottom: 6, minHeight: 36 }}>
      {leading}
      <Text variant="label" style={{ fontWeight: "700", flex: 1, fontSize: 11.5 }} numberOfLines={1}>
        {title}
      </Text>
      {accessory}
    </View>
  );
}
