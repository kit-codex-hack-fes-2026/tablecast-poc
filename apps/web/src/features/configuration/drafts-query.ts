import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const draftsOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-drafts", storeId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].drafts.$get({ param: { storeId } }, { init: { signal } }),
      ),
  });
