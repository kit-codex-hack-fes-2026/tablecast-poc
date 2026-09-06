import { sessionEventsPageSchema } from "@tablecast/api/schema";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ErrorNotice } from "../../components/error-notice";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { api } from "../../lib/api";
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
      const search = new URLSearchParams({ limit: "100" });
      if (pageParam !== null) search.set("before", String(pageParam));
      return api(
        `/api/admin/stores/${storeId}/tables/${sessionId}/events?${search}`,
        { signal },
        sessionEventsPageSchema,
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
      {activity.isPending && <p>{t("common_loading")}</p>}
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
          events={[...activity.data.pages].reverse().flatMap((page) => page.events)}
          includeDate
        />
      )}
    </>
  );
}
