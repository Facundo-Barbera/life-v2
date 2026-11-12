-- Entreno: one dated session per block day and week, so materializing a
-- block's weeks is idempotent (two tabs reading at once can't double them).
-- Sessions started outside the plan have no week and are not constrained.

create unique index if not exists workouts_day_week_uidx
  on pulso.workouts (program_day_id, week)
  where program_day_id is not null and week is not null;

-- The session in progress, read on every Entreno and Hoy load.
create index if not exists workouts_user_open_idx
  on pulso.workouts (user_id)
  where started_at is not null and ended_at is null;

create index if not exists workout_sets_user_exercise_idx
  on pulso.workout_sets (user_id, exercise_id, created_at desc);
