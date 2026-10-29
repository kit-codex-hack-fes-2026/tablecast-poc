import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";

export const posSettingsOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-pos-settings", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].pos.$get({ param: { storeId } }, { init: { signal } }),
      ),
  });

export const posCatalogOptions = (storeId: string, locationId: string) =>
  queryOptions({
    queryKey: ["tablecast-pos-catalog", storeId, locationId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].pos.catalog.$get(
          { param: { storeId }, query: locationId ? { locationId } : {} },
          { init: { signal } },
        ),
      ),
  });

export const posCheckoutOptions = (storeId: string, sessionId: string) =>
  queryOptions({
    queryKey: ["tablecast-table-detail", storeId, sessionId, "pos"],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].pos.$get(
          { param: { storeId, id: sessionId } },
          { init: { signal } },
        ),
      ),
  });

export const posDevicesOptions = (storeId: string, locationId: string) =>
  queryOptions({
    queryKey: ["tablecast-pos-devices", storeId, locationId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].pos.devices.$get(
          { param: { storeId }, query: { locationId } },
          { init: { signal } },
        ),
      ),
  });
