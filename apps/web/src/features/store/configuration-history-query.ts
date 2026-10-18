import type { ConfigurationHistoryPage } from "@tablecast/api/schema";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { parseResponse, rpc } from "../../lib/api";

export const configurationHistorySearchSchema = z.object({
  version: z.coerce.number().int().positive().optional().catch(undefined),
});
export const configurationHistoryOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-configuration-history", storeId],
    queryFn: ({
      pageParam,
      signal,
    }: {
      pageParam: ConfigurationHistoryPage["nextCursor"];
      signal: AbortSignal;
    }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].configuration.history.$get(
          {
            param: { storeId },
            query: pageParam ? { ...pageParam, beforeAt: String(pageParam.beforeAt) } : {},
          },
          { init: { signal } },
        ),
      ),
    initialPageParam: null,
    getNextPageParam: (page) => page.nextCursor,
  });
export const configurationReleaseOptions = (storeId: string, version: number) =>
  queryOptions({
    queryKey: ["tablecast-configuration-release", storeId, version],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].configuration.releases[":version"].$get(
          { param: { storeId, version: String(version) } },
          { init: { signal } },
        ),
      ),
  });
