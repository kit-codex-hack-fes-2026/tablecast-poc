import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const pointPolicyOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-point-policy", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].points.policy.$get(
          { param: { storeId } },
          { init: { signal } },
        ),
      ),
  });
export const pointVisitOptions = (storeId: string, sessionId: string) =>
  queryOptions({
    queryKey: ["tablecast-table-detail", storeId, sessionId, "points"],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].points.$get(
          { param: { storeId, id: sessionId } },
          { init: { signal } },
        ),
      ),
  });
