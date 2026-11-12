import { z } from "zod";
import { op } from "./operation";

/** Pulso's knowledge operations (its Coach tools), at `/api/v1/salud/knowledge/<operation>`; the engine runs those tools for them (`salud/api/tools.ts`). */
export const knowledgeOperations = {
  consult_knowledge: op({
    name: "consult_knowledge",
    description: "Search Pulso's curated evidence base: short Spanish cards from position stands and guidelines (ISSN, ACSM, WHO, AASM, ATA…) on nutrition, training, body composition, sleep, medication timing, supplements, alcohol and cannabis. Each card: recommendations with numbers and units, when they apply, caveats, when to refer, evidence level (alta/moderada/baja), review date, sources. Call it before any numeric recommendation. Returns the best matches, best first; an empty list means no card covers it.",
    access: "read",
    method: "GET",
    path: "/knowledge/consult_knowledge",
    input: z.object({ query: z.string().min(2).describe("Words or keywords, Spanish or English, e.g. \"proteína con semaglutida\""), topics: z.array(z.enum(["nutrition","training","body","sleep","medication","supplements","substances"])).optional(), limit: z.int().min(1).max(5).describe("Up to 5 when the question spans several topics").default(2) }),
    output: z.unknown(),
  }),
};
