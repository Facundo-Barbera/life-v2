import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { SignIn } from "./sign-in";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string; paso?: string }> }) {
  const { next, paso } = await searchParams;
  const client = await serverClient();
  if (!client) redirect("/configurar");
  const { data } = await client.auth.getUser();
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (data.user && paso !== "passkey") redirect(safeNext);
  return (
    <main className="auth">
      <SignIn next={safeNext} signedInEmail={data.user?.email ?? null} />
    </main>
  );
}
