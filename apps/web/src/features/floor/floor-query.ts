import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const floorOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-admin", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].$get({ param: { storeId } }, { init: { signal } }),
      ),
    refetchInterval: 30_000,
  });
export const tableDetailOptions = (storeId: string, tableId: string) =>
  queryOptions({
    queryKey: ["tablecast-table-detail", storeId, tableId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].$get(
          { param: { storeId, id: tableId } },
          { init: { signal } },
        ),
      ),
    refetchInterval: (query) => (query.state.data?.status === "closed" ? false : 5000),
  });
