import { Trash2 } from "lucide-react";
import { listInvitations } from "@life/auth";
import { getSettings } from "@life/db/pulso";
import { ActionButton } from "@/components/client";
import { Chip, Panel, TopLine } from "@/components/ui";
import { requireMember } from "@/lib/supabase/server";
import { revoke } from "./actions";
import { InviteForm, SettingsForm } from "./forms";
import { Passkeys } from "./passkeys";
import { SignOutButton } from "./sign-out";

export const metadata = { title: "Ajustes" };

export default async function Ajustes() {
  const { client, user, member } = await requireMember();
  const settings = await getSettings(client);
  const invitations = member.role === "owner" ? await listInvitations(client) : [];
  return (
    <>
      <TopLine title="Ajustes">
        <span className="tiny">{user.email}</span>
      </TopLine>
      <div className="cols-2">
        <Panel title="Tú">
          <SettingsForm s={settings} />
        </Panel>
        <div className="grid">
          <Panel title="Passkeys">
            <Passkeys />
          </Panel>
          {member.role === "owner" ? (
            <Panel title="Invitaciones">
              <p className="muted small" style={{ marginBottom: 10 }}>
                Solo los correos invitados pueden crear cuenta. Cada quien ve únicamente sus datos.
              </p>
              <InviteForm />
              {invitations.length ? (
                <div className="rows" style={{ marginTop: 12 }}>
                  {invitations.map((i) => (
                    <div key={i.id} className="list-row" style={{ paddingInline: 0 }}>
                      <div className="grow">
                        <div className="truncate">{i.email}</div>
                        {i.note ? <div className="sub">{i.note}</div> : null}
                      </div>
                      {i.accepted_at ? <Chip tone="green">Aceptada</Chip> : (
                        <>
                          <Chip>Pendiente</Chip>
                          <ActionButton action={revoke} fields={{ id: i.id }} className="btn ghost sm icon-only" confirm="¿Retirar la invitación?" title="Retirar">
                            <Trash2 size={14} />
                          </ActionButton>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}
          <Panel title="Sesión">
            <SignOutButton />
          </Panel>
        </div>
      </div>
    </>
  );
}
