import { useInfiniteQuery } from "@tanstack/react-query";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

import { parseResponse, rpc } from "../../lib/api";
import { ActivityLog } from "./events";

export function SessionActivity({
  storeId,
  sessionId,
  closed,
}: {
  storeId: string;
  sessionId: string;
  closed: boolean;
}) {
  const { t } = useI18n();
  const activity = useInfiniteQuery({
    queryKey: ["tablecast-session-events", storeId, sessionId],
    queryFn: ({ pageParam, signal }: { pageParam: number | null; signal: AbortSignal }) => {
      return parseResponse(
        rpc.api.admin.stores[":storeId"].tables[":id"].events.$get(
          {
            param: { storeId, id: sessionId },
            query: { limit: "100", ...(pageParam !== null ? { before: String(pageParam) } : {}) },
          },
          { init: { signal } },
        ),
      );
    },
    initialPageParam: null,
    getNextPageParam: (page) => page.nextBefore,
    refetchInterval: closed ? false : 5000,
  });
  return (
    <>
      <ErrorNotice
        error={activity.error}
        onRetry={() =>
          void (activity.isFetchNextPageError ? activity.fetchNextPage() : activity.refetch())
        }
      />
      {activity.isPending && <LoadingState />}
      {activity.hasNextPage && (
        <Button
          variant="outline"
          type="button"
          className="mb-4"
          disabled={activity.isFetching}
          onClick={() => void activity.fetchNextPage()}
        >
          {activity.isFetchingNextPage ? t("common_loading") : t("admin_older_events")}
        </Button>
      )}
      {activity.data && (
        <ActivityLog
          events={[...activity.data.pages].toReversed().flatMap((page) => page.events)}
          includeDate
        />
      )}
    </>
  );
}
