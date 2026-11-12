import type { SFSymbol } from "expo-symbols";

/** Pulso's four tabs, in rail order: route name, rail label, SF Symbol. */
export const TABS: { name: string; title: string; symbol: SFSymbol }[] = [
  { name: "index", title: "Hoy", symbol: "sun.max" },
  { name: "entreno", title: "Entreno", symbol: "dumbbell" },
  { name: "dieta", title: "Dieta", symbol: "fork.knife" },
  { name: "cuerpo", title: "Cuerpo", symbol: "figure.stand" },
];
