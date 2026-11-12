import { fmtDay, localDate } from "@life/db/pulso";
import { getSettings } from "@life/db/pulso";
import { Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";

export default async function Hoy() {
  const { client } = await requireMember();
  const s = await getSettings(client);
  return (
    <>
      <TopLine title={fmtDay(localDate(new Date(), s.timezone))} back={null} />
      <Panel title="Hoy">
        <p className="muted">Armando Hoy…</p>
      </Panel>
    </>
  );
}
