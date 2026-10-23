import { createFileRoute } from "@tanstack/react-router";
import { catalogOptions } from "../features/catalog/catalog-query";
import { DraftPage } from "../features/configuration/configuration-draft-page";
import { menuReviewSearchSchema } from "../features/configuration/menu-model";
import { draftOptions } from "../features/configuration/menu-query";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/$draftId")({
  staticData: { document: { title: "workflow_review", description: "head_review_description" } },
  validateSearch: menuReviewSearchSchema,
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
  return <DraftPage key={draftId} draftId={draftId} search={Route.useSearch()} />;
}
