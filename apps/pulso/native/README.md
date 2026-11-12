# Pulso (iPhone, Expo)

La app de Pulso para iPhone, portada de `apps/pulso` del repo `life` **sin el Coach** y sobre
**Supabase** en vez del engine de la Mac. Misma cuenta, misma base y mismas reglas (RLS) que
`pulso.bixku.online`. El Watch, los widgets y la Live Activity siguen en Swift.

Expo SDK 58, React Native 0.88 (New Architecture), Expo Router, TanStack Query,
`@kingstinct/react-native-healthkit`, `@bacons/apple-targets`. Bundle ids sin cambios:
`com.facundo.pulso.dev` («Pulso Dev») y, con `PULSO_VARIANT=release`, `com.facundo.pulso`, para
conservar el registro de TestFlight, los permisos de Salud, el App Group y el grupo de Keychain.

## Correr

```sh
bun install                                  # desde la raíz del monorepo (nunca npm)
cp apps/pulso/native/.env.example apps/pulso/native/.env.local
# llena EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (la anon key; nunca la service role)
cd apps/pulso/native
bunx expo prebuild -p ios                    # genera ios/ (CNG, no se commitea) + pod install
bunx expo run:ios --device                   # o abre ios/Pulso.xcworkspace en Xcode
bunx expo start --dev-client                 # Metro para Fast Refresh; ciérralo al terminar
```

Un build nativo hace falta sólo al cambiar dependencias nativas, `app.config.ts`, el Swift de
`modules/` o de `swift/`. Lo demás es Fast Refresh. Release: `PULSO_VARIANT=release bunx expo
prebuild -p ios --clean` y archivar `ios/Pulso.xcworkspace` (no hay EAS).

Revisiones: `bun run typecheck` y `bun run test` (desde la raíz, o `bunx tsc --noEmit` y `bun test`
aquí; las pruebas cubren los módulos puros: modelo de medicación, sustancias, dieta, sesión en vivo,
códec del Watch, sincronización con Salud, widgets).

## Cuenta

`src/data/session.tsx`. El cliente de Supabase viene de `@life/db` (`createLifeClient`) con la
sesión en el Keychain (`expo-secure-store`, en trozos de < 2 KB). Entrar (`src/app/entrar.tsx`):
correo de la invitación → código de un solo uso (`@life/auth` `sendEmailCode` / `verifyEmailCode`).
El registro es sólo por invitación (el hook `life.before_user_created` de la base rechaza correos sin
invitación); una cuenta sin fila en `life.members` ve «Sin invitación». Sustancias pide Face ID cada
vez (`src/sustancias/access.ts`).

**Passkey en el teléfono: pendiente.** Supabase ya tiene el flujo en dos pasos
(`auth.passkey.startAuthentication` / `verifyAuthentication`), pero hace falta un módulo nativo de
passkeys compatible con RN 0.88 y el dominio asociado `webcredentials:pulso.bixku.online` (más el
`apple-app-site-association` en la web). Mientras tanto: código por correo + Face ID para Sustancias.

## Datos

Las pantallas no cambiaron de forma: siguen pidiendo operaciones por nombre
(`useOperation("get_nutrition_day", …)`, `useAction().run("record_dose", …)`), tipadas por el
contrato de Salud que se vendorizó en `src/contract` (los esquemas zod del viejo `@life/client`).
Cada operación ahora es una función contra Supabase en `src/data/ops/*` (`PulsoApi` en
`src/data/api.ts`); RLS limita cada fila a su dueño. Donde la web ya tiene la lógica se usa
`@life/db/pulso` (presupuesto que decide la meta, lista de compras, sesiones fechadas del bloque,
progresión de cargas); la lógica pura que sólo usaba el teléfono vive en `src/data/logic`
(horarios de medicación, preparación, sueño, InBody, porciones, resumen de sustancias).

No hay feed de cambios: cada escritura refresca las consultas de Pulso y volver al frente las vuelve
a pedir (`staleTime` 30 s).

| Pantalla | Tablas |
|---|---|
| Hoy | `daily_metrics` (+ noches manuales en `sleeps`), `workouts`, `live_sessions`, `medications`/`medication_doses` |
| Dieta | `meals` (un platillo = filas con el mismo `dish_id`), `waters`, `saved_dishes`, objetivos en `settings` (o el presupuesto de la meta), plan fechado `plan_slots` (lo edita la web) |
| Compras / receta | `shopping_items`, `shopping_lists`, `recipes` |
| Cuerpo | `weigh_ins` (sólo peso; mañana/noche), `body_scans` (InBody, `metrics` y `segmental`), `body_goals`, `body_samples` |
| Entreno / sesión | `programs`, `program_days`, `workouts` (sesiones fechadas y hechas), `workout_sets`, `exercises` + `exercise_library`, `live_sessions` |
| Medicación | `medications`, `medication_doses` (una toma tomada llega a `life.hechos`) |
| Sustancias | `substances` (Cannabis y Alcohol se crean por persona), `substance_entries` |

