import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const loadStores = (signal?: AbortSignal) =>
  parseResponse(rpc.api.admin.stores.$get({}, { init: { signal } }));
export const storesOptions = queryOptions({
  queryKey: ["tablecast-stores"],
  queryFn: ({ signal }) => loadStores(signal),
});
export const floorOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-admin", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].$get({ param: { storeId } }, { init: { signal } }),
      ),
    refetchInterval: 30_000,
  });
export const loadDevices = (storeId: string, signal?: AbortSignal) =>
  parseResponse(
    rpc.api.admin.stores[":storeId"].devices.$get({ param: { storeId } }, { init: { signal } }),
  );
export const devicesOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-devices", storeId],
    queryFn: ({ signal }) => loadDevices(storeId, signal),
  });
export const draftsOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-drafts", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].drafts.$get({ param: { storeId } }, { init: { signal } }),
      ),
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
