import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { catalogOptions } from "../features/catalog/catalog-query";
import { menuReviewSearchSchema } from "../features/configuration/menu-model";
import { draftOptions } from "../features/configuration/menu-query";
import { StoreDesign } from "../features/configuration/store-design";
export const Route = createFileRoute("/admin/stores/$storeId/design")({
  staticData: { document: { title: "theme_title", description: "head_design_description" } },
  validateSearch: menuReviewSearchSchema.extend({ draftId: z.string().optional() }),
  loaderDeps: ({ search }) => ({ draftId: search.draftId }),
  loader: ({ context, params, deps }) =>
    deps.draftId
      ? context.queryClient.ensureQueryData(draftOptions(params.storeId, deps.draftId))
      : context.queryClient.ensureQueryData(catalogOptions(params.storeId)),
  component: Page,
});
function Page() {
  return <StoreDesign draftId={Route.useSearch().draftId} />;
}
