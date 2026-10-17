import { pointVisitOptions } from "../features/store/point-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { TableDetail } from "../features/store/table-detail";
import { catalogOptions } from "../features/store/menu-query";
import { tableDetailOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/visits/$sessionId")({
  validateSearch: z.object({
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
  },
  component: Page,
});
function Page() {
  const { storeId, sessionId } = Route.useParams();
  const { view } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <TableDetail
      key={sessionId}
      storeId={storeId}
      tableId={sessionId}
      view={view}
      onViewChange={(next) => void navigate({ to: ".", search: { view: next }, replace: true })}
    />
  );
}
