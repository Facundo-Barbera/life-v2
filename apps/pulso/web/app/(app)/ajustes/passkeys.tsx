"use client";
import { KeyRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deletePasskey, listPasskeys, registerPasskey } from "@life/auth";
import { browserClient } from "@/lib/supabase/browser";

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** The passkeys on this account: add one for this device, remove old ones. */
export function Passkeys() {
  const [items, setItems] = useState<Passkey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listPasskeys(browserClient()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer tus passkeys.");
      setItems([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {items === null ? <p className="muted small">Cargando…</p> : items.length === 0 ? <p className="muted small">Aún no tienes passkeys. Crea una para entrar sin código.</p> : (
        <div className="rows">
          {items.map((p) => (
            <div key={p.id} className="list-row" style={{ paddingInline: 0 }}>
              <span className="icon"><KeyRound size={15} /></span>
              <div className="grow">
                <div className="truncate">{p.friendly_name || "Passkey"}</div>
                <div className="sub">Creada {when(p.created_at)} · último uso {when(p.last_used_at)}</div>
              </div>
              <button className="btn ghost sm icon-only" disabled={busy} aria-label="Borrar passkey" onClick={() => { if (window.confirm("¿Borrar esta passkey?")) void run(() => deletePasskey(browserClient(), p.id)); }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div>
        <button className="btn accent" disabled={busy} onClick={() => run(() => registerPasskey(browserClient()))}>
          <KeyRound size={15} /> Crear passkey en este dispositivo
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