En Dieta, «media mañana» y «merienda» se guardan como `snack` (la base y la web tienen cuatro
comidas). La migración `supabase/migrations/20261112200400_native.sql` añade lo que el teléfono
necesita: `meals.saved_dish_id`, `settings.nutrition_zones` / `water_unit` / `training_prefs`,
`shopping_items.pantry` («Ya tengo») e índices únicos completos para los upserts de Salud.

### Apple Health → Supabase

`src/health/sync` (anclas de `HKAnchoredObjectQuery` en el Keychain, por usuario):

| Salud | Operación | Tabla |
|---|---|---|
| Señales diarias (pasos, energía, ejercicio, FC en reposo, VFC, sueño por fases, VO2max, respiración) | `sync_daily_metrics` | `daily_metrics` (upsert por `user_id,date`; un valor ausente conserva el guardado) |
| Sueño (60 noches) | `sync_sleep` | `sleeps`, `source = healthkit`, una fila por noche (`night`), `asleep_min`, `stages`, `segments` → `life.hechos` |
| Entrenamientos (30 días) | `sync_workouts` | `health_workouts` (upsert por `external_id`; si el `externalRef` es una sesión de Pulso se enlaza) → `life.hechos` si no es de Pulso |
| Peso | `sync_body_samples` | `weigh_ins`, `source = healthkit`, `time_of_day` por la hora local → `life.hechos` |
| % de grasa | `sync_body_samples` | `body_samples` (`percent_body_fat`) |

## Nativo (Swift)

`swift/` es la única copia del Swift reutilizado de `apps/pulso-ios` (vendorizado, sin
reescribirlo a JS); `targets/*` y `modules/pulso-watch/ios/*` son enlaces simbólicos relativos a él,
dentro de este repo:

| Pieza | Dónde |
|---|---|
| App del Watch + complicación | `targets/watch`, `targets/watch-widgets` → `swift/PulsoWatch`, `swift/WatchShared`, `swift/Pulso/Features/Training`, `swift/PulsoWatchWidgets` |
| Live Activity | `targets/activity` → `swift/PulsoActivity`, `TrainingActivityAttributes.swift` |
| Widgets + Control Center | `targets/widgets` → `swift/PulsoWidgets`, `swift/Shared`, `swift/Pulso/Design/Theme.swift` |
| Puente Teléfono ↔ Watch, Live Activity, entreno del iPhone | `modules/pulso-watch/ios` (`PulsoWatchModule.swift` propio + enlaces a `swift/`) |

Cambios al Swift: los widgets ya no llaman a la Mac (`swift/Shared/WidgetEngine.swift`): dibujan
el snapshot del App Group que escribe la app tras cada sincronización; «Tomé mi medicación» desde un
widget o Siri pide abrir Pulso. `modules/pulso-watch/fixtures/generate.sh` regenera los fixtures del
códec desde `swift/`. `@bacons/apple-targets@5.0.0` lleva el parche de la raíz (`patches/`).

## Quitado

El Coach completo (chat, resúmenes de Hoy, Coach en vivo durante la sesión, ajustes y propuestas de
bloque, foto/escaneo hacia el Coach), el emparejamiento con la Mac (`emparejar`, tokens, feed de
eventos) y la lectura del Calendario de Apple.

## Pendiente

- Passkey nativa (arriba).
- Operaciones del plan de dieta desde el teléfono (saltar, mover, reequilibrar, deshacer cambios) y
  la revisión semanal: el teléfono muestra el plan y «Me lo comí»; lo demás, en la web.
- «Empezar la semana ya» y bloques siguientes; los ejercicios sin fotos/animaciones de ExerciseDB.
- Borrados en Salud que deberían llegar a Supabase; entrega en segundo plano de HealthKit; agua a Salud.
- Probar en dispositivo: este port typecheckea y pasa las pruebas, pero no se compiló con
  `expo prebuild` / Xcode en esta sesión.
- TestFlight con este proyecto (antes salía `apps/pulso-ios`).
