import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describeError } from "@/data/errors";
import { ErrorState, LoadingState } from "./States";

/** Loading, error and data for one query: screens only write the data case. */
export function QueryState<T>({ query, children, loading }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; /** Custom placeholder; a panel skeleton by default. */ loading?: ReactNode }) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) return <ErrorState message={describeError(query.error)} onRetry={() => void query.refetch()} />;
  return <>{loading ?? <LoadingState />}</>;
}
