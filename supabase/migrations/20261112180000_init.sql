-- Life suite: one Postgres, one auth (Supabase Auth), schemas per app.
-- `life.hechos` is the shared timeline. Pulso owns weight, food, sleep, training.
-- Enable passkeys in the Supabase Auth dashboard. Do not store secrets here.

create schema if not exists life;
create schema if not exists pulso;

grant usage on schema life, pulso to authenticated, service_role;

create or replace function life.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared timeline
-- ---------------------------------------------------------------------------

create table life.hechos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_app text not null check (source_app in ('pulso', 'agenda', 'dinero')),
  source_table text,
  source_id uuid,
  kind text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index hechos_user_starts_idx on life.hechos (user_id, starts_at desc);

create unique index hechos_source_uidx
  on life.hechos (user_id, source_app, source_table, source_id)
  where source_id is not null;

comment on table life.hechos is
  'Shared timed facts. Each app remains the source of truth; the calendar reads this.';

create trigger hechos_set_updated_at
  before update on life.hechos
  for each row execute function life.set_updated_at();

alter table life.hechos enable row level security;

create policy hechos_select_own on life.hechos
  for select to authenticated
  using (user_id = auth.uid());

create policy hechos_insert_own on life.hechos
  for insert to authenticated
  with check (user_id = auth.uid());

create policy hechos_update_own on life.hechos
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy hechos_delete_own on life.hechos
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on life.hechos to authenticated, service_role;

-- Upsert/delete a fact from an app row. Runs as definer so triggers can write
-- even if the calling role only touched the source table.
create or replace function life.sync_hecho(
  p_user_id uuid,
  p_source_app text,
  p_source_table text,
  p_source_id uuid,
  p_kind text,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_data jsonb
) returns void
language plpgsql
security definer
set search_path = life, pg_temp
as $$
begin
  insert into life.hechos (
    user_id, source_app, source_table, source_id,
    kind, title, starts_at, ends_at, data
  )
  values (
    p_user_id, p_source_app, p_source_table, p_source_id,
    p_kind, p_title, p_starts_at, p_ends_at, coalesce(p_data, '{}'::jsonb)
  )
  on conflict (user_id, source_app, source_table, source_id)
  where source_id is not null
  do update set
    kind = excluded.kind,
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    data = excluded.data,
    updated_at = now();
end;
$$;

create or replace function life.delete_hecho(
  p_user_id uuid,
  p_source_app text,
  p_source_table text,
  p_source_id uuid
) returns void
language plpgsql
security definer
set search_path = life, pg_temp
as $$
begin
  delete from life.hechos
  where user_id = p_user_id
    and source_app = p_source_app
    and source_table = p_source_table
    and source_id = p_source_id;
end;
$$;

