import type { TableState } from "@tablecast/api/schema";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ApiFailure, parseResponse, tableEndpoint, type TableEndpoint } from "../../lib/api";
import { latestTable } from "./table-cache";
export const tableKey = ["tablecast-table"];
export const tableQueryKey = (endpoint: TableEndpoint) =>
  endpoint.key === "table" ? tableKey : [...tableKey, endpoint.key];
export const tableOptions = (client: QueryClient, endpoint = tableEndpoint) =>
  queryOptions({
    queryKey: tableQueryKey(endpoint),
    queryFn: async ({ signal }) => {
      try {
        const result = await parseResponse(endpoint.client.index.$get({}, { init: { signal } }));
        return latestTable(client.getQueryData<TableState | null>(tableQueryKey(endpoint)), result);
      } catch (error) {
        if (error instanceof ApiFailure && error.status === 401 && endpoint.key === "table")
          return null;
        throw error;
      }
    },
    refetchInterval: (query) => (query.state.data === null ? 5000 : false),
  });
export const tableCatalogOptions = (
  storeId: string,
  configVersion: number,
  endpoint = tableEndpoint,
) =>
  queryOptions({
    queryKey: ["tablecast-catalog", storeId, configVersion, endpoint.key],
    queryFn: ({ signal }) => parseResponse(endpoint.client.catalog.$get({}, { init: { signal } })),
  });

export { demoTableEndpoint } from "../../lib/api";
