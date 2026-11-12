export const metadata = { title: "Configurar" };

export default function Configurar() {
  return (
    <main className="auth">
      <div className="auth-card">
        <span className="brand">PULSO</span>
        <h1>Falta Supabase</h1>
        <p className="muted">
          Esta instalación no tiene <span className="mono">NEXT_PUBLIC_SUPABASE_URL</span> ni <span className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>. Agrégalas en
          Vercel (o en <span className="mono">apps/pulso/web/.env.local</span>) y vuelve a desplegar.
        </p>
      </div>
    </main>
  );
}
