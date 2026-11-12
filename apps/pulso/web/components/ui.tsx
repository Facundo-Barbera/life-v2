// Server-safe building blocks of Tablero (no hooks). Client pieces live in
// components/client.tsx.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** The mono top line of a page: «‹ HOY · DIETA · JUE 12 NOV». Destinations get a back link to Hoy. */
export function TopLine({ title, back = "/", backLabel = "Hoy", children }: { title: string; back?: string | null; backLabel?: string; children?: ReactNode }) {
  return (
    <div className="topline">
      {back ? (
        <Link href={back} className="back">
          <ChevronLeft size={14} />
          {backLabel}
          <span className="dim"> ·</span>
        </Link>
      ) : null}
      <h1>{title}</h1>
      <span className="spacer" />
      {children}
    </div>
  );
}

export function Panel({ children, className, title, href, action, style, id }: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  href?: string;
  action?: ReactNode;
  style?: CSSProperties;
  id?: string;
}) {
  return (
    <section className={cx("panel", className)} style={style} id={id}>
      {title || action ? (
        <div className="panel-head">
          <span className="label">{title}</span>
          {action}
          {href ? <Link href={href}>Ver ›</Link> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("label", className)}>{children}</span>;
}

/** A big tabular figure with its unit. */
export function Num({ value, unit, size = "md", className }: { value: ReactNode; unit?: string; size?: "xl" | "lg" | "md" | "sm"; className?: string }) {
  return (
    <span className={cx("num", size, className)}>
      {value}
      {unit ? <span className="unit">{unit}</span> : null}
    </span>
  );
}

export function Stat({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: "green" | "amber" | "blue" | "red" }) {
  return (
    <div className="stat">
      <Label>{label}</Label>
      <Num value={value} unit={unit} size="sm" className={tone} />
      {hint ? <span className="tiny muted">{hint}</span> : null}
    </div>
  );
}

/** A horizontal meter; `mark` draws a tick (e.g. where you should be by now). */
export function Meter({ value, max, mark, color, tall }: { value: number; max: number; mark?: number | null; color?: string; tall?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  const markPct = mark != null && max > 0 ? Math.max(0, Math.min(1, mark / max)) * 100 : null;
  return (
    <div className={cx("meter", tall && "tall")} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)}>
      <i style={{ width: `${pct}%`, background: color }} />
      {markPct != null ? <b style={{ left: `calc(${markPct}% - 1px)` }} /> : null}
    </div>
  );
}

/** A ring gauge (SVG). `value` 0..1. */
export function Ring({ value, size = 96, stroke = 9, color = "var(--life-green)", children, label }: { value: number | null; size?: number; stroke?: number; color?: string; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} role="img" aria-label={label}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--life-inner)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>{children}</div>
    </div>
  );
}

/** A small line chart of a series (oldest first). */
export function Sparkline({ values, color = "var(--life-green)", height = 40, target }: { values: (number | null)[]; color?: string; height?: number; target?: number | null }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <div style={{ height }} />;
  const all = pts.map((p) => p[1]).concat(target != null ? [target] : []);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const w = 100;
  const x = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * w);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }}>
      {target != null ? <line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke="var(--life-dim)" strokeDasharray="2 2" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last[0])} cy={y(last[1])} r={2.5} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Vertical bars, one per value (null = gap). */
export function Bars({ values, max, color = "var(--life-green)", height = 56, labels, highlight }: { values: (number | null)[]; max?: number; color?: string; height?: number; labels?: string[]; highlight?: number }) {
  const top = max ?? Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${values.length}, 1fr)`, gap: 4, alignItems: "end" }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
          <div style={{ height, width: "100%", display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: `${v == null ? 0 : Math.max(3, (Math.min(v, top) / top) * 100)}%`, background: i === highlight ? color : `color-mix(in oklab, ${color} 55%, transparent)`, borderRadius: 4 }} />
          </div>
          {labels ? <span className="tiny dim mono">{labels[i]}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "green" | "amber" | "blue" | "red" }) {
  return <span className={cx("chip", tone)}>{children}</span>;
}

export function Empty({ title, line, children }: { title: string; line?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="strong">{title}</span>
      {line ? <p className="small">{line}</p> : null}
      {children}
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="rows">{children}</div>;
}

export function ListRow({ icon, title, sub, trailing, href }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; trailing?: ReactNode; href?: string }) {
  const body = (
    <>
      {icon ? <span className="icon">{icon}</span> : null}
      <div className="grow">
        <div className="truncate">{title}</div>
        {sub ? <div className="sub truncate">{sub}</div> : null}
      </div>
      {trailing}
    </>
  );
  return href ? (
    <Link href={href} className="list-row">
      {body}
    </Link>
  ) : (
    <div className="list-row">{body}</div>
  );
}

/** Formats a number for Spanish (Mexico): 1,234.5. */
export function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-MX", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
