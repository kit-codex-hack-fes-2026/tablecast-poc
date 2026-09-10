import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { TableDetail } from "../features/store/table-detail";
import { tableDetailOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId/visits/$sessionId")({
  validateSearch: z.object({
    view: z
      .enum(["overview", "logs", "orders", "billing", "diagnostics"])
      .default("overview")
      .catch("overview"),
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(tableDetailOptions(params.storeId, params.sessionId));
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
