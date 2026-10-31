import type { Catalog } from "@tablecast/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const catalogOptions = (storeId: string, configVersion?: number) =>
  queryOptions({
    queryKey: [
      "tablecast-admin-catalog",
      storeId,
      ...(configVersion === undefined ? [] : [configVersion]),
    ],
    queryFn: ({ signal }): Promise<Catalog> =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].catalog.$get({ param: { storeId } }, { init: { signal } }),
      ),
  });
