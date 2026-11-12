"use client";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Result of a server action used with <ActionForm>. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string } | null;

/** Submit button that shows a pending state. */
export function Submit({ children, className = "btn accent", pendingLabel }: { children: ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? "Guardando…") : children}
    </button>
  );
}

/**
 * A form bound to a server action returning ActionResult; shows the error under
 * it and calls `onDone` on success (to close a sheet). Resets on success.
 */
export function ActionForm({ action, children, onDone, className = "form", resetOnSuccess = true }: {
  action: (prev: ActionResult, data: FormData) => Promise<ActionResult>;
  children: ReactNode;
  onDone?: () => void;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, run] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onDone?.();
    }
  }, [state, onDone, resetOnSuccess]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {state && !state.ok ? <p className="error">{state.error}</p> : null}
      {state?.ok && state.message ? <p className="small green">{state.message}</p> : null}
    </form>
  );
}

/** A button that opens a sheet (native <dialog>) with its children. `children` may be a function receiving close(). */
export function Sheet({ trigger, title, children, triggerClassName = "btn", defaultOpen = false }: {
  trigger: ReactNode;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  triggerClassName?: string;
  defaultOpen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        className="sheet"
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        {open ? (
          <>
            <div className="sheet-head">
              <span className="label">{title}</span>
              <button type="button" className="btn ghost sm icon-only" onClick={close} aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>
            <div className="sheet-body">{typeof children === "function" ? children(close) : children}</div>
          </>
        ) : null}
      </dialog>
    </>
  );
}

/** A small form posting one action with hidden fields; for one-tap buttons (marcar, borrar). */
export function ActionButton({ action, fields, children, className = "btn sm", confirm, title }: {
  action: (data: FormData) => Promise<void>;
  fields: Record<string, string | number | boolean | null | undefined>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  title?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      style={{ display: "inline-flex" }}
    >
      {Object.entries(fields).map(([k, v]) => (v == null ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
      <PendingButton className={className} title={title}>
        {children}
      </PendingButton>
    </form>
  );
}

function PendingButton({ children, className, title }: { children: ReactNode; className: string; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} title={title} aria-label={title}>
      {children}
    </button>
  );
}

export const DESTINATIONS = [
  { href: "/", label: "Hoy" },
  { href: "/dieta", label: "Dieta" },
  { href: "/entreno", label: "Entreno" },
  { href: "/cuerpo", label: "Cuerpo" },
  { href: "/sueno", label: "Sueño" },
  { href: "/medicacion", label: "Medicación" },
  { href: "/sustancias", label: "Sustancias" },
  { href: "/compras", label: "Compras" },
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Pulso">
      {DESTINATIONS.map((d) => {
        const active = d.href === "/" ? path === "/" : path === d.href || path.startsWith(`${d.href}/`);
        return (
          <Link key={d.href} href={d.href} aria-current={active ? "page" : undefined}>
            {d.label}
          </Link>
        );
      })}
    </nav>
  );
}
