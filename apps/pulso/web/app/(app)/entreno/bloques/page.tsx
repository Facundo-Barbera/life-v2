import { ChevronRight } from "lucide-react";
import { listPrograms } from "@life/db/pulso";
import { Chip, Empty, ListRow, Panel, Rows, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { NewBlockSheet } from "../_components/forms";
import { shortDay } from "../_components/shared";

export const metadata = { title: "Bloques" };

export default async function Bloques() {
  const { client } = await requireMember();
  const programs = await listPrograms(client);
  return (
    <>
      <TopLine title="Entreno · Bloques" back="/entreno" backLabel="Entreno">
        <NewBlockSheet />
      </TopLine>
      <Panel className="tight">
        {programs.length === 0 ? (
          <div className="list-row">
            <Empty title="Sin bloques" />
          </div>
        ) : (
          <Rows>
            {programs.map((p) => (
              <ListRow
                key={p.id}
                href={`/entreno/bloque/${p.id}`}
                title={p.name}
                sub={[`Desde ${shortDay(p.starts_on)}`, `${p.weeks} semanas`, p.ended_at ? `terminó ${shortDay(p.ended_at.slice(0, 10))}` : null].filter(Boolean).join(" · ")}
                trailing={
                  <>
                    {p.active ? <Chip tone="green">Activo</Chip> : null}
                    <ChevronRight size={15} className="dim" />
                  </>
                }
              />
            ))}
          </Rows>
        )}
      </Panel>
    </>
  );
}
