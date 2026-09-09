import type { HistoryPage } from "@tablecast/api/schema";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";
export const historyOptions = (storeId: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-visit-history", storeId],
    queryFn: ({ pageParam, signal }) => {
      return parseResponse(
        rpc.api.admin.stores[":storeId"].history.$get(
          {
            param: { storeId },
            query: {
              limit: "30",
              ...(pageParam
                ? { beforeClosedAt: String(pageParam.closedAt), beforeId: pageParam.id }
                : {}),
            },
          },
          { init: { signal } },
        ),
      );
    },
    initialPageParam: null as HistoryPage["nextCursor"],
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
