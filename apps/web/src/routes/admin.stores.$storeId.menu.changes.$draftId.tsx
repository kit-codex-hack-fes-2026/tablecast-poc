import { createFileRoute } from "@tanstack/react-router";
import { DraftPage } from "../features/store/settings-drafts";
import { catalogOptions, draftOptions } from "../features/store/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(draftOptions(params.storeId, params.draftId)),
      context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
    ]);
  },
  component: Page,
});
function Page() {
  const { draftId } = Route.useParams();
  return <DraftPage key={draftId} draftId={draftId} />;
}
