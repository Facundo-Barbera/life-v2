/** Salud (ported from Pulso): one spread per feature and one `export *` per feature file. */
import { bodyOperations } from "./body";
import { knowledgeOperations } from "./knowledge";
import { sleepOperations } from "./sleep";
import { dailyOperations } from "./daily";
import { workoutOperations } from "./workouts";
import { trainingOperations } from "./training";
import { calendarOperations } from "./calendar";
import { nutritionOperations } from "./nutrition";
import { dietReviewOperations } from "./diet-review";
import { shoppingOperations } from "./shopping";
import { medicationOperations } from "./medication";
import { substanceOperations } from "./substances";

export * from "./daily";
export * from "./nutrition";
export * from "./diet";
export * from "./diet-review";
export * from "./shopping";
export * from "./body";
export * from "./sleep";
export * from "./medication";
export * from "./substances";
export * from "./knowledge";
export * from "./workouts-types";
export * from "./workouts";
export * from "./training";
export * from "./calendar";

export const saludOperations = {
  ...bodyOperations,
  ...knowledgeOperations,
  ...sleepOperations,
  ...dailyOperations,
  ...workoutOperations,
  ...trainingOperations,
  ...calendarOperations,
  ...nutritionOperations,
  ...dietReviewOperations,
  ...shoppingOperations,
  ...medicationOperations,
  ...substanceOperations,
};
