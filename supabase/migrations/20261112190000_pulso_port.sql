-- Pulso port from the old `life` engine (SQLite) to the shared Postgres.
-- Additive only: new tables and new nullable/defaulted columns. Every table is
-- per user (RLS `user_id = auth.uid()`), except the exercise library, which is
-- shared reference data that any signed-in user may read.
-- Facts with a time reach `life.hechos` through `life.sync_hecho`.

-- ---------------------------------------------------------------------------
-- Invitations and members (shared by every app of the suite)
-- ---------------------------------------------------------------------------

create table life.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table life.members is
  'Who may use the suite. Rows are written by the new-user trigger, never by clients.';

create table life.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  invited_by uuid not null references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null
);

create unique index invitations_email_open_uidx
  on life.invitations (email) where accepted_at is null;

alter table life.members enable row level security;
alter table life.invitations enable row level security;

create policy members_select_self on life.members
  for select to authenticated
  using (user_id = auth.uid());

create or replace function life.is_owner()
returns boolean
language sql
stable
security definer
set search_path = life, pg_temp
as $$
  select exists (
    select 1 from life.members where user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function life.is_owner() from public, anon;
grant execute on function life.is_owner() to authenticated;

create policy invitations_select_own on life.invitations
  for select to authenticated
  using (invited_by = auth.uid());

create policy invitations_insert_owner on life.invitations
  for insert to authenticated
  with check (invited_by = auth.uid() and life.is_owner());

create policy invitations_delete_own on life.invitations
  for delete to authenticated
  using (invited_by = auth.uid() and accepted_at is null);

grant select on life.members to authenticated;
grant select, insert, delete on life.invitations to authenticated;
grant select, insert, update, delete on life.members, life.invitations to service_role;

-- Supabase Auth "Before User Created" hook. Enable it in the dashboard
-- (Authentication → Hooks → Before User Created → Postgres function
-- `life.before_user_created`). Only invited e-mails may sign up; the very first
-- account of an empty project is allowed so its owner can bootstrap.
create or replace function life.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = life, auth, pg_temp
as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if not exists (select 1 from auth.users) then
    return '{}'::jsonb;
  end if;
  if v_email <> '' and exists (
    select 1 from life.invitations where email = v_email and accepted_at is null
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Necesitas una invitación para crear tu cuenta.'
    )
  );
end;
$$;

revoke all on function life.before_user_created(jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant usage on schema life to supabase_auth_admin';
    execute 'grant execute on function life.before_user_created(jsonb) to supabase_auth_admin';
  end if;
end;
$$;

-- After a user is created: the first one is the owner; an invited one is a
-- member and the invitation is marked accepted. Anyone else gets no member row
-- (the apps show "sin invitación"), as a second line behind the hook.
create or replace function life.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
declare
  v_invite life.invitations%rowtype;
begin
  if not exists (select 1 from life.members) then
    insert into life.members (user_id, role) values (new.id, 'owner');
  else
    select * into v_invite
    from life.invitations
    where email = lower(coalesce(new.email, '')) and accepted_at is null
    order by created_at
    limit 1;
    if found then
      insert into life.members (user_id, role, invited_by)
      values (new.id, 'member', v_invite.invited_by);
      update life.invitations
        set accepted_at = now(), accepted_user_id = new.id
        where id = v_invite.id;
    end if;
  end if;
  insert into pulso.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke all on function life.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function life.handle_new_user();

-- ---------------------------------------------------------------------------
-- Settings: nutrition targets, water, sleep, units, body profile
-- ---------------------------------------------------------------------------

alter table pulso.settings
  add column if not exists kcal_target integer check (kcal_target is null or kcal_target > 0),
  add column if not exists protein_g_target numeric(6, 1) check (protein_g_target is null or protein_g_target >= 0),
  add column if not exists carbs_g_target numeric(6, 1) check (carbs_g_target is null or carbs_g_target >= 0),
  add column if not exists fat_g_target numeric(6, 1) check (fat_g_target is null or fat_g_target >= 0),
  add column if not exists fiber_g_target numeric(6, 1) check (fiber_g_target is null or fiber_g_target >= 0),
  add column if not exists water_goal_ml integer check (water_goal_ml is null or water_goal_ml > 0),
  add column if not exists water_glass_ml integer not null default 250 check (water_glass_ml > 0),
  add column if not exists water_bottle_ml integer not null default 600 check (water_bottle_ml > 0),
  add column if not exists sleep_target_min integer check (sleep_target_min is null or sleep_target_min between 180 and 900),
  add column if not exists weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  add column if not exists rest_seconds integer not null default 120 check (rest_seconds between 0 and 1800),
  add column if not exists sex text check (sex is null or sex in ('male', 'female')),
  add column if not exists birth_date date,
  add column if not exists activity_level text
    check (activity_level is null or activity_level in ('sedentario', 'ligero', 'moderado', 'activo', 'muy_activo')),
  add column if not exists meal_times jsonb not null default '{}'::jsonb,
  add column if not exists substances_in_timeline boolean not null default false;

comment on column pulso.settings.substances_in_timeline is
  'Substance use is sensitive: it reaches life.hechos only when the person turns this on.';

-- ---------------------------------------------------------------------------
-- Body: weigh-ins from HealthKit, full InBody scans, goals, other samples
-- ---------------------------------------------------------------------------

alter table pulso.weigh_ins drop constraint if exists weigh_ins_source_check;
alter table pulso.weigh_ins
  add constraint weigh_ins_source_check check (source in ('manual', 'scale', 'healthkit', 'scan'));
alter table pulso.weigh_ins
  add column if not exists external_id text,
  add column if not exists note text;

create unique index if not exists weigh_ins_external_uidx
  on pulso.weigh_ins (user_id, external_id) where external_id is not null;

alter table pulso.body_scans
  add column if not exists weight_kg numeric(5, 2) check (weight_kg is null or weight_kg > 0),
  add column if not exists device text,
  add column if not exists external_id text,
  add column if not exists metrics jsonb not null default '{}'::jsonb,
  add column if not exists segmental jsonb not null default '{}'::jsonb;

comment on column pulso.body_scans.metrics is
  'Every InBody value by camelCase key (skeletalMuscleMass, bodyFatMass, bmr, visceralFatLevel…).';
comment on column pulso.body_scans.segmental is
  '{ lean: {leftArm, rightArm, trunk, leftLeg, rightLeg}, fat: {…}, ecw: {…} }';

create unique index if not exists body_scans_external_uidx
  on pulso.body_scans (user_id, external_id) where external_id is not null;

create table pulso.body_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric in ('percent_body_fat', 'lean_mass', 'bmi', 'waist')),
  value numeric(8, 3) not null,
  measured_at timestamptz not null,
  external_id text,
  created_at timestamptz not null default now()
);

