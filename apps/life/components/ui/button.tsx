import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: ReactNode }) {
  return (
    <button type="button" className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${className}`} {...rest}>
      {children}
    </button>
  );
}
