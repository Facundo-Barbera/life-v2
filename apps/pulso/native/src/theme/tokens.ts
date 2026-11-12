// Design tokens: «Tablero» (docs/mockups/pulso-direcciones.html, direction 2).
// An athletic instrument panel: graphite blacks, one electric lime, dense
// gauges with ticks, 64 pt thumb targets, rounded figures and mono labels.
// Faces are Apple's system ones (life/CLAUDE.md): text in SF Pro, numbers in
// SF Pro Rounded with tabular figures, labels in SF Mono. No webfonts.
//
// Light mode: lime is only ever a FILL (buttons, the gauge's core stroke,
// pills); lime as text or a thin line turns into `accentText`, a darkened olive.

export type ColorTokens = {
  /** Screen background: graphite (dark) / cool grey (light). */
  background: string;
  /** A panel. */
  surface: string;
  /** Inside a panel: stepper wells, secondary buttons, icon tiles. */
  surfaceRaised: string;
  /** Hairlines: panel borders, row dividers, empty gauge track. */
  separator: string;
  text: string;
  /** Mono labels, units, secondary lines. */
  textSecondary: string;
  textTertiary: string;
  /** Lime: fills only (buttons, active pill, gauge, badges). */
  accent: string;
  /** Lime as text, icon or a thin line: lime in dark, olive in light. */
  accentText: string;
  /** Text on a lime fill. */
  onAccent: string;
  positive: string;
  warning: string;
  negative: string;
  /** Heart rate, the live HR chip, "despierto". */
  heart: string;
  /** Heart-rate zones 1–5 (z2 blue, z3 lime, z4 amber). */
  z1: string;
  z2: string;
  z3: string;
  z4: string;
  z5: string;
  /** Sleep stages. */
  sleepDeep: string;
  sleepRem: string;
  sleepCore: string;
  sleepAwake: string;
  /** The floating rail: dark in both modes. */
  rail: string;
  railBorder: string;
  railInk: string;
  /** Behind sheets and the quick-log fan. */
  scrim: string;
  /** Macros and water (Dieta): kcal is the accent, carbs zone-2 blue, fat zone-4 amber. */
  protein: string;
  carbs: string;
  fat: string;
  water: string;
  /** Per-tab hues (Pulso's sections), for charts and badges. */
  training: string;
  energy: string;
  body: string;
  sleep: string;
};

const LIME = "#C6FF2E";
const GRAPHITE = "#0A0C0D";

export const colors: { light: ColorTokens; dark: ColorTokens } = {
  dark: {
    background: GRAPHITE,
    surface: "#131719",
    surfaceRaised: "#1A1F22",
    separator: "#242B2F",
    text: "#E9EEF0",
    textSecondary: "#7D898F",
    textTertiary: "#4E595E",
    accent: LIME,
    accentText: LIME,
    onAccent: GRAPHITE,
    positive: LIME,
    warning: "#FFB020",
    negative: "#FF4D4D",
    heart: "#FF7A45",
    z1: "#5B6B73",
    z2: "#3FB6FF",
    z3: LIME,
    z4: "#FFB020",
    z5: "#FF4D4D",
    sleepDeep: "#3FB6FF",
    sleepRem: "#8A7CFF",
    sleepCore: "#4A575D",
    sleepAwake: "#FF7A45",
    rail: "#15191B",
    railBorder: "#262E32",
    railInk: "#7D898F",
    scrim: "rgba(0,0,0,0.6)",
    protein: "#FF6B8A",
    carbs: "#3FB6FF",
    fat: "#FFB020",
    water: "#3FB6FF",
    training: LIME,
    energy: "#FFB020",
    body: "#3FB6FF",
    sleep: "#8A7CFF",
  },
  light: {
    background: "#E4E8EA",
    surface: "#FFFFFF",
    surfaceRaised: "#F2F5F6",
    separator: "#D3DADE",
    text: "#0D1214",
    textSecondary: "#5E6A70",
    textTertiary: "#9AA6AC",
    accent: LIME,
    accentText: "#6E9800",
    onAccent: GRAPHITE,
    positive: "#6E9800",
    warning: "#C77D00",
    negative: "#D92D2D",
    heart: "#E0551F",
    z1: "#9AA6AC",
    z2: "#1E9BE6",
    z3: "#6E9800",
    z4: "#E09400",
    z5: "#E03A3A",
    sleepDeep: "#3FB6FF",
    sleepRem: "#8A7CFF",
    sleepCore: "#B8C2C7",
    sleepAwake: "#FF7A45",
    rail: "#0D1214",
    railBorder: "#0D1214",
    railInk: "#7D898F",
    scrim: "rgba(13,18,20,0.35)",
    protein: "#E0456A",
    carbs: "#1E9BE6",
    fat: "#E09400",
    water: "#1E9BE6",
    training: "#6E9800",
    energy: "#E09400",
    body: "#1E9BE6",
    sleep: "#6F5FE8",
  },
};

/** 4-pt grid. Panels sit 8 apart, screens have 14 of side margin (the mock's). */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, gutter: 14 } as const;