create index body_samples_user_metric_idx on pulso.body_samples (user_id, metric, measured_at desc);
create unique index body_samples_external_uidx
  on pulso.body_samples (user_id, external_id) where external_id is not null;

create table pulso.body_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null check (metric in ('weight', 'bodyFatMass', 'skeletalMuscleMass', 'percentBodyFat')),
  target numeric(6, 2) not null check (target > 0),
  set_at timestamptz not null default now(),
  primary key (user_id, metric)
);

-- ---------------------------------------------------------------------------
-- Daily signals from Apple Health (one row per local date)
-- ---------------------------------------------------------------------------

create table pulso.daily_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  steps numeric,
  active_energy numeric,
  exercise_minutes numeric,
  exercise_minutes_estimated boolean not null default false,
  resting_heart_rate numeric,
  resting_heart_rate_estimated boolean not null default false,
  hrv numeric,
  sleep_minutes numeric,
  sleep_deep numeric,
  sleep_core numeric,
  sleep_rem numeric,
  sleep_awake numeric,
  vo2max numeric,
  respiratory_rate numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Sleep: HealthKit nights next to manual ones
-- ---------------------------------------------------------------------------

alter table pulso.sleeps
  add column if not exists source text not null default 'manual' check (source in ('manual', 'healthkit')),
  add column if not exists night date,
  add column if not exists asleep_min integer check (asleep_min is null or asleep_min >= 0),
  add column if not exists stages jsonb not null default '{}'::jsonb,
  add column if not exists segments jsonb not null default '[]'::jsonb;

comment on column pulso.sleeps.night is 'Local date the night ends on (the morning you wake up).';
comment on column pulso.sleeps.stages is '{ deep, core, rem, awake } in minutes.';

create unique index if not exists sleeps_night_source_uidx
  on pulso.sleeps (user_id, night, source) where night is not null;

-- ---------------------------------------------------------------------------
-- Nutrition: richer meal entries, dishes, recipes, a dated plan
-- ---------------------------------------------------------------------------

alter table pulso.meals
  add column if not exists local_date date,
  add column if not exists slot text not null default 'snack'
    check (slot in ('desayuno', 'comida', 'cena', 'snack')),
  add column if not exists quantity numeric(8, 2),
  add column if not exists unit text,
  add column if not exists fiber_g numeric(6, 1) not null default 0 check (fiber_g >= 0),
  add column if not exists source text not null default 'manual',
  add column if not exists barcode text,
  add column if not exists caffeine_mg numeric(7, 1),
  add column if not exists alcohol_g numeric(6, 1),
  add column if not exists measure jsonb,
  add column if not exists dish_id uuid,
  add column if not exists dish_name text,
  add column if not exists plan_slot_id uuid,
  add column if not exists off_plan boolean not null default false;

