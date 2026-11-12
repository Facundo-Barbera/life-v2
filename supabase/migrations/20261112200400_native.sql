-- What the iPhone app (apps/pulso/native) needs beyond the port migration.
-- Additive only: nullable or defaulted columns on tables that already have RLS.

-- A logged dish remembers the saved dish (Mis platillos) it came from, so the
-- phone can count uses and sort them.
alter table pulso.meals
  add column if not exists saved_dish_id uuid references pulso.saved_dishes (id) on delete set null;

create index if not exists meals_user_saved_dish_idx
  on pulso.meals (user_id, saved_dish_id) where saved_dish_id is not null;

-- Custom "estás bien aquí" bands per nutrient ({ kcal: { kind, min, max } … });
-- nutrients without one get a band derived from the target.
alter table pulso.settings
  add column if not exists nutrition_zones jsonb not null default '{}'::jsonb,
  add column if not exists water_unit text not null default 'ml'
    check (water_unit in ('ml', 'vaso', 'botella'));

-- Weekly program preferences the phone keeps (default unit for new exercises,
-- the Watch's haptics…), as one JSON object.
alter table pulso.settings
  add column if not exists training_prefs jsonb not null default '{}'::jsonb;

-- Apple Health sync upserts by its own ids. PostgREST's `on_conflict` cannot
-- name a partial index, so these are full unique indexes (NULLs stay distinct,
-- so rows without an external id are unaffected).
create unique index if not exists weigh_ins_user_external_key
  on pulso.weigh_ins (user_id, external_id);
create unique index if not exists body_samples_user_external_key
  on pulso.body_samples (user_id, external_id);
create unique index if not exists body_scans_user_external_key
  on pulso.body_scans (user_id, external_id);
create unique index if not exists sleeps_user_night_source_key
  on pulso.sleeps (user_id, night, source);
create unique index if not exists substances_user_slug_key
  on pulso.substances (user_id, slug);

-- «Ya tengo» on the phone's shopping list: at home already, not counted.
alter table pulso.shopping_items
  add column if not exists pantry boolean not null default false;