/** Tablero is squarer than iOS: instruments, not pebbles. */
export const radius = { xs: 5, sm: 9, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** One device pixel would vanish on lime; panels use a full point. */
export const hairline = 1;

/** Thumb targets: steppers and the big buttons are 64 pt, secondary buttons 48. */
export const target = { min: 44, button: 48, stepper: 64, big: 72, done: 80 } as const;

/**
 * Font families. On iOS, React Native maps `System` to SF Pro (Text/Display by
 * size), `ui-rounded` to SF Pro Rounded and `ui-monospace` to SF Mono.
 */
export const fonts = {
  text: "System",
  rounded: "ui-rounded",
  mono: "ui-monospace",
} as const;

type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700" | "800";
  letterSpacing: number;
  fontVariant?: "tabular-nums"[];
  textTransform?: "uppercase";
};

const tab = ["tabular-nums"] as "tabular-nums"[];

/** The type scale: hierarchy from size, weight and tracking (tight on large figures), not from extra faces. */
export const type = {
  // SF Pro: words.
  largeTitle: { fontFamily: fonts.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1.2 },
  title: { fontFamily: fonts.text, fontSize: 26, lineHeight: 31, fontWeight: "700", letterSpacing: -0.8 },
  headline: { fontFamily: fonts.text, fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing: -0.2 },
  body: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21, fontWeight: "500", letterSpacing: -0.1 },
  callout: { fontFamily: fonts.text, fontSize: 16, lineHeight: 21, fontWeight: "400", letterSpacing: -0.3 },
  /** List row titles. */
  rowTitle: { fontFamily: fonts.text, fontSize: 15, lineHeight: 18, fontWeight: "600", letterSpacing: -0.1 },
  subhead: { fontFamily: fonts.text, fontSize: 14, lineHeight: 19, fontWeight: "500", letterSpacing: -0.1 },
  footnote: { fontFamily: fonts.text, fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: -0.05 },
  caption: { fontFamily: fonts.text, fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0 },
  /** «HECHO» on the big bar. */
  shout: { fontFamily: fonts.text, fontSize: 28, lineHeight: 30, fontWeight: "800", letterSpacing: -0.6 },

  // SF Pro Rounded, tabular: figures.
  /** A clock or the session timer (92 in the mock). */
  display: { fontFamily: fonts.rounded, fontSize: 92, lineHeight: 88, fontWeight: "700", letterSpacing: -4.6, fontVariant: tab },
  /** The figure inside a gauge. */
  gauge: { fontFamily: fonts.rounded, fontSize: 76, lineHeight: 78, fontWeight: "700", letterSpacing: -3.8, fontVariant: tab },
  hero: { fontFamily: fonts.rounded, fontSize: 46, lineHeight: 48, fontWeight: "700", letterSpacing: -1.4, fontVariant: tab },
  /** Stepper values, a cardio cell. */
  number: { fontFamily: fonts.rounded, fontSize: 32, lineHeight: 34, fontWeight: "700", letterSpacing: -1, fontVariant: tab },
  /** A stat cell's value. */
  stat: { fontFamily: fonts.rounded, fontSize: 26, lineHeight: 28, fontWeight: "700", letterSpacing: -0.8, fontVariant: tab },
  numberSmall: { fontFamily: fonts.rounded, fontSize: 17, lineHeight: 21, fontWeight: "700", letterSpacing: -0.2, fontVariant: tab },

  // SF Mono: labels, uppercase with tracking.
  /** Panel headers, the date line. */
  label: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 13, fontWeight: "600", letterSpacing: 0.66, textTransform: "uppercase" },
  /** Stat cell keys, units under a figure. */
  labelSmall: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 12, fontWeight: "600", letterSpacing: 0.7, textTransform: "uppercase" },
  /** Row subtitles: «6 EJ · 55 MIN». */
  meta: { fontFamily: fonts.mono, fontSize: 11.5, lineHeight: 14, fontWeight: "500", letterSpacing: 0.2, textTransform: "uppercase" },
  /** Button and rail labels. */
  button: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 15, fontWeight: "700", letterSpacing: 0.65, textTransform: "uppercase" },
  /** A delta under a stat, «▲ 6». */
  delta: { fontFamily: fonts.mono, fontSize: 10.5, lineHeight: 12, fontWeight: "700", letterSpacing: 0, fontVariant: tab },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: 0 },
} as const satisfies Record<string, TypeStyle>;

export type TypeName = keyof typeof type;

/**
 * Motion. Springs for Reanimated's `withSpring` (gauges sweep 0 → value with a
 * short bounce; the rail's pill springs between tabs), durations in ms.
 */
export const motion = {
  /** Gauges and rings sweeping to their value on mount. */
  sweep: { damping: 16, stiffness: 70, mass: 1 },
  /** The rail's lime pill and the segmented control's thumb. */
  pill: { damping: 20, stiffness: 260, mass: 0.9 },
  /** Press feedback (scale 0.97). */
  press: { damping: 22, stiffness: 420, mass: 0.6 },
  /** Sheets and the quick-log fan. */
  sheet: { damping: 24, stiffness: 240, mass: 1 },
  /** How far a pressed control shrinks. */
  pressScale: 0.97,
  fast: 140,
  base: 220,
  slow: 420,
  /** Long-press repeat on a stepper: first delay, then the interval (it speeds up to `repeatMin`). */
  repeatDelay: 380,
  repeatEvery: 110,
  repeatMin: 45,
  /** How long a toast stays (with «Deshacer»). */
  toast: 4500,
} as const;

/** Heart-rate zone colour by zone number 1–5. */
export const zoneColor = (c: ColorTokens, zone: number): string => [c.z1, c.z2, c.z3, c.z4, c.z5][Math.min(Math.max(zone, 1), 5) - 1]!;
