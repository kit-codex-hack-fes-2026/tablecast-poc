import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const customerMemoriesOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-customer", storeId, "memories"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].memories.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
export const customerConsumptionOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-customer", storeId, "consumption"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].consumption.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