create index if not exists meals_user_date_idx on pulso.meals (user_id, local_date, eaten_at);

alter table pulso.waters
  add column if not exists local_date date,
  add column if not exists source text not null default 'manual';

create index if not exists waters_user_date_idx on pulso.waters (user_id, local_date);

create table pulso.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  servings numeric(5, 1) not null default 1 check (servings > 0),
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  batch boolean not null default false,
  ingredients jsonb not null default '[]'::jsonb,
  steps text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column pulso.recipes.ingredients is
  '[{ name, quantity, unit, kcal, protein, carbs, fat, fiber, category }] for the whole recipe.';

create table pulso.saved_dishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slot text check (slot is null or slot in ('desayuno', 'comida', 'cena', 'snack')),
  components jsonb not null default '[]'::jsonb,
  recipe_id uuid references pulso.recipes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pulso.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  notes text,
  starts_on date not null,
  active boolean not null default false,
  days jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index diet_plans_one_active_uidx on pulso.diet_plans (user_id) where active;

create table pulso.plan_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references pulso.diet_plans (id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('desayuno', 'comida', 'cena', 'snack')),
  position smallint not null default 0,
  time time,
  name text,
  recipe_id uuid references pulso.recipes (id) on delete set null,
  portions numeric(5, 2),
  items jsonb not null default '[]'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'skipped', 'replaced')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_slots_user_date_idx on pulso.plan_slots (user_id, date, position);

create table pulso.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text,
  name text not null,
  amount text,
  quantity numeric(10, 2),
  unit text,
  category text not null default 'otros',
  source text not null default 'manual' check (source in ('manual', 'plan')),
  checked boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index shopping_items_key_uidx on pulso.shopping_items (user_id, key) where key is not null;

