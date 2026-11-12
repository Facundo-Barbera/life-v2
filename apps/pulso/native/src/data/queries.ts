import { type InputOf, type OperationName, type OutputOf } from "@/contract";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { operationKey } from "./keys";
import { useEngine } from "./session";

/** One operation as a query: typed by the contract, refreshed on focus and after every write. */
export function useOperation<N extends OperationName>(
  name: N,
  input?: InputOf<N>,
  options: Omit<UseQueryOptions<OutputOf<N>>, "queryKey" | "queryFn"> = {},
) {
  const { client } = useEngine();
  return useQuery<OutputOf<N>>({
    queryKey: operationKey(name, input),
    queryFn: ({ signal }) => client!.call(name, input, { signal }),
    enabled: !!client && (options.enabled ?? true),
    ...options,
  });
}
