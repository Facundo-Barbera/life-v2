"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "@life/auth";
import { browserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn"
      onClick={async () => {
        await signOut(browserClient());
        router.replace("/entrar");
        router.refresh();
      }}
    >
      <LogOut size={15} /> Cerrar sesión
    </button>
  );
}
