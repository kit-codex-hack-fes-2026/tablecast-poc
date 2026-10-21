import { createFileRoute } from "@tanstack/react-router";
import { LoadingState } from "../components/loading-state";
import { storeDate } from "../features/store/floor-model";
import { catalogOptions } from "../features/store/menu-query";
import { StoreHome } from "../features/store/store-home";
import { devicesOptions, floorOptions, storesOptions } from "../features/store/store-query";
import { statisticsOptions } from "../features/store/statistics-query";
import { getLocale } from "../paraglide/runtime.js";

export const Route = createFileRoute("/admin/stores/$storeId/")({
  staticData: { document: { title: "home_title", description: "head_home_description" } },
  loader: async ({ context, params }) => {
    const { queryClient } = context;
    const stores = await queryClient.ensureQueryData(storesOptions);
    const store = stores.stores.find((item) => item.id === params.storeId);
    const today = storeDate(Date.now());
    if (!store) return { today };
    await Promise.all([
      queryClient.ensureQueryData(floorOptions(store.id)),
      ...(["owner", "admin"].includes(store.role)
        ? [
            queryClient.prefetchInfiniteQuery(
              statisticsOptions(store.id, { from: today, to: today }, "summary", getLocale()),
            ),
            queryClient.prefetchQuery(catalogOptions(store.id)),
            queryClient.prefetchQuery(devicesOptions(store.id)),
          ]
        : []),
    ]);
    return { today };
  },
  pendingComponent: LoadingState,
  component: HomeRoute,
});
function HomeRoute() {
  return <StoreHome today={Route.useLoaderData().today} />;
}
