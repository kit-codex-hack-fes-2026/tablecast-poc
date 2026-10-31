import { createFileRoute } from "@tanstack/react-router";
import { LoadingState } from "../components/loading-state";
import { storeDate } from "../features/floor/floor-model";
import { floorOptions } from "../features/floor/floor-query";
import { statisticsOptions } from "../features/statistics/statistics-query";
import { homeOptions } from "../features/store/home-query";
import { StoreHome } from "../features/store/store-home";
import { isStoreManager } from "../features/store/store-query";
import { getLocale } from "../paraglide/runtime.js";

export const Route = createFileRoute("/admin/stores/$storeId/")({
  staticData: { document: { title: "home_title", description: "head_home_description" } },
  loader: async ({ context }) => {
    const { queryClient } = context;
    const { store } = context;
    const today = storeDate(Date.now());
    if (!store) return { today };
    await Promise.all(
      isStoreManager(store)
        ? [
            queryClient.prefetchInfiniteQuery(
              statisticsOptions(store.id, { from: today, to: today }, "summary", getLocale()),
            ),
            queryClient.prefetchQuery(homeOptions(store.id)),
          ]
        : [],
    );
    await queryClient.ensureQueryData(floorOptions(store.id));
    return { today };
  },
  pendingComponent: LoadingState,
  component: HomeRoute,
});
function HomeRoute() {
  return <StoreHome today={Route.useLoaderData().today} />;
}
