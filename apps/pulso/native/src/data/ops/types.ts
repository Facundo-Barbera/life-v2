import type { LifeClient } from "@life/db";
import type { OperationName, OutputOf, ParsedInputOf } from "@/contract";

/** What every operation runs with: the signed-in person's client, id and timezone. */
export type Ctx = {
  db: LifeClient;
  userId: string;
  /** IANA timezone from pulso.settings. */
  tz: string;
};

export type Op<N extends OperationName> = (ctx: Ctx, input: ParsedInputOf<N>) => Promise<OutputOf<N>>;
export type OpTable = { [N in OperationName]?: Op<N> };
