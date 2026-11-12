import type { ProgramWeek } from "@/contract";
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { Pressable, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useTheme } from "@/theme";
import { IconButton } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { PressableScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import type { DayMark } from "../selector";

// Entreno's navigator: «‹ SEM 2 DE 6 ›» with a pip per week, the week's days as
// pills centred on the chosen one (the neighbouring weeks' edge days peek in),
// and the week's cards in a horizontal scroll the pills follow.

/** «‹ SEM 2 DE 6 ›»: chevrons and a swipe move a week; a pip per week shows its days done, the chosen one taller. */
export function WeekSelector({ weeks, selected, current, onSelect }: { weeks: ProgramWeek[]; selected: number; current: number; onSelect: (week: number, dir: 1 | -1) => void }) {
  const { colors, space } = useTheme();
  const i = weeks.findIndex((w) => w.number === selected);
  const week = weeks[i];
  const prev = weeks[i - 1];
  const next = weeks[i + 1];
  const sub = [
    week?.number === current ? "ahora" : week?.state === "past" ? "pasada" : `en ${(week?.number ?? 0) - current} sem`,
    week ? `${week.done}/${week.days.length} días` : null,
    week?.deload ? "descarga" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pan = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onDeactivate: (e) => {
      "worklet";
      if (Math.abs(e.translationX) < 40 && Math.abs(e.velocityX) < 500) return;
      const dir = e.translationX < 0 ? 1 : -1;
      scheduleOnRN(step, dir);
    },
  });
  function step(dir: 1 | -1) {
    const to = dir > 0 ? next : prev;
    if (to) onSelect(to.number, dir);
  }
  return (
    <GestureDetector gesture={pan}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }} testID="week-selector">
        <IconButton icon="chevron.left" size={44} onPress={prev ? () => onSelect(prev.number, -1) : undefined} accessibilityLabel="Semana anterior" testID="week-prev" />
        <View style={{ flex: 1, alignItems: "center", gap: 5 }} accessibilityRole="adjustable" accessibilityLabel={`Semana ${selected} de ${weeks.length}, ${sub}`}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text variant="label" style={{ fontSize: 13, lineHeight: 16, fontWeight: "700", letterSpacing: 1 }}>
              Sem {selected} de {weeks.length}
            </Text>
          </View>
          <Text variant="labelSmall" color={week?.number === current ? "accentText" : "textSecondary"} numberOfLines={1}>
            {sub}
          </Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
            {weeks.map((w) => {
              const on = w.number === selected;
              const fill = w.days.length ? w.done / w.days.length : 0;
              return (
                <Pressable key={w.number} onPress={() => w.number !== selected && onSelect(w.number, w.number > selected ? 1 : -1)} hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }} accessibilityLabel={`Semana ${w.number}`}>
                  <View
                    style={{
                      width: weeks.length > 8 ? 10 : 18,
                      height: on ? 6 : 4,
                      borderRadius: 3,
                      backgroundColor: on ? colors.textTertiary : colors.separator,
                      overflow: "hidden",
                      borderWidth: w.number === current ? 1 : 0,
                      borderColor: colors.accentText,
                    }}
                  >
                    <View style={{ width: `${Math.round(fill * 100)}%`, height: "100%", backgroundColor: colors.accent }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
        <IconButton icon="chevron.right" size={44} onPress={next ? () => onSelect(next.number, 1) : undefined} accessibilityLabel="Semana siguiente" testID="week-next" />
      </View>
    </GestureDetector>
  );
}

export type PillItem = { key: string; title: string; mark: DayMark; /** A neighbouring week's day: «S3». */ week?: string };

/**
 * The week's days as pills on a track that springs so the chosen one sits in
 * the middle; drag the track and it settles on the pill nearest the centre.
 */
export function DayPills({ items, selected, onSelect }: { items: PillItem[]; selected: string; onSelect: (key: string) => void }) {
  const { motion } = useTheme();
  const [width, setWidth] = useState(0);
  const [boxes, setBoxes] = useState<Record<string, { x: number; w: number }>>({});
  const tx = useSharedValue(0);
  const start = useSharedValue(0);
  const centers = useSharedValue<number[]>([]);
  const placed = useRef(false);
  const ready = width > 0 && items.every((it) => boxes[it.key]);
  const offsetOf = (key: string) => {
    const b = boxes[key];
    return b ? width / 2 - (b.x + b.w / 2) : 0;
  };

  useEffect(() => {
    if (!ready) return;
    centers.value = items.map((it) => boxes[it.key]!.x + boxes[it.key]!.w / 2);
    const to = offsetOf(selected);
    // The first placement doesn't animate in from 0.
    tx.value = placed.current ? withSpring(to, motion.pill) : to;
    placed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected, width, boxes, items]);

  const keys = items.map((it) => it.key);
  const pan = usePanGesture({
    activeOffsetX: [-10, 10],
    failOffsetY: [-14, 14],
    onBegin: () => {
      "worklet";
      start.value = tx.value;
    },
    onUpdate: (e) => {
      "worklet";
      tx.value = start.value + e.translationX;
    },
    onDeactivate: (e) => {
      "worklet";
      const projected = tx.value + e.velocityX * 0.12;
      let best = 0;
      for (let i = 1; i < centers.value.length; i++) if (Math.abs(width / 2 - centers.value[i]! - projected) < Math.abs(width / 2 - centers.value[best]! - projected)) best = i;
      const c = centers.value[best];
      if (c != null) tx.value = withSpring(width / 2 - c, motion.pill);
      scheduleOnRN(settle, best);
    },
  });
  function settle(i: number) {
    const key = keys[i];
    if (key && key !== selected) onSelect(key);
    else tx.value = withSpring(offsetOf(selected), motion.pill);
  }
  const track = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 48, overflow: "hidden", justifyContent: "center" }} testID="day-pills" accessibilityRole="tablist">
        <Animated.View style={[{ position: "absolute", left: 0, flexDirection: "row", alignItems: "center", gap: 8, opacity: ready ? 1 : 0 }, track]}>
          {items.map((it) => (
            <Pill
              key={it.key}
              item={it}
              on={it.key === selected}
              onPress={() => it.key !== selected && onSelect(it.key)}
              onLayout={(e: LayoutChangeEvent) => {
                const { x, width: w } = e.nativeEvent.layout;
                setBoxes((b) => (b[it.key]?.x === x && b[it.key]?.w === w ? b : { ...b, [it.key]: { x, w } }));
              }}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const MARK_LABEL: Record<DayMark, string> = { done: "hecho", partial: "a medias", next: "siguiente", planned: "pendiente", skipped: "saltado" };

function Pill({ item, on, onPress, onLayout }: { item: PillItem; on: boolean; onPress: () => void; onLayout: (e: LayoutChangeEvent) => void }) {
  const { colors, hairline, motion } = useTheme();
  const lime = on && item.mark === "next";
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(on ? 1 : 0.92, motion.pill) }], opacity: withTiming(item.week ? 0.45 : on ? 1 : 0.85, { duration: motion.fast }) }), [on, item.week]);
  const ink = lime ? "onAccent" : on ? "text" : item.mark === "next" ? "accentText" : "textSecondary";
  return (
    <Animated.View onLayout={onLayout} style={scale}>
      <PressableScale
        onPress={onPress}
        feedback={null}
        testID={`day-pill-${item.key}`}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${item.title}${item.week ? `, semana ${item.week.slice(1)}` : ""}, ${MARK_LABEL[item.mark]}`}
        style={{
          height: 40,
          paddingHorizontal: 14,
          borderRadius: 20,
          borderCurve: "continuous",
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          backgroundColor: lime ? colors.accent : on ? colors.surfaceRaised : "transparent",
          borderWidth: on && !lime ? 1 : hairline,
          borderColor: lime ? colors.accent : on ? colors.textSecondary : colors.separator,
        }}
      >
        <MarkGlyph mark={item.mark} onLime={lime} />
        {item.week ? (
          <Text variant="labelSmall" color="textTertiary">
            {item.week}
          </Text>
        ) : null}
        <Text variant="label" color={ink} style={{ fontSize: 12, fontWeight: on ? "700" : "600" }} numberOfLines={1}>
          {item.title}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

export function MarkGlyph({ mark, onLime }: { mark: DayMark; onLime: boolean }) {
  const { colors } = useTheme();
  if (mark === "done")
    return (
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
        <Icon name="checkmark" size={9} color="onAccent" weight="bold" />
      </View>
    );
  if (mark === "partial") return <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.warning, borderLeftColor: "transparent", transform: [{ rotate: "45deg" }] }} />;
  if (mark === "skipped") return <Icon name="minus" size={11} color="textTertiary" weight="bold" />;
  if (mark === "next") return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: onLime ? colors.onAccent : colors.accentText }} />;
  return <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.textTertiary }} />;
}

export type CarouselHandle = { scrollTo: (index: number) => void };

/**
 * The week's cards side by side, each 88 % of the width so its neighbours
 * peek: a free scroll with momentum (a fling passes several) that settles with
 * a snap on a card. `onCenter` follows the card nearest the middle while
 * scrolling, `onSettle` the one it comes to rest on. The row's height follows
 * the cards: it blends the two cards in view by how far between them it is,
 * so what is below moves smoothly and nothing jumps.
 */
export function DayCarousel({ count, initial, onCenter, onSettle, renderCard, ref }: { count: number; initial: number; onCenter: (index: number) => void; onSettle: (index: number) => void; renderCard: (index: number) => ReactNode; ref?: Ref<CarouselHandle> }) {
  const { space } = useTheme();
  const { width } = useWindowDimensions();
  const card = Math.round(width * 0.88);
  const gap = space.sm;
  const interval = card + gap;
  const list = useAnimatedRef<Animated.ScrollView>();
  // Fabric re-applies a changed contentOffset, so the start is fixed at mount (the parent remounts for a new start).
  const [start] = useState(() => ({ x: initial * interval, y: 0 }));
  const x = useSharedValue(initial * interval);
  const centered = useSharedValue(initial);
  const heights = useSharedValue<number[]>([]);
  const measured = useRef<number[]>([]);
  // The worklet calls back through stable functions, whatever the parent passes on each render.
  const latest = useRef({ onCenter, onSettle });
  latest.current = { onCenter, onSettle };
  const [center] = useState(() => (i: number) => latest.current.onCenter(i));
  const [settle] = useState(() => (i: number) => latest.current.onSettle(i));

  useImperativeHandle(ref, () => ({ scrollTo: (index) => list.current?.scrollTo({ x: index * interval, animated: true }) }), [list, interval]);

  const handler = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.value = e.contentOffset.x;
      const i = Math.min(count - 1, Math.max(0, Math.round(e.contentOffset.x / interval)));
      if (i !== centered.value) {
        centered.value = i;
        scheduleOnRN(center, i);
      }
    },
    // A release right on a card has no momentum to end.
    onEndDrag: (e) => {
      const i = Math.round(e.contentOffset.x / interval);
      if (Math.abs(e.contentOffset.x - i * interval) < 1) scheduleOnRN(settle, i);
    },
    onMomentumEnd: (e) => {
      scheduleOnRN(settle, Math.round(e.contentOffset.x / interval));
    },
  });

  const rowHeight = useAnimatedStyle(() => {
    const p = Math.min(count - 1, Math.max(0, x.value / interval));
    const i = Math.floor(p);
    const a = heights.value[i];
    const b = heights.value[Math.min(count - 1, i + 1)];
    return { height: a && b ? a + (b - a) * (p - i) : undefined };
  });

  const measure = (i: number, h: number) => {
    if (measured.current[i] === h) return;
    measured.current[i] = h;
    heights.value = [...measured.current];
  };

  return (
    <Animated.View style={[{ overflow: "hidden" }, rowHeight]}>
      <Animated.ScrollView
        ref={list}
        horizontal
        onScroll={handler}
        scrollEventThrottle={16}
        snapToInterval={interval}
        decelerationRate="fast"
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={start}
        contentContainerStyle={{ paddingHorizontal: (width - card) / 2, gap, alignItems: "flex-start" }}
        testID="day-carousel"
      >
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={{ width: card }} onLayout={(e) => measure(i, e.nativeEvent.layout.height)}>
            {renderCard(i)}
          </View>
        ))}
      </Animated.ScrollView>
    </Animated.View>
  );
}
