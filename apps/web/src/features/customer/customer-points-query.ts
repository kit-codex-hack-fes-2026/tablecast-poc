import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const customerPointsOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-customer", storeId, "points"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].points.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
