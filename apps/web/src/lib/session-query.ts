import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "./api";

export const loadInitial = (
  storeId?: string,
  defaultFloor?: "true",
  view?: "catalog" | "home",
  signal?: AbortSignal,
) =>
  parseResponse(
    rpc.api.admin.initial.$get({ query: { storeId, defaultFloor, view } }, { init: { signal } }),
  );
export const sessionOptions = queryOptions({
  queryKey: ["tablecast-session"],
  queryFn: ({ signal }) =>
    parseResponse(rpc.api.account["auth-state"].$get({}, { init: { signal } })),
});
