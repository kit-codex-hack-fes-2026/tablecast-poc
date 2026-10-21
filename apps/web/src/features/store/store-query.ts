import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const loadStores = (signal?: AbortSignal) =>
  parseResponse(rpc.api.admin.stores.$get({}, { init: { signal } }));
export const storesOptions = queryOptions({
  queryKey: ["tablecast-stores"],
  queryFn: ({ signal }) => loadStores(signal),
});
