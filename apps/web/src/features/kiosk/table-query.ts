import {
  type CoreState,
  coreStateSchema,
  eventsSchema,
  exchangeRatesSchema,
  type Order,
  type OrderPage,
  orderPageSchema,
  type TableEvent,
} from "@tablecast/api/schema";
import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { parseResponse, tableEndpoint, type TableEndpoint } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { useRealtime } from "../../lib/use-realtime";
import { affectedTableQueries, latestTable } from "./table-cache";
const baseTableKey = ["tablecast-table"];
export const tableQueryKey = (endpoint: TableEndpoint) =>
  endpoint.key === "table" ? baseTableKey : [...baseTableKey, endpoint.key];
export const tableOptions = (client: QueryClient, endpoint = tableEndpoint) =>
  queryOptions({
    queryKey: tableQueryKey(endpoint),
    queryFn: async ({ signal }) => {
      try {
        const result = await parseResponse(
          endpoint.client.index.$get({ query: { view: "core" } }, { init: { signal } }),
        );
        return latestTable(
          client.getQueryData<CoreState | null>(tableQueryKey(endpoint)),
          coreStateSchema.parse(result),
        );
      } catch (error) {
        if (apiError(error)?.status === 401 && endpoint.key === "table") return null;
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

export const exchangeRateOptions = (endpoint: TableEndpoint, sessionId: string) =>
  queryOptions({
    queryKey: ["tablecast-exchange-rates", endpoint.key, sessionId],
    queryFn: async ({ signal }) =>
      exchangeRatesSchema.parse(
        await parseResponse(endpoint.client["exchange-rates"].$get({}, { init: { signal } })),
      ),
    staleTime: "static",
    gcTime: Infinity,
    retry: false,
    retryOnMount: false,
  });

export const tableOrdersKey = (endpoint: TableEndpoint, sessionId: string) => [
  "tablecast-orders",
  endpoint.key,
  sessionId,
];
function firstOrderCursor(): OrderPage["nextCursor"] {
  return null;
}
const tableOrdersOptions = (endpoint: TableEndpoint, sessionId: string) =>
  infiniteQueryOptions({
    queryKey: tableOrdersKey(endpoint, sessionId),
    initialPageParam: firstOrderCursor(),
    queryFn: async ({ signal, pageParam }) =>
      orderPageSchema.parse(
        await parseResponse(
          endpoint.client.orders.$get(
            {
              query: {
                limit: "50",
                ...(pageParam
                  ? { beforeCreatedAt: String(pageParam.createdAt), beforeId: pageParam.id }
                  : {}),
              },
            },
            { init: { signal } },
          ),
        ),
      ),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: Infinity,
  });
const tableEventsKey = (endpoint: TableEndpoint, sessionId: string) => [
  "tablecast-events",
  endpoint.key,
  sessionId,
];
const tableEventsOptions = (endpoint: TableEndpoint, sessionId: string) =>
  queryOptions({
    queryKey: tableEventsKey(endpoint, sessionId),
    queryFn: async ({ signal }) =>
      eventsSchema.parse(
        await parseResponse(
          endpoint.client.events.$get(
            { query: { after: "0", tail: "true" } },
            { init: { signal } },
          ),
        ),
      ),
    staleTime: Infinity,
  });
function mergeTableEvents(
  current: undefined | { cursor: number; events: TableEvent[] },
  incoming: { cursor: number; events: TableEvent[] },
) {
  const events = new Map(
    (incoming.events.some((event) => event.kind === "demo.reset")
      ? []
      : (current?.events ?? [])
    ).map((event) => [event.cursor, event]),
  );
  for (const event of incoming.events) events.set(event.cursor, event);
  return {
    cursor: Math.max(current?.cursor ?? 0, incoming.cursor),
    events: [...events.values()].toSorted((a, b) => a.cursor - b.cursor).slice(-100),
  };
}

export function useTableResources(data: CoreState, endpoint: TableEndpoint, refresh: () => void) {
  const client = useQueryClient();
  const tableKey = tableQueryKey(endpoint);
  const history = useInfiniteQuery(tableOrdersOptions(endpoint, data.id));
  const orders = [
    ...new Map(
      (history.data?.pages.flatMap((page) => page.orders) ?? []).map((order) => [order.id, order]),
    ).values(),
  ];
  const eventQuery = useQuery(tableEventsOptions(endpoint, data.id));
  const events = eventQuery.data?.events ?? [];
  useRealtime(
    eventQuery.data ? "table" : undefined,
    // 初回の履歴取得が卓snapshotより新しくても、その間の状態変更を取りこぼさない。
    data.cursor,
    (update) => {
      if (!update) {
        refresh();
        return;
      }
      client.setQueryData(tableEventsOptions(endpoint, data.id).queryKey, (current) =>
        mergeTableEvents(current, update),
      );
      const current = client.getQueryData<CoreState>(tableKey);
      const affected = affectedTableQueries(
        update.events,
        current,
        client.getQueryData(tableOrdersOptions(endpoint, data.id).queryKey)?.pages[0],
      );
      if (affected.orders)
        void client.invalidateQueries(
          { queryKey: tableOrdersKey(endpoint, data.id) },
          { cancelRefetch: false },
        );
      if (affected.core) refresh();
    },
    endpoint.client,
  );

  function recordOrder(order: Order) {
    client.setQueryData(tableOrdersOptions(endpoint, data.id).queryKey, (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page, index) => ({
              ...page,
              orders:
                index === 0
                  ? [order, ...page.orders.filter((item) => item.id !== order.id)]
                  : page.orders.filter((item) => item.id !== order.id),
            })),
          }
        : current,
    );
    if (!client.getQueryData(tableOrdersKey(endpoint, data.id)))
      void client.invalidateQueries({ queryKey: tableOrdersKey(endpoint, data.id) });
  }
  return { history, orders, eventQuery, events, recordOrder };
}
