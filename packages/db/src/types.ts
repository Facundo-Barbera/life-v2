export type SourceApp = "pulso" | "agenda" | "dinero";

export type HechoKind =
  | "sleep"
  | "workout"
  | "meal"
  | "weigh_in"
  | "event"
  | "issue_block"
  | "charge";

export type Hecho = {
  id: string;
  user_id: string;
  source_app: SourceApp;
  source_table: string | null;
  source_id: string | null;
  kind: HechoKind | (string & {});
  title: string;
  starts_at: string;
  ends_at: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoalMode = "suave" | "constante" | "rapido";
export type TimeOfDay = "morning" | "evening" | "unknown";
export type WorkoutStatus = "planned" | "done" | "skipped";

export type PulsoSettings = {
  user_id: string;
  goal_weight_kg: number | null;
  goal_mode: GoalMode | null;
  goal_reach_by: string | null;
  daily_kcal_budget: number | null;
  height_cm: number | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type WeighIn = {
  id: string;
  user_id: string;
  measured_at: string;
  weight_kg: number;
  time_of_day: TimeOfDay;
  source: "manual" | "scale";
  created_at: string;
  updated_at: string;
};

export type BodyScan = {
  id: string;
  user_id: string;
  scanned_at: string;
  muscle_pct: number | null;
  fat_pct: number | null;
  regions: Record<string, unknown>;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type Meal = {
  id: string;
  user_id: string;
  eaten_at: string;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Water = {
  id: string;
  user_id: string;
  drunk_at: string;
  amount_ml: number;
  created_at: string;
};

export type Sleep = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  quality: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Exercise = {
  id: string;
  user_id: string;
  name: string;
  muscle_group: string | null;
  created_at: string;
  updated_at: string;
};

export type Workout = {
  id: string;
  user_id: string;
  title: string;
  focus: string | null;
  status: WorkoutStatus;
  planned_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  set_no: number;
  reps: number | null;
  weight_kg: number | null;
  rpe: number | null;
  done: boolean;
  created_at: string;
};

export type Database = {
  life: {
    Tables: {
      hechos: {
        Row: Hecho;
        Insert: Partial<Hecho> &
          Pick<Hecho, "user_id" | "source_app" | "kind" | "title" | "starts_at">;
        Update: Partial<Hecho>;
        Relationships: [];
      };
    };
  };
  pulso: {
    Tables: {
      settings: {
        Row: PulsoSettings;
        Insert: Partial<PulsoSettings> & Pick<PulsoSettings, "user_id">;
        Update: Partial<PulsoSettings>;
        Relationships: [];
      };
      weigh_ins: {
        Row: WeighIn;
        Insert: Partial<WeighIn> & Pick<WeighIn, "user_id" | "measured_at" | "weight_kg">;
        Update: Partial<WeighIn>;
        Relationships: [];
      };
      body_scans: {
        Row: BodyScan;
        Insert: Partial<BodyScan> & Pick<BodyScan, "user_id" | "scanned_at">;
        Update: Partial<BodyScan>;
        Relationships: [];
      };
      meals: {
        Row: Meal;
        Insert: Partial<Meal> & Pick<Meal, "user_id" | "eaten_at" | "name">;
        Update: Partial<Meal>;
        Relationships: [];
      };
      waters: {
        Row: Water;
        Insert: Partial<Water> & Pick<Water, "user_id" | "drunk_at" | "amount_ml">;
        Update: Partial<Water>;
        Relationships: [];
      };
      sleeps: {
        Row: Sleep;
        Insert: Partial<Sleep> & Pick<Sleep, "user_id" | "started_at" | "ended_at">;
        Update: Partial<Sleep>;
        Relationships: [];
      };
      exercises: {
        Row: Exercise;
        Insert: Partial<Exercise> & Pick<Exercise, "user_id" | "name">;
        Update: Partial<Exercise>;
        Relationships: [];
      };
      workouts: {
        Row: Workout;
        Insert: Partial<Workout> & Pick<Workout, "user_id" | "title">;
        Update: Partial<Workout>;
        Relationships: [];
      };
      workout_sets: {
        Row: WorkoutSet;
        Insert: Partial<WorkoutSet> &
          Pick<WorkoutSet, "workout_id" | "user_id" | "exercise_id" | "set_no">;
        Update: Partial<WorkoutSet>;
        Relationships: [];
      };
    };
  };
};
