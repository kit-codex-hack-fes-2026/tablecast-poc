import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const couponRulesOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-coupon-rules", storeId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons.rules.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
export const issuedCouponsOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-coupon-issued", storeId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons.issued.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20" } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
export const rewardMembersOptions = (storeId: string, query: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-reward-members", storeId, query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].coupons.members.$get(
          { param: { storeId }, query: { beforeId: pageParam, limit: "20", query } },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
export const visitCouponsOptions = (storeId: string, sessionId: string) =>
  queryOptions({
    queryKey: ["tablecast-table-detail", storeId, sessionId, "coupons"],
    refetchInterval: 5000,
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].coupons.$get(
          { param: { storeId, id: sessionId } },
          { init: { signal } },
        ),
      ),
  });
