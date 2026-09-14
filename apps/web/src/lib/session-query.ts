import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "./api";
import { authClient } from "./auth-client";
export const loadInitial = (storeId?: string, defaultFloor?: "true", view?: "catalog") =>
  parseResponse(rpc.api.admin.initial.$get({ query: { storeId, defaultFloor, view } }));
export const sessionOptions = queryOptions<
  Awaited<ReturnType<typeof loadInitial>>["session"] | typeof authClient.$Infer.Session
>({
  queryKey: ["tablecast-session"],
  queryFn: async ({ signal }) => {
    const result = await authClient.getSession({ fetchOptions: { signal } });
    if (result.error) throw new Error(result.error.message ?? "SESSION_REQUEST_FAILED");
    return result.data;
  },
});
