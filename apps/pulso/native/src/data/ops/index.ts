import { bodyOps } from "./body";
import { dailyOps } from "./daily";
import { healthOps } from "./health";
import { medicationOps } from "./medication";
import { nutritionOps } from "./nutrition";
import { shoppingOps } from "./shopping";
import { substanceOps } from "./substances";
import { trainingOps } from "./training";
import type { OpTable } from "./types";

/** Every operation this build implements. The rest answer «todavía no está disponible». */
export const OPS: OpTable = {
  ...dailyOps,
  ...bodyOps,
  ...healthOps,
  ...medicationOps,
  ...nutritionOps,
  ...substanceOps,
  ...shoppingOps,
  ...trainingOps,
};
