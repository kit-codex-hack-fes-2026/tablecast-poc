import { queryOptions } from "@tanstack/react-query";
import { authClient } from "./auth-client";
export const sessionOptions = queryOptions({
  queryKey: ["tablecast-session"],
  queryFn: async ({ signal }) => {
    const result = await authClient.getSession({ fetchOptions: { signal } });
    if (result.error) throw new Error(result.error.message ?? "SESSION_REQUEST_FAILED");
    return result.data;
  },
});
