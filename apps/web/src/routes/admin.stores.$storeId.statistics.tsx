import { createFileRoute } from "@tanstack/react-router";
import { storeDate } from "../features/store/floor-model";
import { StoreStatistics } from "../features/store/store-statistics";
import {
  statisticsOptions,
  statisticsRange,
  statisticsSearchSchema,
} from "../features/store/statistics-query";
import { storesOptions } from "../features/store/store-query";
import { getLocale } from "../paraglide/runtime.js";

export const Route = createFileRoute("/admin/stores/$storeId/statistics")({
  validateSearch: statisticsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    const stores = await context.queryClient.ensureQueryData(storesOptions);
    const store = stores.stores.find((item) => item.id === params.storeId);
    const today = storeDate(Date.now());
    const range = statisticsRange(deps, today);
    if (store && ["owner", "admin"].includes(store.role) && range) {
      await context.queryClient.prefetchInfiniteQuery(
        statisticsOptions(store.id, range, deps.view, getLocale()),
      );
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
