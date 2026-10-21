import { createFileRoute } from "@tanstack/react-router";
import { storeDate } from "../features/floor/floor-model";
import {
  statisticsOptions,
  statisticsRange,
  statisticsSearchSchema,
} from "../features/statistics/statistics-query";
import { StoreStatistics } from "../features/statistics/store-statistics";
import { storesOptions } from "../features/store/store-query";
import { getLocale } from "../paraglide/runtime.js";

export const Route = createFileRoute("/admin/stores/$storeId/statistics")({
  staticData: {
    document: { title: "statistics_title", description: "head_statistics_description" },
  },
  validateSearch: statisticsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    const stores = await context.queryClient.ensureQueryData(storesOptions);
    const store = stores.stores.find((item) => item.id === params.storeId);
    const today = storeDate(Date.now());
    const range = statisticsRange(deps, today);
    if (store && ["owner", "admin"].includes(store.role) && range) {
      const pending = context.queryClient.prefetchInfiniteQuery(
        statisticsOptions(store.id, range, deps.view, getLocale()),
      );
      // SSRは取得済み結果を転送し、クライアントのタブ操作は本文内の読込表示へ進める。
      if (import.meta.env.SSR) await pending;
    }
    return { today };
  },
  component: StatisticsRoute,
});
function StatisticsRoute() {
  const navigate = Route.useNavigate();
  return (
    <StoreStatistics
      search={Route.useSearch()}
      today={Route.useLoaderData().today}
      onNavigate={(search) => void navigate({ search, resetScroll: false })}
    />
  );
}