create table pulso.shopping_lists (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id uuid references pulso.diet_plans (id) on delete set null,
  plan_name text,
  from_date date not null,
  days smallint not null check (days between 1 and 31),
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Medication
-- ---------------------------------------------------------------------------

create table pulso.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null default 'medicamento' check (kind in ('medicamento', 'suplemento')),
  dose numeric(10, 3) not null check (dose > 0),
  unit text not null,
  form text,
  instructions text,
  schedule jsonb not null default '{"asNeeded": true, "times": [], "days": []}'::jsonb,
  start_date date not null default current_date,
  end_date date,
  stock numeric(10, 2) check (stock is null or stock >= 0),
  low_stock_threshold numeric(10, 2) check (low_stock_threshold is null or low_stock_threshold >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medications_user_idx on pulso.medications (user_id, active);

create table pulso.medication_doses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  medication_id uuid not null references pulso.medications (id) on delete cascade,
  date date not null,
  scheduled_time text,
  status text not null check (status in ('tomada', 'omitida', 'pospuesta')),
  taken_at timestamptz,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per slot; as-needed intakes (no scheduled_time) may repeat.
create unique index medication_doses_slot_uidx
  on pulso.medication_doses (medication_id, date, scheduled_time)
  where scheduled_time is not null;
create index medication_doses_user_date_idx on pulso.medication_doses (user_id, date);

-- ---------------------------------------------------------------------------
-- Substances (sensitive)
-- ---------------------------------------------------------------------------

create table pulso.substances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text,
  name text not null check (length(name) between 1 and 40),
  symbol text,
  unit text not null default 'veces',
  forms jsonb not null default '[]'::jsonb,
  max_days_per_week smallint check (max_days_per_week is null or max_days_per_week between 0 and 7),
  archived boolean not null default false,
  position smallint not null default 0,
  builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index substances_slug_uidx on pulso.substances (user_id, slug) where slug is not null;

create table pulso.substance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  substance_id uuid not null references pulso.substances (id) on delete cascade,
  used_at timestamptz not null,
  local_date date not null,
  form text,
  amount text not null default 'normal',
  count numeric(6, 2),
  thc_mg numeric(7, 2),
  context text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index substance_entries_user_date_idx on pulso.substance_entries (user_id, substance_id, local_date);

-- ---------------------------------------------------------------------------
-- Training: shared exercise library, programs (blocks), dated sessions, live
-- ---------------------------------------------------------------------------

create table pulso.exercise_library (
  id text primary key,
  name text not null,
  muscle text not null,
  secondary text[] not null default '{}',
  equipment text not null,
  kind text not null check (kind in ('compound', 'isolation', 'cardio')),
  cardio_modality text
);

comment on table pulso.exercise_library is
  'Shared reference exercises (stable slugs). Read-only for users; personal ones go in pulso.exercises.';

alter table pulso.exercise_library enable row level security;
create policy exercise_library_read on pulso.exercise_library
  for select to authenticated using (true);
grant select on pulso.exercise_library to authenticated;
grant select, insert, update, delete on pulso.exercise_library to service_role;

alter table pulso.exercises
  add column if not exists library_id text references pulso.exercise_library (id) on delete set null,
  add column if not exists secondary text[] not null default '{}',
  add column if not exists equipment text,
  add column if not exists kind text check (kind is null or kind in ('compound', 'isolation', 'cardio')),
  add column if not exists unit text check (unit is null or unit in ('kg', 'lb')),
  add column if not exists notes text;

create unique index if not exists exercises_library_uidx
  on pulso.exercises (user_id, library_id) where library_id is not null;

create table pulso.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  goal text not null default 'hipertrofia',
  weeks smallint not null default 4 check (weeks between 1 and 52),
  notes text,
  active boolean not null default false,
  starts_on date not null default current_date,
  deload_weeks smallint[] not null default '{}',
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index programs_one_active_uidx on pulso.programs (user_id) where active;

create table pulso.program_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references pulso.programs (id) on delete cascade,
  position smallint not null default 0,
  name text not null,
  focus text,
  weekday smallint check (weekday is null or weekday between 1 and 7),
  time time,
  duration_min smallint,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column pulso.program_days.exercises is
  '[{ exerciseId (library slug or pulso.exercises uuid), name, sets, repMin, repMax, targetRir, restSeconds, weightKg, notes, cardio }]';

create index program_days_program_idx on pulso.program_days (program_id, position);

-- Dated sessions are pulso.workouts rows (status planned/done/skipped), so they
-- already reach life.hechos; these columns tie them to their block and day.
alter table pulso.workouts
  add column if not exists program_id uuid references pulso.programs (id) on delete set null,
  add column if not exists program_day_id uuid references pulso.program_days (id) on delete set null,
  add column if not exists local_date date,
  add column if not exists week smallint,
  add column if not exists exercises jsonb,
  add column if not exists energy_kcal numeric(7, 1),
  add column if not exists avg_hr numeric(5, 1),
  add column if not exists source text not null default 'pulso' check (source in ('pulso', 'manual', 'watch'));

create index if not exists workouts_user_date_idx on pulso.workouts (user_id, local_date);

alter table pulso.workout_sets
  add column if not exists drops jsonb,
  add column if not exists duration_s integer check (duration_s is null or duration_s >= 0),
  add column if not exists distance_km numeric(7, 3),
  add column if not exists level numeric(5, 1),
  add column if not exists incline_pct numeric(4, 1),
  add column if not exists avg_hr numeric(5, 1),
  add column if not exists kcal numeric(7, 1),
  add column if not exists done_at timestamptz;

-- The session in progress (at most one per user), as the phone/Watch LiveSession JSON.
create table pulso.live_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Workouts recorded by Apple Health (any app). Linked to a Pulso session when they are the same one.
create table pulso.health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  activity text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  energy_kcal numeric(7, 1),
  distance_m numeric(9, 1),
  avg_hr numeric(5, 1),
  max_hr numeric(5, 1),
  source_name text,
  source_bundle text,
  workout_id uuid references pulso.workouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id),
  check (ended_at >= started_at)
);

