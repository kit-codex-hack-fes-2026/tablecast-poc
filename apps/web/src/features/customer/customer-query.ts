import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";

export const customerMembershipsOptions = infiniteQueryOptions({
  queryKey: ["tablecast-customer", "memberships"],
  initialPageParam: undefined as { beforeJoinedAt: string; beforeId: string } | undefined,
  queryFn: ({ pageParam, signal }) =>
    parseResponse(
      rpc.api.customer.memberships.$get(
        { query: { ...pageParam, limit: "100" } },
        { init: { signal } },
      ),
    ),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
export const customerStoreOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-customer", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].$get({ param: { storeId } }, { init: { signal } }),
      ),
  });
