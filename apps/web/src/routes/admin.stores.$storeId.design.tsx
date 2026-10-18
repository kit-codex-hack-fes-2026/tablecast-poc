import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { StoreDesign } from "../features/store/store-design";
import { catalogOptions, draftOptions } from "../features/store/menu-query";
import { menuReviewSearchSchema } from "../features/store/menu-model";
export const Route = createFileRoute("/admin/stores/$storeId/design")({
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
