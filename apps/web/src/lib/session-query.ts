import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "./api";
export const loadInitial = (storeId?: string, signal?: AbortSignal) =>
  parseResponse(rpc.api.admin.initial.$get({ query: { storeId } }, { init: { signal } }));
export const sessionOptions = queryOptions({
  queryKey: ["tablecast-session"],
  queryFn: async ({ signal }) => (await loadInitial(undefined, signal)).session,
});
