import type { Catalog, ConfigDraft } from "@tablecast/api/schema";
import { queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const catalogOptions = (storeId: string) =>
  queryOptions({
    queryKey: ["tablecast-admin-catalog", storeId],
    queryFn: ({ signal }): Promise<Catalog> =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].catalog.$get({ param: { storeId } }, { init: { signal } }),
      ),
  });
export const draftOptions = (storeId: string, id: string) =>
  queryOptions({
    queryKey: ["tablecast-draft", storeId, id],
    queryFn: ({ signal }): Promise<ConfigDraft> =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].drafts[":id"].$get(
          { param: { storeId, id } },
          { init: { signal } },
        ),
      ),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
