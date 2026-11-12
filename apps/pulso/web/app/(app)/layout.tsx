import Link from "next/link";
import { Settings } from "lucide-react";
import { Nav } from "@/components/client";
import { requireMember } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            PULSO
          </Link>
          <Nav />
          <div className="topbar-end">
            <Link href="/ajustes" className="btn ghost sm icon-only" aria-label="Ajustes" title="Ajustes">
              <Settings size={16} />
            </Link>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
