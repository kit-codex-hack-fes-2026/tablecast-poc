import type { ConfigDraft, Locale } from "@tablecast/api/schema";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const configurationImageUploadKey = (storeId: string) =>
  ["tablecast-configuration-image-upload", storeId] as const;
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
    queryFn: ({ pageParam, signal }: { pageParam: null | string; signal: AbortSignal }) =>
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

export const draftChoicesOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-draft-choices", storeId],
    initialPageParam: null,
    queryFn: ({
      signal,
      pageParam,
    }: {
      pageParam: null | { beforeId: string; beforeUpdatedAt: number };
      signal: AbortSignal;
    }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].drafts.choices.$get(
          {
            param: { storeId },
            query: pageParam
              ? { beforeUpdatedAt: String(pageParam.beforeUpdatedAt), beforeId: pageParam.beforeId }
              : {},
          },
          { init: { signal } },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
