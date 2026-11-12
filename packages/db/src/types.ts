// Row types for the shared Postgres. Hand-written to match supabase/migrations;
// keep them in step with every migration (numeric columns arrive as numbers).

export type SourceApp = "pulso" | "agenda" | "dinero";

export type HechoKind =
  | "sleep"
  | "workout"
  | "meal"
  | "weigh_in"
  | "medication"
  | "substance"
  | "activity"
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

export type MemberRole = "owner" | "member";

export type Member = {
  user_id: string;
  role: MemberRole;
  display_name: string | null;
  invited_by: string | null;
  created_at: string;
};

export type Invitation = {
  id: string;
  email: string;
  invited_by: string;
  note: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
};

// ---------------------------------------------------------------------------
// Pulso
// ---------------------------------------------------------------------------

export type GoalMode = "suave" | "constante" | "rapido";
export type TimeOfDay = "morning" | "evening" | "unknown";
export type WorkoutStatus = "planned" | "done" | "skipped";
export type MealSlot = "desayuno" | "comida" | "cena" | "snack";
export type ActivityLevel = "sedentario" | "ligero" | "moderado" | "activo" | "muy_activo";
export type WeightUnit = "kg" | "lb";

export type PulsoSettings = {
  user_id: string;
  goal_weight_kg: number | null;
  goal_mode: GoalMode | null;
  goal_reach_by: string | null;
  daily_kcal_budget: number | null;
  height_cm: number | null;
  timezone: string;
  kcal_target: number | null;
  protein_g_target: number | null;
  carbs_g_target: number | null;
  fat_g_target: number | null;
  fiber_g_target: number | null;
  water_goal_ml: number | null;
  water_glass_ml: number;
  water_bottle_ml: number;
  sleep_target_min: number | null;
  weight_unit: WeightUnit;
  rest_seconds: number;
  sex: "male" | "female" | null;
  birth_date: string | null;
  activity_level: ActivityLevel | null;
  /** Planned meal times, `{ desayuno: "08:00", comida: "14:00", cena: "20:30" }`. */
  meal_times: Partial<Record<MealSlot, string>>;
  substances_in_timeline: boolean;
  /** Custom bands per nutrient, `{ kcal: { kind, min, max } }`. */
  nutrition_zones: Record<string, { kind: string; min: number | null; max: number | null }>;
  water_unit: "ml" | "vaso" | "botella";
  /** Phone/Watch training preferences. */
  training_prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WeighInSource = "manual" | "scale" | "healthkit" | "scan";

export type WeighIn = {
  id: string;
  user_id: string;
  measured_at: string;
  weight_kg: number;
  time_of_day: TimeOfDay;
  source: WeighInSource;
  external_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Segment = "leftArm" | "rightArm" | "trunk" | "leftLeg" | "rightLeg";
export type SegmentValues = Partial<Record<Segment, number>>;

export type BodyScan = {
  id: string;
  user_id: string;
  scanned_at: string;
  muscle_pct: number | null;
  fat_pct: number | null;
  regions: Record<string, unknown>;
  source: string | null;
  weight_kg: number | null;
  device: string | null;
  external_id: string | null;
  /** Every InBody value by camelCase key (skeletalMuscleMass, bodyFatMass, bmr…). */
  metrics: Record<string, number>;
  segmental: { lean?: SegmentValues; fat?: SegmentValues; ecw?: SegmentValues };
  created_at: string;
  updated_at: string;
};

export type BodySampleMetric = "percent_body_fat" | "lean_mass" | "bmi" | "waist";

export type BodySample = {
  id: string;
  user_id: string;
  metric: BodySampleMetric;
  value: number;
  measured_at: string;
  external_id: string | null;
  created_at: string;
};

export type BodyGoalMetric = "weight" | "bodyFatMass" | "skeletalMuscleMass" | "percentBodyFat";

export type BodyGoal = {
  user_id: string;
  metric: BodyGoalMetric;
  target: number;
  set_at: string;
};

export type DailyMetrics = {
  user_id: string;
  date: string;
  steps: number | null;
  active_energy: number | null;
  exercise_minutes: number | null;
  exercise_minutes_estimated: boolean;
  resting_heart_rate: number | null;
  resting_heart_rate_estimated: boolean;
  hrv: number | null;
  sleep_minutes: number | null;
  sleep_deep: number | null;
  sleep_core: number | null;
  sleep_rem: number | null;
  sleep_awake: number | null;
  vo2max: number | null;
  respiratory_rate: number | null;
  updated_at: string;
};

export type MealMeasure = { amount: number; unit: string; size?: number | null };

export type Meal = {
  id: string;
  user_id: string;
  eaten_at: string;
  local_date: string | null;
  slot: MealSlot;
  name: string;
  quantity: number | null;
  unit: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  source: string;
  barcode: string | null;
  caffeine_mg: number | null;
  alcohol_g: number | null;
  measure: MealMeasure | null;
  dish_id: string | null;
  dish_name: string | null;
  plan_slot_id: string | null;
  saved_dish_id: string | null;
  off_plan: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Water = {
  id: string;
  user_id: string;
  drunk_at: string;
  local_date: string | null;
  amount_ml: number;
  source: string;
  created_at: string;
};

export type SleepStages = { deep?: number; core?: number; rem?: number; awake?: number };
export type SleepSegment = { start: string; end: string; stage: "deep" | "core" | "rem" | "awake" | "asleep" | "inBed" };

export type Sleep = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  quality: number | null;
  notes: string | null;
  source: "manual" | "healthkit";
  night: string | null;
  asleep_min: number | null;
  stages: SleepStages;
  segments: SleepSegment[];
  created_at: string;
  updated_at: string;
};

/** One ingredient of a recipe or component of a dish, macros for the quantity given. */
export type FoodItem = {
  name: string;
  quantity: number;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  category?: string;
};

export type Recipe = {
  id: string;
  user_id: string;
  name: string;
  servings: number;
  prep_minutes: number;
  batch: boolean;
  ingredients: FoodItem[];
  steps: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SavedDish = {
  id: string;
  user_id: string;
  name: string;
  slot: MealSlot | null;
  components: FoodItem[];
  recipe_id: string | null;
  created_at: string;
  updated_at: string;
};

/** A rotation day of a diet plan: meals by slot. */
export type DietPlanDay = {
  label: string;
  meals: { slot: MealSlot; time?: string | null; name: string; recipeId?: string | null; portions?: number | null; items: FoodItem[] }[];
};

export type DietPlan = {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  starts_on: string;
  active: boolean;
  days: DietPlanDay[];
  created_at: string;
  updated_at: string;
};

export type PlanSlotStatus = "planned" | "skipped" | "replaced";

export type PlanSlot = {
  id: string;
  user_id: string;
  plan_id: string;
  date: string;
  slot: MealSlot;
  position: number;
  time: string | null;
  name: string | null;
  recipe_id: string | null;
  portions: number | null;
  items: FoodItem[];
  status: PlanSlotStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ShoppingItem = {
  id: string;
  user_id: string;
  key: string | null;
  name: string;
  amount: string | null;
  quantity: number | null;
  unit: string | null;
  category: string;
  source: "manual" | "plan";
  checked: boolean;
  /** «Ya tengo»: at home already, not counted. */
  pantry: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ShoppingList = {
  user_id: string;
  plan_id: string | null;
  plan_name: string | null;
  from_date: string;
  days: number;
  generated_at: string;
};

export type MedicationKind = "medicamento" | "suplemento";
export type DayPart = "manana" | "tarde" | "noche";

export type MedicationSchedule = {
  asNeeded: boolean;
  /** Local "HH:MM". */
  times: string[];
  /** ISO weekdays, 1 = Monday … 7 = Sunday; empty = every day. */
  days: number[];
  interval?: { every: number; unit: "day" | "week"; start: string } | null;
  monthDay?: number | null;
  training?: { withinMinutes: number; restDayTime: string | null } | null;
  meals?: ("desayuno" | "comida" | "cena")[];
  bedtime?: boolean;
  windows?: { part: DayPart; start?: string; end?: string }[];
  anyTime?: boolean;
  reminder?: string | null;
};

export type Medication = {
  id: string;
  user_id: string;
  name: string;
  kind: MedicationKind;
  dose: number;
  unit: string;
  form: string | null;
  instructions: string | null;
  schedule: MedicationSchedule;
  start_date: string;
  end_date: string | null;
  stock: number | null;
  low_stock_threshold: number | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DoseStatus = "tomada" | "omitida" | "pospuesta";

export type MedicationDose = {
  id: string;
  user_id: string;
  medication_id: string;
  date: string;
  scheduled_time: string | null;
  status: DoseStatus;
  taken_at: string | null;
  logged_at: string;
  created_at: string;
  updated_at: string;
};

export type Substance = {
  id: string;
  user_id: string;
  slug: string | null;
  name: string;
  symbol: string | null;
  unit: string;
  forms: string[];
  max_days_per_week: number | null;
  archived: boolean;
  position: number;
  builtin: boolean;
  created_at: string;
  updated_at: string;
};

export type SubstanceEntry = {
  id: string;
  user_id: string;
  substance_id: string;
  used_at: string;
  local_date: string;
  form: string | null;
  amount: string;
  count: number | null;
  thc_mg: number | null;
  context: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps" | "forearms"
  | "quads" | "hamstrings" | "glutes" | "calves" | "core" | "full_body" | "cardio";
export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "kettlebell" | "bodyweight" | "band";
export type ExerciseKind = "compound" | "isolation" | "cardio";

export type LibraryExercise = {
  id: string;
  name: string;
  muscle: MuscleGroup | (string & {});
  secondary: string[];
  equipment: Equipment | (string & {});
  kind: ExerciseKind;
  cardio_modality: string | null;
};

export type Exercise = {
  id: string;
  user_id: string;
  name: string;
  muscle_group: string | null;
  library_id: string | null;
  secondary: string[];
  equipment: string | null;
  kind: ExerciseKind | null;
  unit: WeightUnit | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Program = {
  id: string;
  user_id: string;
  name: string;
  goal: string;
  weeks: number;
  notes: string | null;
  active: boolean;
  starts_on: string;
  deload_weeks: number[];
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** One exercise as prescribed in a program day (or a dated session's own list). */
export type ProgramExercise = {
  /** Library slug (`press-banca`) or a personal `pulso.exercises` id. */
  exerciseId: string;
  name: string;
  muscle?: string | null;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir?: number | null;
  restSeconds: number;
  weightKg?: number | null;
  notes?: string | null;
  cardio?: { minutes?: number | null; distanceKm?: number | null; level?: number | null } | null;
};

export type ProgramDay = {
  id: string;
  user_id: string;
  program_id: string;
  position: number;
  name: string;
  focus: string | null;
  weekday: number | null;
  time: string | null;
  duration_min: number | null;
  exercises: ProgramExercise[];
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
  program_id: string | null;
  program_day_id: string | null;
  local_date: string | null;
  week: number | null;
  exercises: ProgramExercise[] | null;
  energy_kcal: number | null;
  avg_hr: number | null;
  source: "pulso" | "manual" | "watch";
  created_at: string;
  updated_at: string;
};

export type SetDrop = { weightKg: number; reps: number };

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
  drops: SetDrop[] | null;
  duration_s: number | null;
  distance_km: number | null;
  level: number | null;
  incline_pct: number | null;
  avg_hr: number | null;
  kcal: number | null;
  done_at: string | null;
  created_at: string;
};

export type LiveSessionRow = {
  user_id: string;
  /** The phone/Watch LiveSession JSON (epoch ms inside). */
  data: Record<string, unknown>;
  version: number;
  updated_at: string;
};

export type HealthWorkout = {
  id: string;
  user_id: string;
  external_id: string;
  activity: string;
  started_at: string;
  ended_at: string;
  energy_kcal: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  source_name: string | null;
  source_bundle: string | null;
  workout_id: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Database map for supabase-js
// ---------------------------------------------------------------------------

/** Columns with a default (or nullable) may be left out on insert. */
type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

type NoViews = { [_ in never]: never };

export type Database = {
  life: {
    Tables: {
      hechos: Table<Hecho, "user_id" | "source_app" | "kind" | "title" | "starts_at">;
      members: Table<Member, "user_id">;
      invitations: Table<Invitation, "email" | "invited_by">;
    };
    Views: NoViews;
    Functions: {
      is_owner: { Args: Record<string, never>; Returns: boolean };
    };
  };
  pulso: {
    Tables: {
      settings: Table<PulsoSettings, "user_id">;
      weigh_ins: Table<WeighIn, "user_id" | "measured_at" | "weight_kg">;
      body_scans: Table<BodyScan, "user_id" | "scanned_at">;
      body_samples: Table<BodySample, "user_id" | "metric" | "value" | "measured_at">;
      body_goals: Table<BodyGoal, "user_id" | "metric" | "target">;
      daily_metrics: Table<DailyMetrics, "user_id" | "date">;
      meals: Table<Meal, "user_id" | "eaten_at" | "name">;
      waters: Table<Water, "user_id" | "drunk_at" | "amount_ml">;
      sleeps: Table<Sleep, "user_id" | "started_at" | "ended_at">;
      recipes: Table<Recipe, "user_id" | "name">;
      saved_dishes: Table<SavedDish, "user_id" | "name">;
      diet_plans: Table<DietPlan, "user_id" | "name" | "starts_on">;
      plan_slots: Table<PlanSlot, "user_id" | "plan_id" | "date" | "slot">;
      shopping_items: Table<ShoppingItem, "user_id" | "name">;
      shopping_lists: Table<ShoppingList, "user_id" | "from_date" | "days">;
      medications: Table<Medication, "user_id" | "name" | "dose" | "unit">;
      medication_doses: Table<MedicationDose, "user_id" | "medication_id" | "date" | "status">;
      substances: Table<Substance, "user_id" | "name">;
      substance_entries: Table<SubstanceEntry, "user_id" | "substance_id" | "used_at" | "local_date">;
      exercise_library: Table<LibraryExercise, "id" | "name" | "muscle" | "equipment" | "kind">;
      exercises: Table<Exercise, "user_id" | "name">;
      programs: Table<Program, "user_id" | "name">;
      program_days: Table<ProgramDay, "user_id" | "program_id" | "name">;
      workouts: Table<Workout, "user_id" | "title">;
      workout_sets: Table<WorkoutSet, "workout_id" | "user_id" | "exercise_id" | "set_no">;
      live_sessions: Table<LiveSessionRow, "user_id" | "data">;
      health_workouts: Table<HealthWorkout, "user_id" | "external_id" | "activity" | "started_at" | "ended_at">;
    };
    Views: NoViews;
    Functions: NoViews;
  };
};
