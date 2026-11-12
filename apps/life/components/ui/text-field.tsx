import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

/** Text input. `variant="title"` is the large borderless one used for event names. */
export const TextField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { icon?: ReactNode; variant?: "boxed" | "title" | "plain" }
>(function TextField({ icon, variant = "boxed", className = "", ...rest }, ref) {
  return (
    <label className={`ui-field ui-field-${variant} ${className}`}>
      {icon && <span className="ui-field-icon">{icon}</span>}
      <input ref={ref} {...rest} />
    </label>
  );
});
