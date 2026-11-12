# Life

Suite personal: Pulso, Agenda y Dinero. Un monorepo, una base, una autenticación.

- `apps/pulso/web` — Next.js. Pulso en la web (`pulso.bixku.online`), sin agente.
- `apps/pulso/native` — Expo. Pulso en el iPhone, con el Watch, widgets, Live Activities y HealthKit.
- `apps/life` — el calendario con el que empezamos; pasará a Agenda.
- `packages/auth` — sesión, passkeys, códigos por correo e invitaciones, compartido.
- `packages/db` — cliente de Supabase, tipos, y `@life/db/pulso`: los datos y cálculos de Pulso que usan la web y el teléfono.
- `packages/tokens` — color y tipo, no pantallas.
- `supabase/migrations` — el esquema de la base compartida.

Web y teléfono no comparten pantallas; solo `auth`, `db` y `tokens`.

## Base de datos

Las migraciones están en `supabase/migrations` y Supabase las aplica al empujar a GitHub. Todas son aditivas. Para un proyecto nuevo:

1. En [Supabase](https://supabase.com) crea el proyecto y corre las migraciones (`supabase link` + `supabase db push`, o la integración con GitHub).
2. **Settings → API**: añade `life` y `pulso` a los esquemas expuestos. Si no, el cliente no ve esas tablas.
3. **Authentication → Hooks → Before User Created**: elige la función de Postgres `life.before_user_created`. Sin ella, cualquiera con el enlace podría crear cuenta (no vería datos ajenos, pero tampoco entraría: la app pide fila en `life.members`).
4. **Authentication → Sign in / Providers**: deja activo Email (códigos de un solo uso) y activa **Passkeys**. Como *Relying Party ID* usa el dominio padre (`bixku.online`) para que la misma passkey sirva en Pulso y, después, en Agenda y Dinero; agrega `https://pulso.bixku.online` (y `http://localhost:3271` en desarrollo) como orígenes.
5. **Authentication → URL Configuration**: *Site URL* `https://pulso.bixku.online`; en *Redirect URLs* agrega `https://pulso.bixku.online/**`, las previews de Vercel que uses y `http://localhost:3271/**`.
6. **Authentication → Email Templates → Magic Link**: incluye el código (`{{ .Token }}`) y, si quieres el enlace, apúntalo a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/entrar?paso=passkey`.
7. Copia la URL y la **anon** key a `apps/pulso/web/.env.local` (hay un `.env.example` en la raíz) y a las variables de entorno del proyecto `pulso` en Vercel. La **service role** key no se usa en el cliente y no se guarda aquí.

Cada app es dueña de su esquema (`pulso`, más adelante `agenda` y `dinero`). Lo compartido vive en `life`: `life.hechos` (la línea de tiempo con hora que lee el calendario), `life.members` e `life.invitations`. Pulso escribe en `life.hechos` el sueño, el entreno, las comidas, los pesajes, las tomas de medicación, los entrenos de Apple Health y, solo si lo activas en Ajustes, las sustancias.

### Cuentas e invitaciones

- La primera cuenta de un proyecto vacío es la dueña (`life.members.role = 'owner'`).
- La dueña invita correos desde **Ajustes → Invitaciones**. Solo esos correos pueden crear cuenta; al entrar por primera vez reciben un código y luego guardan su passkey.
- RLS en todas las tablas: cada quien ve únicamente sus filas (`auth.uid() = user_id`). La biblioteca de ejercicios (`pulso.exercise_library`) es de referencia y la leen todos.

## Desarrollo

```sh
bun install
bun run dev:pulso    # Pulso web en :3271
bun run dev          # también el calendario, en :3270
bun run typecheck
bun run test
```

Hace falta Bun. No uses npm. La app del teléfono tiene sus pasos en `apps/pulso/native/README.md`.
