import type { TableState } from "@tablecast/api/schema";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ApiFailure, parseResponse, rpc } from "../../lib/api";
import { latestTable } from "./table-cache";
export const tableKey = ["tablecast-table"];
export const tableOptions = (client: QueryClient) =>
  queryOptions({
    queryKey: tableKey,
    queryFn: async ({ signal }) => {
      try {
        const result = await parseResponse(rpc.api.table.$get({}, { init: { signal } }));
        return latestTable(client.getQueryData<TableState | null>(tableKey), result);
      } catch (error) {
        if (error instanceof ApiFailure && error.status === 401) return null;
        throw error;
      }
    },
    refetchInterval: (query) => (query.state.data === null ? 5000 : false),
  });
export const tableCatalogOptions = (storeId: string, configVersion: number) =>
  queryOptions({
    queryKey: ["tablecast-catalog", storeId, configVersion],
    queryFn: ({ signal }) => parseResponse(rpc.api.table.catalog.$get({}, { init: { signal } })),
  });
