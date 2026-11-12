"use client";
import { KeyRound, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { registerPasskey, sendEmailCode, signInWithPasskey, verifyEmailCode } from "@life/auth";
import { browserClient } from "@/lib/supabase/browser";

type Step = "start" | "email" | "code" | "passkey";

/**
 * Passkey first. The first time (or on a new device without the passkey), an
 * invited e-mail gets a one-time code; then we offer to save a passkey here.
 */
export function SignIn({ next, signedInEmail }: { next: string; signedInEmail: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(signedInEmail ? "passkey" : "start");
  const [email, setEmail] = useState(signedInEmail ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="auth-card">
      <span className="brand">LIFE</span>
      <h1>Pulso</h1>

      {step === "start" ? (
        <>
          <p className="muted">Entra con tu passkey. Si es la primera vez, te mandamos un código al correo de tu invitación.</p>
          <button className="btn accent lg block" disabled={busy || !supported} onClick={() => run(async () => { await signInWithPasskey(browserClient()); done(); })}>
            <KeyRound size={18} /> {busy ? "Esperando…" : "Entrar con passkey"}
          </button>
          {!supported ? <p className="small amber">Este navegador no admite passkeys. Usa el código por correo.</p> : null}
          <button className="btn lg block" onClick={() => { setError(null); setStep("email"); }}>
            <Mail size={18} /> Primera vez o sin passkey aquí
          </button>
        </>
      ) : null}

      {step === "email" ? (
        <form className="form" onSubmit={(e) => { e.preventDefault(); void run(async () => { await sendEmailCode(browserClient(), email, `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/entrar?paso=passkey")}`); setStep("code"); }); }}>
          <label className="field">
            <span>Correo de tu invitación</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <button className="btn accent lg block" disabled={busy}>{busy ? "Enviando…" : "Mandarme un código"}</button>
          <button type="button" className="btn ghost block" onClick={() => setStep("start")}>Volver</button>
        </form>
      ) : null}

      {step === "code" ? (
        <form className="form" onSubmit={(e) => { e.preventDefault(); void run(async () => { await verifyEmailCode(browserClient(), email, code); setStep("passkey"); }); }}>
          <p className="muted small">Te mandamos un código a <span className="strong">{email}</span>. También puedes abrir el enlace del correo.</p>
          <label className="field">
            <span>Código</span>
            <input className="input num-input" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </label>
          <button className="btn accent lg block" disabled={busy}>{busy ? "Verificando…" : "Entrar"}</button>
          <button type="button" className="btn ghost block" onClick={() => setStep("email")}>Usar otro correo</button>
        </form>
      ) : null}

      {step === "passkey" ? (
        <>
          <p className="muted">Ya entraste{signedInEmail ? ` como ${signedInEmail}` : ""}. Guarda una passkey en este dispositivo para entrar sin código la próxima vez.</p>
          <button className="btn accent lg block" disabled={busy || !supported} onClick={() => run(async () => { await registerPasskey(browserClient()); done(); })}>
            <KeyRound size={18} /> {busy ? "Esperando…" : "Crear passkey"}
          </button>
          <button className="btn ghost block" onClick={done}>Ahora no</button>
        </>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
