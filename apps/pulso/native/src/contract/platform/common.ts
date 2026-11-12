import { z } from "zod";

/** Schemas every domain shares. A domain's own (money, a task's priority) live in its folder. */

export const Id = z.string().min(1).max(100);

const validDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .refine(validDate, "not a calendar date")
  .describe("Calendar date, YYYY-MM-DD, in the person's local time.");

export const Month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM")
  .describe("Calendar month, YYYY-MM.");

/** How many days before a due date Life starts showing it (like Apple Reminders' early alert): 0 is the day itself. */
export const NoticeDays = z.number().int().min(0).max(60);
export const DEFAULT_NOTICE_DAYS = 2;

export const Timestamp = z.number().int().describe("Epoch milliseconds.");

export const Deleted = z.object({ id: Id, deleted: z.literal(true) });
export type Deleted = z.infer<typeof Deleted>;

/** The body of every API error. */
export const ApiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiError>;
