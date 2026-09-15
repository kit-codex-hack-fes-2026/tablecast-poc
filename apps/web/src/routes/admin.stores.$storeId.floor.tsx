import { createFileRoute } from "@tanstack/react-router";
import { Floor, FloorPending } from "../features/store/floor";
import { floorOptions } from "../features/store/store-query";
import { floorSearchSchema, storeDate } from "../features/store/floor-model";
import { timelineOptions } from "../features/store/timeline-query";
export const Route = createFileRoute("/admin/stores/$storeId/floor")({
  validateSearch: floorSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await context.queryClient.ensureQueryData(floorOptions(params.storeId));
    const initialNow =
      context.queryClient.getQueryState(floorOptions(params.storeId).queryKey)?.dataUpdatedAt ??
      Date.now();
    const date = deps.date ?? storeDate(initialNow);
    if (deps.view === "timeline") {
      // 失敗はqueryに保持し、日付操作と既存のフロア集計を維持する。
      await context.queryClient.prefetchInfiniteQuery(timelineOptions(params.storeId, date));
    }
    return { initialNow, date };
  },
  pendingComponent: FloorPending,
  component: FloorRoute,
});

function FloorRoute() {
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <Floor
      view={search.view}
      date={data.date}
      initialNow={data.initialNow}
      onNavigate={(next) => void navigate({ search: next, resetScroll: false })}
    />
  );
}
