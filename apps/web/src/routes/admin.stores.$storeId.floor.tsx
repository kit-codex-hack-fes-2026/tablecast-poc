import { createFileRoute } from "@tanstack/react-router";
import { Floor, FloorPending } from "../features/store/floor";
import { floorOptions } from "../features/store/store-query";
import { floorSearchSchema, storeDate } from "../features/store/floor-model";
import { timelineOptions } from "../features/store/timeline-query";
export const Route = createFileRoute("/admin/stores/$storeId/floor")({
  staticData: { document: { title: "admin_live", description: "head_floor_description" } },
  validateSearch: floorSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps, cause }) => {
    await context.queryClient.ensureQueryData(floorOptions(params.storeId));
    const initialNow =
      context.queryClient.getQueryState(floorOptions(params.storeId).queryKey)?.dataUpdatedAt ??
      Date.now();
    const date = deps.date ?? storeDate(initialNow);
    if (deps.view === "timeline" && cause !== "stay") {
      // 初回はSSRへ含め、日付変更では既存の操作欄とフォーカスを保つ。
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
      {...search}
      date={data.date}
      initialNow={data.initialNow}
      onNavigate={(next, options) =>
        void navigate({ search: next, resetScroll: false, replace: options?.replace })
      }
    />
  );
}
