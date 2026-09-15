import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";

export const customerMembershipsOptions = queryOptions({
  queryKey: ["tablecast-customer", "memberships"],
  queryFn: ({ signal }) =>
    parseResponse(rpc.api.customer.memberships.$get({}, { init: { signal } })),
});
export const customerStoreOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-customer", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.customer.stores[":storeId"].$get({ param: { storeId } }, { init: { signal } }),
      ),
  });
