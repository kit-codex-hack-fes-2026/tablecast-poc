import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "../../lib/api";
import { parseResponse, rpc } from "../../lib/api";
export type Device = InferResponseType<
  (typeof rpc.api.admin.stores)[":storeId"]["devices"]["$get"],
  200
>["devices"][number];
export const devicesOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-devices", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].devices.$get({ param: { storeId } }, { init: { signal } }),
      ),
  });
