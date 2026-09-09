import { createFileRoute } from "@tanstack/react-router";
import { DraftPage } from "../features/admin/settings-drafts";
import { catalogOptions, draftOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
      context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId)),
    ]);
  },
  component: Page,
});
function Page() {
  const { draftId } = Route.useParams();
  return <DraftPage draftId={draftId} />;
}
