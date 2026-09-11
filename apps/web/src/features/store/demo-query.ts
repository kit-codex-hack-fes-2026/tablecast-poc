import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const demoOptions = (storeId: string, demoId: string) =>
  queryOptions({
    queryKey: ["tablecast-demo", storeId, demoId],
    queryFn: ({ signal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].demo[":demoId"].$get(
          { param: { storeId, demoId } },
          { init: { signal } },
        ),
      ),
  });
