import { pointVisitOptions } from "../features/store/point-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { TableDetail } from "../features/store/table-detail";
import { catalogOptions } from "../features/store/menu-query";
import { tableDetailOptions } from "../features/store/store-query";
import { floorSearchSchema } from "../features/store/floor-model";
export const Route = createFileRoute("/admin/stores/$storeId/visits/$sessionId")({
  staticData: { document: { title: "head_visit", description: "head_visit_description" } },
  validateSearch: z.object({
    floorView: floorSearchSchema.shape.view,
    floorDate: floorSearchSchema.shape.date,
    floorFilter: floorSearchSchema.shape.filter,
    floorQ: floorSearchSchema.shape.q,
    floorSort: floorSearchSchema.shape.sort,
    floorZoom: floorSearchSchema.shape.zoom,
    view: z
      .enum(["overview", "logs", "orders", "billing", "diagnostics"])
      .default("overview")
      .catch("overview"),
  }),
  loaderDeps: ({ search }) => ({ view: search.view }),
  loader: async ({ context, params, deps }) => {
    const [table] = await Promise.all([
      context.queryClient.ensureQueryData(tableDetailOptions(params.storeId, params.sessionId)),
      deps.view === "billing"
        ? context.queryClient.ensureQueryData(pointVisitOptions(params.storeId, params.sessionId))
        : undefined,
    ]);
    if (deps.view === "orders")
      await context.queryClient.ensureQueryData(
        catalogOptions(params.storeId, table.configVersion),
      );
    return { document: { name: table.tableName } };
  },
  component: Page,
});
function Page() {
  const { storeId, sessionId } = Route.useParams();
  const { view, floorView, floorDate, floorFilter, floorQ, floorSort, floorZoom } =
    Route.useSearch();
  const navigate = useNavigate();
  return (
    <TableDetail
      key={sessionId}
      storeId={storeId}
      tableId={sessionId}
      view={view}
      floorSearch={
        floorView || floorDate || floorFilter || floorQ || floorSort || floorZoom
          ? {
              view: floorView,
              date: floorDate,
              filter: floorFilter,
              q: floorQ,
              sort: floorSort,
              zoom: floorZoom,
            }
          : undefined
      }
      onViewChange={(next) =>
        void navigate({
          to: ".",
          search: (previous) => ({ ...previous, view: next }),
          replace: true,
        })
      }
    />
  );
}
