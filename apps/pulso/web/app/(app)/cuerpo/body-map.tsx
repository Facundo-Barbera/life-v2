"use client";
import { useState } from "react";
import type { BodyAnalysis, BodyBand, SegmentKey, SegmentValue } from "@life/db/pulso";

/** A neutral front-view figure, 200 × 410, split the way InBody measures it; the person's right is drawn on the left. */
const ARM = "M58 82C46 84 42 96 41 112L36 172L30 232C29 244 42 246 43 234L50 174L58 124Z";
const LEG = "M67 242L98 242L96 300L92 360L90 396C90 406 74 406 74 396L72 360L66 300Z";
const mirror = "translate(200 0) scale(-1 1)";
const FIGURE: Record<SegmentKey, { d: string; transform?: string }> = {
  rightArm: { d: ARM },
  leftArm: { d: ARM, transform: mirror },
  trunk: { d: "M64 86C64 76 76 72 100 72C124 72 136 76 136 86L132 160C130 185 128 200 132 222L134 236L66 236L68 222C72 200 70 185 68 160Z" },
  rightLeg: { d: LEG },
  leftLeg: { d: LEG, transform: mirror },
};
const NAMES: Record<SegmentKey, string> = { rightArm: "Brazo der.", leftArm: "Brazo izq.", trunk: "Tronco", rightLeg: "Pierna der.", leftLeg: "Pierna izq." };
const BAND: Record<BodyBand, string> = { low: "Bajo", normal: "Normal", high: "Alto" };
const STRENGTH: Record<BodyBand, number> = { low: 30, normal: 62, high: 95 };
type Mode = "lean" | "fat";
const COLOR: Record<Mode, string> = { lean: "var(--life-green)", fat: "var(--life-amber)" };
const fill = (mode: Mode, band: BodyBand | null) => `color-mix(in oklab, ${COLOR[mode]} ${band ? STRENGTH[band] : 45}%, var(--life-inner))`;
const kg = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 2 });

/** The segmental analysis as a body: each segment tinted by its lean (or fat) mass against the standard. */
export function BodyMap({ segments }: { segments: NonNullable<BodyAnalysis["segments"]> }) {
  const [mode, setMode] = useState<Mode>(segments.lean ? "lean" : "fat");
  const values = segments[mode]!;
  const other = segments[mode === "lean" ? "fat" : "lean"];
  const label = (key: SegmentKey, align: "left" | "right" | "center") => (
    <Label name={NAMES[key]} v={values[key]} other={other?.[key]} otherLabel={mode === "lean" ? "grasa" : "magra"} mode={mode} align={align} />
  );
  return (
    <div className="stack">
      {segments.lean && segments.fat ? (
        <div className="seg" role="group" aria-label="Qué masa">
          <button type="button" aria-pressed={mode === "lean"} onClick={() => setMode("lean")}>Magra</button>
          <button type="button" aria-pressed={mode === "fat"} onClick={() => setMode("fat")}>Grasa</button>
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gridTemplateRows: "11fr 9fr", alignItems: "center", columnGap: 10 }}>
        <div style={{ gridRow: 1 }}>{label("rightArm", "right")}</div>
        <div style={{ gridRow: 2 }}>{label("rightLeg", "right")}</div>
        <figure style={{ gridColumn: 2, gridRow: "1 / span 2", width: 112, display: "grid", gap: 8, justifyItems: "center" }}>
          <svg viewBox="0 0 200 410" style={{ width: "100%", height: "auto" }} role="img" aria-label={(Object.keys(NAMES) as SegmentKey[]).map((k) => `${NAMES[k]}: ${BAND[values[k].band ?? "normal"]}`).join(", ")}>
            <circle cx="100" cy="38" r="24" fill="var(--life-inner)" />
            <rect x="91" y="58" width="18" height="18" rx="6" fill="var(--life-inner)" />
            {(Object.keys(FIGURE) as SegmentKey[]).map((key) => (
              <path key={key} d={FIGURE[key].d} transform={FIGURE[key].transform} fill={fill(mode, values[key].band)} stroke="var(--life-card)" strokeWidth="2" strokeLinejoin="round" />
            ))}
          </svg>
          {label("trunk", "center")}
        </figure>
        <div style={{ gridColumn: 3, gridRow: 1 }}>{label("leftArm", "left")}</div>
        <div style={{ gridColumn: 3, gridRow: 2 }}>{label("leftLeg", "left")}</div>
      </div>
      <div className="row tiny muted" style={{ justifyContent: "center", gap: 12 }}>
        {(["low", "normal", "high"] as const).map((b) => (
          <span key={b} className="row" style={{ gap: 5 }}>
            <span style={{ width: 16, height: 8, borderRadius: 4, background: fill(mode, b) }} />
            {BAND[b]}
          </span>
        ))}
      </div>
      {segments.balance.length ? (
        <div className="row wrap" style={{ gap: 6 }}>
          {segments.balance.map((b) => <span key={b.text} className={`chip ${b.even ? "green" : "amber"}`}>{b.text}</span>)}
        </div>
      ) : null}
      <p className="tiny muted">
        {segments.basis === "height" ? "% del estándar para tu estatura." : "% respecto a tu propio peso: agrega tu estatura en Ajustes para compararlo con el estándar."}
      </p>
    </div>
  );
}

function Label({ name, v, other, otherLabel, mode, align }: { name: string; v: SegmentValue; other?: SegmentValue; otherLabel: string; mode: Mode; align: "left" | "right" | "center" }) {
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <div className="label truncate">{name}</div>
      <div className="num sm">{kg(v.kg)}<span className="unit">kg</span></div>
      {v.percent != null && v.band ? (
        <div className="tiny" style={{ display: "flex", gap: 5, alignItems: "center", justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: fill(mode, v.band) }} />
          {BAND[v.band]} <span className="muted">{v.percent} %</span>
        </div>
      ) : null}
      {other ? <div className="tiny muted">{kg(other.kg)} kg {otherLabel}</div> : null}
    </div>
  );
}
