import type { InputOf, OperationName } from "@/contract";

// Query keys: ["pulso", operation, input]. Any write refreshes every Pulso query.

export const ROOT = "pulso" as const;

export function operationKey<N extends OperationName>(name: N, input?: InputOf<N>) {
  return [ROOT, name, input ?? {}] as const;
}

export const allKey = [ROOT] as const;