revoke all on function life.sync_hecho(uuid, text, text, uuid, text, text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function life.delete_hecho(uuid, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pulso
-- ---------------------------------------------------------------------------

create table pulso.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal_weight_kg numeric(5, 2) check (goal_weight_kg is null or goal_weight_kg > 0),
  goal_mode text check (goal_mode is null or goal_mode in ('suave', 'constante', 'rapido')),
  goal_reach_by date,
  daily_kcal_budget integer check (daily_kcal_budget is null or daily_kcal_budget > 0),
  height_cm numeric(5, 1) check (height_cm is null or height_cm > 0),
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table pulso.settings is 'One row per user: goal, daily budget, timezone.';

create table pulso.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5, 2) not null check (weight_kg > 0),
  time_of_day text not null default 'unknown'
    check (time_of_day in ('morning', 'evening', 'unknown')),
  source text not null default 'manual'
    check (source in ('manual', 'scale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index weigh_ins_user_measured_idx on pulso.weigh_ins (user_id, measured_at desc);

create table pulso.body_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scanned_at timestamptz not null,
  muscle_pct numeric(5, 2) check (muscle_pct is null or (muscle_pct >= 0 and muscle_pct <= 100)),
  fat_pct numeric(5, 2) check (fat_pct is null or (fat_pct >= 0 and fat_pct <= 100)),
  regions jsonb not null default '{}'::jsonb,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_scans_user_scanned_idx on pulso.body_scans (user_id, scanned_at desc);

create table pulso.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  eaten_at timestamptz not null,
  name text not null,
  kcal integer not null default 0 check (kcal >= 0),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meals_user_eaten_idx on pulso.meals (user_id, eaten_at desc);

create table pulso.waters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drunk_at timestamptz not null,
  amount_ml integer not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create index waters_user_drunk_idx on pulso.waters (user_id, drunk_at desc);

create table pulso.sleeps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  quality smallint check (quality is null or quality between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at > started_at)
);

create index sleeps_user_started_idx on pulso.sleeps (user_id, started_at desc);

create table pulso.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  muscle_group text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table pulso.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  focus text,
  status text not null default 'planned'
    check (status in ('planned', 'done', 'skipped')),
  planned_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index workouts_user_planned_idx on pulso.workouts (user_id, coalesce(planned_at, started_at) desc);

create table pulso.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references pulso.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references pulso.exercises (id) on delete restrict,
  set_no smallint not null check (set_no > 0),
  reps smallint check (reps is null or reps >= 0),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg >= 0),
  rpe numeric(3, 1) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index workout_sets_workout_idx on pulso.workout_sets (workout_id, exercise_id, set_no);

-- updated_at on pulso tables that have the column
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'weigh_ins', 'body_scans', 'meals', 'sleeps', 'exercises', 'workouts'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at
         before update on pulso.%I
         for each row execute function life.set_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sync Pulso rows into life.hechos (sleep, workout, meal, weigh-in)
-- ---------------------------------------------------------------------------

create or replace function pulso.sync_sleep_hecho()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform life.delete_hecho(old.user_id, 'pulso', 'sleeps', old.id);
    return old;
  end if;
  perform life.sync_hecho(
    new.user_id, 'pulso', 'sleeps', new.id,
    'sleep', 'Sueño',
    new.started_at, new.ended_at,
    jsonb_strip_nulls(jsonb_build_object('quality', new.quality))
  );
  return new;
end;
$$;

create trigger sync_sleep_hecho
  after insert or update or delete on pulso.sleeps
  for each row execute function pulso.sync_sleep_hecho();

create or replace function pulso.sync_workout_hecho()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
declare
  v_start timestamptz;
begin
  if tg_op = 'DELETE' then
    perform life.delete_hecho(old.user_id, 'pulso', 'workouts', old.id);
    return old;
  end if;
  v_start := coalesce(new.started_at, new.planned_at);
  if v_start is null then
    perform life.delete_hecho(new.user_id, 'pulso', 'workouts', new.id);
    return new;
  end if;
  perform life.sync_hecho(
    new.user_id, 'pulso', 'workouts', new.id,
    'workout', new.title,
    v_start, new.ended_at,
    jsonb_strip_nulls(jsonb_build_object(
      'focus', new.focus,
      'status', new.status
    ))
  );
  return new;
end;
$$;

create trigger sync_workout_hecho
  after insert or update or delete on pulso.workouts
  for each row execute function pulso.sync_workout_hecho();

create or replace function pulso.sync_meal_hecho()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform life.delete_hecho(old.user_id, 'pulso', 'meals', old.id);
    return old;
  end if;
  perform life.sync_hecho(
    new.user_id, 'pulso', 'meals', new.id,
    'meal', new.name,
    new.eaten_at, null,
    jsonb_build_object(
      'kcal', new.kcal,
      'protein_g', new.protein_g,
      'carbs_g', new.carbs_g,
      'fat_g', new.fat_g
    )
  );
  return new;
end;
$$;

create trigger sync_meal_hecho
  after insert or update or delete on pulso.meals
  for each row execute function pulso.sync_meal_hecho();

create or replace function pulso.sync_weigh_in_hecho()
returns trigger
language plpgsql
security definer
set search_path = life, pulso, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform life.delete_hecho(old.user_id, 'pulso', 'weigh_ins', old.id);
    return old;
  end if;
  perform life.sync_hecho(
    new.user_id, 'pulso', 'weigh_ins', new.id,
    'weigh_in', new.weight_kg::text || ' kg',
    new.measured_at, null,
    jsonb_build_object(
      'weight_kg', new.weight_kg,
      'time_of_day', new.time_of_day
    )
  );
  return new;
end;
$$;

create trigger sync_weigh_in_hecho
  after insert or update or delete on pulso.weigh_ins
  for each row execute function pulso.sync_weigh_in_hecho();

-- ---------------------------------------------------------------------------
-- Row level security: only your own rows
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'weigh_ins', 'body_scans', 'meals', 'waters',
    'sleeps', 'exercises', 'workouts', 'workout_sets'
  ]
  loop
    execute format('alter table pulso.%I enable row level security', t);
    execute format(
      'create policy %I_select_own on pulso.%I
         for select to authenticated
         using (user_id = auth.uid())', t, t
    );
    execute format(
      'create policy %I_insert_own on pulso.%I
         for insert to authenticated
         with check (user_id = auth.uid())', t, t
    );
    execute format(
      'create policy %I_update_own on pulso.%I
         for update to authenticated
         using (user_id = auth.uid())
         with check (user_id = auth.uid())', t, t
    );
    execute format(
      'create policy %I_delete_own on pulso.%I
         for delete to authenticated
         using (user_id = auth.uid())', t, t
    );
    execute format(
      'grant select, insert, update, delete on pulso.%I to authenticated, service_role',
      t
    );
  end loop;
end;
$$;
