/** This domain's `op()`: every spec declared in this folder belongs to `salud`. */
import { domainOp } from "../platform/operation";

export type { Access, HttpMethod, OperationSpec } from "../platform/operation";
export { pathParams, usesQuery } from "../platform/operation";

export const op = domainOp("salud");
