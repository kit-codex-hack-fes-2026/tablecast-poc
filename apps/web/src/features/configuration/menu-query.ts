import type { ConfigDraft, Configuration, Locale } from "@tablecast/api/schema";
import {
  infiniteQueryOptions,
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
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

/** 応答先の店舗を明示し、画面の編集状態と独立して下書きcacheを更新する。 */
export function receiveDraft(client: QueryClient, storeId: string, draft: ConfigDraft) {
  client.setQueryData(draftOptions(storeId, draft.id).queryKey, draft);
  for (const key of ["tablecast-drafts", "tablecast-draft-choices"])
    void client.invalidateQueries({ queryKey: [key, storeId] });
}

/** 保存前の画面固有検証と、保存後の入力resetを共通cache更新の前後へ置く。 */
export function saveDraftOptions(
  client: QueryClient,
  {
    storeId,
    id,
    expectedVersion,
    validate,
    onSaved,
  }: {
    expectedVersion: number;
    id: string;
    onSaved: (draft: ConfigDraft) => void;
    storeId: string;
    validate?: (configuration: Configuration) => Configuration;
  },
) {
  return mutationOptions({
    mutationFn: (configuration: Configuration) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].drafts[":id"].$put({
          param: { storeId, id },
          json: {
            expectedVersion,
            configuration: validate?.(configuration) ?? configuration,
            instructionFormatVersion: 1,
          },
        }),
      ),
    onSuccess: (next) => {
      receiveDraft(client, storeId, next);
      onSaved(next);
    },
  });
}
