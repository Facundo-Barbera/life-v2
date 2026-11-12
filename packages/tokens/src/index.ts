export const tokens = {
  bg: "#0A0A0A",
  card: "#1C1C1C",
  inner: "#131313",
  border: "#2A2A2A",
  text: "#F0F0F0",
  muted: "#8B8B8B",
  dim: "#5C5C5C",
  green: "#38E0A8",
  greenBg: "#0C2C1F",
  amber: "#F8A840",
  amberBg: "#2C1A08",
  blue: "#48A8F8",
  blueBg: "#101838",
} as const;

export type Token = keyof typeof tokens;
