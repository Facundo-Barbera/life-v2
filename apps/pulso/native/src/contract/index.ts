// The Salud contract (zod schemas and types) vendored from the old engine's
// `@life/client` (packages/client/src/salud). The phone's screens are typed by
// it; in life-v2 the operations run against Supabase (src/data/ops), not the Mac.
import type { z } from "zod";
import { saludOperations } from "./salud";

export * from "./platform/domains";
export * from "./platform/operation";
export * from "./platform/common";
export * from "./salud";

type All = typeof saludOperations;
type Named<T> = { [K in keyof T]: T[K] & { name: K } };

export const OPERATIONS = Object.fromEntries(Object.entries(saludOperations).map(([name, spec]) => [name, { ...spec, name }])) as Named<All>;

export type Operations = typeof OPERATIONS;
export type OperationName = keyof Operations & string;
export type InputOf<N extends OperationName> = z.input<Operations[N]["input"]>;
export type ParsedInputOf<N extends OperationName> = z.output<Operations[N]["input"]>;
export type OutputOf<N extends OperationName> = z.output<Operations[N]["output"]>;
