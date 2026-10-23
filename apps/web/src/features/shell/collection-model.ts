import type { SortingState } from "@tanstack/react-table";
import { z } from "zod";

/** 一覧の表示条件。業務APIのqueryとは分け、routeのvalidateSearchへ合成する。 */
export const collectionSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  sort: z.string().optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
});

export function collectionSearchKeys(prefix = "") {
  return prefix
    ? { q: `${prefix}Q`, sort: `${prefix}Sort`, page: `${prefix}Page` }
    : { q: "q", sort: "sort", page: "page" };
}

/** 同じrouteに複数の一覧がある場合だけ、表ごとの表示条件名を使う。 */
export function collectionSearchFields(prefix: string) {
  const keys = collectionSearchKeys(prefix);
  return {
    [keys.q]: collectionSearchSchema.shape.q,
    [keys.sort]: collectionSearchSchema.shape.sort,
    [keys.page]: collectionSearchSchema.shape.page,
  };
}

export function parseCollectionSort(
  value: string | undefined,
  sortIds: readonly string[],
): SortingState {
  const match = value?.match(/^(.+):(asc|desc)$/);
  return match?.[1] && sortIds.includes(match[1])
    ? [{ id: match[1], desc: match[2] === "desc" }]
    : [];
}

/** OAuthへ戻す文字列のエンコードと順序を保ち、一覧表示専用のqueryだけを除く。 */
export function withoutCollectionSearch(search: string, prefix: string) {
  const keys = new Set(Object.values(collectionSearchKeys(prefix)));
  return search
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => {
      const key = new URLSearchParams(part).keys().next().value;
      return key === undefined || !keys.has(key);
    })
    .join("&");
}