create index health_workouts_user_started_idx on pulso.health_workouts (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at, RLS and grants for the new pulso tables
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'recipes', 'saved_dishes', 'diet_plans', 'plan_slots', 'shopping_items',
    'medications', 'medication_doses', 'substances', 'substance_entries',
    'programs', 'program_days', 'health_workouts'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at
         before update on pulso.%I
         for each row execute function life.set_updated_at()',
      t, t
    );
  end loop;

  foreach t in array array[
    'body_samples', 'body_goals', 'daily_metrics', 'recipes', 'saved_dishes',
    'diet_plans', 'plan_slots', 'shopping_items', 'shopping_lists',
    'medications', 'medication_doses', 'substances', 'substance_entries',
    'programs', 'program_days', 'live_sessions', 'health_workouts'
  ]
  loop
    execute format('alter table pulso.%I enable row level security', t);
    execute format(
      'create policy %I_select_own on pulso.%I
         for select to authenticated using (user_id = auth.uid())', t, t
    );
    execute format(
      'create policy %I_insert_own on pulso.%I
         for insert to authenticated with check (user_id = auth.uid())', t, t
    );
    execute format(
      'create policy %I_update_own on pulso.%I
         for update to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t
    );
    execute format(
      'create policy %I_delete_own on pulso.%I
         for delete to authenticated using (user_id = auth.uid())', t, t
    );
    execute format(
      'grant select, insert, update, delete on pulso.%I to authenticated, service_role', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Timed facts → life.hechos
-- ---------------------------------------------------------------------------

-- A dose taken (or skipped) at a known time.
create or replace function pulso.sync_medication_dose_hecho()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
declare
  v_med pulso.medications%rowtype;
begin
  if tg_op = 'DELETE' then
    perform life.delete_hecho(old.user_id, 'pulso', 'medication_doses', old.id);
    return old;
  end if;
  if new.status <> 'tomada' or new.taken_at is null then
    perform life.delete_hecho(new.user_id, 'pulso', 'medication_doses', new.id);
    return new;
  end if;
  select * into v_med from pulso.medications where id = new.medication_id;
  perform life.sync_hecho(
    new.user_id, 'pulso', 'medication_doses', new.id,
    'medication', coalesce(v_med.name, 'Medicación'),
    new.taken_at, null,
    jsonb_strip_nulls(jsonb_build_object(
      'medication_id', new.medication_id,
      'dose', v_med.dose,
      'unit', v_med.unit,
      'kind', v_med.kind,
      'slot', new.scheduled_time
    ))
  );
  return new;
end;
$$;

create trigger sync_medication_dose_hecho
  after insert or update or delete on pulso.medication_doses
  for each row execute function pulso.sync_medication_dose_hecho();

-- Substance use only when the person opted in (settings.substances_in_timeline).
create or replace function pulso.sync_substance_entry_hecho()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
declare
  v_share boolean;
  v_name text;
begin
  if tg_op = 'DELETE' then
    perform life.delete_hecho(old.user_id, 'pulso', 'substance_entries', old.id);
    return old;
  end if;
  select coalesce(s.substances_in_timeline, false) into v_share
    from pulso.settings s where s.user_id = new.user_id;
  if not coalesce(v_share, false) then
    perform life.delete_hecho(new.user_id, 'pulso', 'substance_entries', new.id);
    return new;
  end if;
  select name into v_name from pulso.substances where id = new.substance_id;
  perform life.sync_hecho(
    new.user_id, 'pulso', 'substance_entries', new.id,
    'substance', coalesce(v_name, 'Sustancia'),
    new.used_at, null,
    jsonb_strip_nulls(jsonb_build_object(
      'substance_id', new.substance_id,
      'amount', new.amount,
      'form', new.form,
      'sensitive', true
    ))
  );
  return new;
end;
$$;

create trigger sync_substance_entry_hecho
  after insert or update or delete on pulso.substance_entries
  for each row execute function pulso.sync_substance_entry_hecho();

-- Turning the switch on or off resyncs (or removes) the facts already logged.
create or replace function pulso.resync_substance_hechos()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
begin
  if new.substances_in_timeline is distinct from old.substances_in_timeline then
    update pulso.substance_entries set updated_at = now() where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger resync_substance_hechos
  after update of substances_in_timeline on pulso.settings
  for each row execute function pulso.resync_substance_hechos();

-- Apple Health workouts that are not a Pulso session (those already have their own fact).
create or replace function pulso.sync_health_workout_hecho()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform life.delete_hecho(old.user_id, 'pulso', 'health_workouts', old.id);
    return old;
  end if;
  if new.workout_id is not null then
    perform life.delete_hecho(new.user_id, 'pulso', 'health_workouts', new.id);
    return new;
  end if;
  perform life.sync_hecho(
    new.user_id, 'pulso', 'health_workouts', new.id,
    'activity', new.activity,
    new.started_at, new.ended_at,
    jsonb_strip_nulls(jsonb_build_object(
      'energy_kcal', new.energy_kcal,
      'distance_m', new.distance_m,
      'avg_hr', new.avg_hr,
      'source', new.source_name
    ))
  );
  return new;
end;
$$;

create trigger sync_health_workout_hecho
  after insert or update or delete on pulso.health_workouts
  for each row execute function pulso.sync_health_workout_hecho();

-- The trigger functions above run as definer; nobody calls them directly.
revoke all on function pulso.sync_medication_dose_hecho() from public, anon, authenticated;
revoke all on function pulso.sync_substance_entry_hecho() from public, anon, authenticated;
revoke all on function pulso.sync_health_workout_hecho() from public, anon, authenticated;
revoke all on function pulso.resync_substance_hechos() from public, anon, authenticated;
