import type { Catalog, ConfigDraft, Locale } from "@tablecast/api/schema";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const configurationImageUploadKey = (storeId: string) =>
  ["tablecast-configuration-image-upload", storeId] as const;
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

export const standardVoicesOptions = (storeId: string, language: Locale) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-standard-voices", storeId, language],
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].voices.$get(
          {
            param: { storeId },
            query: { locale: language, ...(pageParam !== null ? { pageToken: pageParam } : {}) },
          },
          { init: { signal } },
        ),
      ),
    initialPageParam: null,
    getNextPageParam: (page) => page.nextPageToken,
    retry: false,
    staleTime: 60_000,
  });
