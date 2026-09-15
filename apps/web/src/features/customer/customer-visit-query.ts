import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";

export const customerVisitOptions = (storeId: string, sessionId: string) =>
  queryOptions({
    queryKey: ["tablecast-customer", storeId, "visits", sessionId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].visits[":sessionId"].$get(
          { param: { storeId, sessionId } },
          { init: { signal } },
        ),
      ),
    refetchInterval: (query) => (query.state.data?.connected === false ? false : 5000),
  });
export const customerVisitsOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-customer", storeId, "visits"],
    initialPageParam: undefined as { beforeJoinedAt: string; beforeId: string } | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].visits.$get(
          { param: { storeId }, query: { ...pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export const customerOrdersOptions = (storeId: string, sessionId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-customer", storeId, "visits", sessionId, "orders"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].visits[":sessionId"].orders.$get(
          { param: { storeId, sessionId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextOrderId ?? undefined,
  });
