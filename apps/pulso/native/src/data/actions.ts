import { type InputOf, type OperationName, type OutputOf } from "@/contract";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { allKey } from "./keys";
import { useEngine } from "./session";

/**
 * A write (or a one-off read) through the contract. `run` resolves with the
 * operation's output and then refreshes Pulso's queries. It rejects on
 * failure; the caller decides what to show.
 */
export function useAction() {
  const { client } = useEngine();
  const queries = useQueryClient();
  const [pending, setPending] = useState(0);

  const run = useCallback(
    async <N extends OperationName>(name: N, input?: InputOf<N>, options: { refresh?: boolean } = {}): Promise<OutputOf<N>> => {
      if (!client) throw new Error("Inicia sesión para continuar.");
      setPending((n) => n + 1);
      try {
        return await client.call(name, input);
      } finally {
        setPending((n) => n - 1);
        if (options.refresh !== false) void queries.invalidateQueries({ queryKey: allKey });
      }
    },
    [client, queries],
  );

  return { run, busy: pending > 0 };
}
