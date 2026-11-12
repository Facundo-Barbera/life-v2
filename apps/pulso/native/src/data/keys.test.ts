import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { allKey, operationKey } from "./keys";

test("a write refreshes every Pulso query", async () => {
  const client = new QueryClient();
  client.setQueryData(operationKey("get_readiness", {}), 1);
  client.setQueryData(operationKey("get_nutrition_day", {}), 2);
  client.setQueryData(["other"], 3);
  await client.invalidateQueries({ queryKey: allKey });
  const stale = client.getQueryCache().getAll().filter((q) => q.isStale()).map((q) => q.queryKey[1]);
  expect(stale.sort()).toEqual(["get_nutrition_day", "get_readiness"]);
});
