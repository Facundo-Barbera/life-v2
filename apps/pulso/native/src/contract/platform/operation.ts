import type { z } from "zod";
import type { Domain } from "./domains";

export type Access = "read" | "write";
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * One operation of the external API, defined once. The engine attaches a
 * handler; HTTP (`/api/v1/<domain><path>`), OpenAPI, MCP, the in-app agent's
 * tools and the typed client are all generated from these specs.
 *
 * `path` is relative to the domain (`/accounts/{id}` → `/api/v1/dinero/accounts/{id}`);
 * `{name}` segments are input fields. The rest of the input travels as query
 * parameters on GET/DELETE and as a JSON body otherwise.
 */
export type OperationSpec<I extends z.ZodObject = z.ZodObject, O extends z.ZodType = z.ZodType> = {
  /** snake_case, unique across every domain; also the MCP tool name. It is the key in OPERATIONS. */
  name: string;
  domain: Domain;
  /** Written for a model: what it does, units, when to use it. */
  description: string;
  access: Access;
  method: HttpMethod;
  path: string;
  input: I;
  output: O;
  /** Change type published on `/api/v1/events` after a successful write, e.g. `transaction.created`. Without one, the store publishes itself. */
  event?: string;
  /**
   * Private beyond the rest (Salud's Sustancias): only this Mac and tokens granted the sensitive capability
   * see it; for anyone else it does not exist (not listed, 404, no events). The asistente has it only when Ajustes allows.
   */
  sensitive?: boolean;
};

/** A domain's `op()`: the spec without its domain, which the domain's own `operation.ts` binds once. */
export const domainOp =
  (domain: Domain) =>
  <I extends z.ZodObject, O extends z.ZodType>(spec: Omit<OperationSpec<I, O>, "domain">): OperationSpec<I, O> => ({ ...spec, domain });

export const pathParams = (path: string): string[] => [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);

/** Methods whose non-path input goes in the query string. */
export const usesQuery = (method: HttpMethod): boolean => method === "GET" || method === "DELETE";

/** The path under `/api/v1`: the domain, then the operation's own path. */
export const routePath = (spec: Pick<OperationSpec, "domain" | "path">): string => `/${spec.domain}${spec.path}`;
