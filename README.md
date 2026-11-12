# Life

Suite personal: Pulso, Agenda y Dinero. Un monorepo, una base, una autenticación.

- `apps/pulso/web` — Next.js. Primera app que estamos terminando (sin agente).
- `apps/life` — el calendario con el que empezamos; pasará a Agenda.
- `packages/auth` — sesión y passkeys, compartido.
- `packages/db` — cliente de Supabase, tipos, hechos con hora.
- `packages/tokens` — color y tipo, no pantallas.
- `supabase/migrations` — el esquema de la base compartida.

## Base de datos

Las migraciones están en `supabase/migrations`. Para crear el proyecto:

1. En [Supabase](https://supabase.com) crea un proyecto nuevo, tuyo.
2. Corre las migraciones: con la CLI (`supabase link` y `supabase db push`) o pegando el SQL de `supabase/migrations` en el SQL Editor.
3. En **Settings → API**: añade `life` y `pulso` a los esquemas expuestos. Si no, el cliente no ve esas tablas.
4. En **Authentication**: habilita passkeys. El login usa [Supabase Auth](https://supabase.com/docs/guides/auth) (`auth.users`); no hay un segundo almacén de usuarios.
5. Copia la URL y la **anon** key a `apps/pulso/web/.env.local` (hay un `.env.example` en la raíz). Nada de eso va al repo. La **service role** key no se usa en el cliente y no se guarda aquí.

Cada app es dueña de su esquema (`pulso`, más adelante `agenda` y `dinero`). Lo único compartido es `life.hechos`: Pulso escribe ahí el sueño, el entreno, las comidas y los pesajes, para que el calendario pueda mostrarlos.

## Desarrollo

```sh
bun install
bun run dev:pulso    # Pulso en :3271
bun run dev          # también el calendario, en :3270
```

Hace falta Bun. No uses npm.
