import { OPERATIONS, type InputOf, type OperationName, type OutputOf } from "@/contract";
import { NotAvailableError } from "./errors";
import { OPS } from "./ops";
import type { Ctx } from "./ops/types";

/**
 * The phone's operations, run against Supabase. Same names, inputs and answers
 * as the old engine's contract, so the screens didn't change; each one is a
 * function in src/data/ops. RLS keeps every row to its owner.
 */
export class PulsoApi {
  constructor(readonly ctx: Ctx) {}

  async call<N extends OperationName>(name: N, input?: InputOf<N>, _options?: { signal?: AbortSignal }): Promise<OutputOf<N>> {
    const run = OPS[name] as ((ctx: Ctx, input: unknown) => Promise<OutputOf<N>>) | undefined;
    if (!run) throw new NotAvailableError();
    const spec = OPERATIONS[name];
    const parsed = spec.input.safeParse(input ?? {});
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
    return run(this.ctx, parsed.data);
  }

  /** Whether this build implements an operation (screens hide what it doesn't). */
  has(name: OperationName): boolean {
    return OPS[name] !== undefined;
  }
}
