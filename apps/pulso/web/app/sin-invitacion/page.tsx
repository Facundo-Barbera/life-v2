import { SignOutButton } from "@/app/(app)/ajustes/sign-out";

export const metadata = { title: "Sin invitación" };

export default function SinInvitacion() {
  return (
    <main className="auth">
      <div className="auth-card">
        <span className="brand">PULSO</span>
        <h1>Sin invitación</h1>
        <p className="muted">Tu cuenta existe, pero no tiene una invitación. Pídele a quien administra Pulso que te invite con este mismo correo.</p>
        <SignOutButton />
      </div>
    </main>
  );
}
