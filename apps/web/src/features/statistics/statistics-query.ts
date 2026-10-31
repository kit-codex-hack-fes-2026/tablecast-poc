import {
  type Locale,
  statisticsQuerySchema,
  type StatisticsResult,
  storeDateSchema,
  storeTimeZone,
} from "@tablecast/api/schema";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { parseResponse, rpc } from "../../lib/api";
import { moveDate } from "../floor/floor-model";
import { collectionSearchFields } from "../shell/collection-model";

export const statisticsSearchSchema = z.object({
  ...collectionSearchFields("products"),
  ...collectionSearchFields("modifiers"),
  period: z.enum(["today", "week", "month", "custom"]).default("today").catch("today"),
  from: storeDateSchema.optional().catch(undefined),
  to: storeDateSchema.optional().catch(undefined),
  view: statisticsQuerySchema.shape.view.catch("summary"),
});
export type StatisticsSearch = z.infer<typeof statisticsSearchSchema>;
export function statisticsPeriod(period: StatisticsSearch["period"], today: string) {
  return {
    from: moveDate(today, period === "week" ? -6 : period === "month" ? -29 : 0),
    to: today,
  };
}
export function statisticsRange(search: StatisticsSearch, today: string) {
  const defaults = statisticsPeriod(search.period, today);
  const from = search.from ?? defaults.from;
  const to = search.to ?? defaults.to;
  return from <= to ? { from, to } : null;
}
export const statisticsOptions = (
  storeId: string,
  range: { from: string; to: string },
  view: StatisticsSearch["view"],
  locale: Locale,
) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-statistics", storeId, range.from, range.to, view, locale],
    queryFn: ({
      pageParam,
      signal,
    }: {
      pageParam: StatisticsResult["nextCursor"];
      signal: AbortSignal;
    }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].statistics.$get(
          {
            param: { storeId },
            query: {
              from: `${range.from}T00:00:00+09:00`,
              to: `${moveDate(range.to, 1)}T00:00:00+09:00`,
              timeZone: storeTimeZone,
              view,
              locale,
              limit: "30",
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
          { init: { signal } },
        ),
      ),
    initialPageParam: null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 60_000,
  });
