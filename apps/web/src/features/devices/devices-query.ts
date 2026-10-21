import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const loadDevices = (storeId: string, signal?: AbortSignal) =>
  parseResponse(
    rpc.api.admin.stores[":storeId"].devices.$get({ param: { storeId } }, { init: { signal } }),
  );
export const devicesOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-devices", storeId],
    queryFn: ({ signal }) => loadDevices(storeId, signal),
  });
