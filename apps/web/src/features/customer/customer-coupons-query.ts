import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const customerCouponsOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-customer", storeId, "coupons"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].coupons.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
export const customerExchangesOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-customer", storeId, "exchanges"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].coupons.exchanges.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
