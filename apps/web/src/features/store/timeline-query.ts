import type { TimelinePage } from "@tablecast/api/schema";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse, rpc } from "../../lib/api";

const firstPage: TimelinePage["nextCursor"] = null;
export const timelineOptions = (storeId: string, date: string) =>
  infiniteQueryOptions({
    queryKey: ["tablecast-floor-timeline", storeId, date],
    queryFn: ({
      pageParam,
      signal,
    }: {
      pageParam: TimelinePage["nextCursor"];
      signal: AbortSignal;
    }) =>
      parseResponse(
        rpc.api.admin.stores[":storeId"].timeline.$get(
          {
            param: { storeId },
            query: {
              date,
              limit: "100",
              ...(pageParam
                ? { beforeOpenedAt: String(pageParam.openedAt), beforeId: pageParam.id }
                : {}),
            },
          },
          { init: { signal } },
        ),
      ),
    initialPageParam: firstPage,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: 30_000,
  });
