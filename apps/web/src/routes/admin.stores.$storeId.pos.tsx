import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { menuReviewSearchSchema } from "../features/configuration/menu-model";
import { draftOptions } from "../features/configuration/menu-query";
import { posSettingsOptions } from "../features/pos/pos-query";
import { StorePos } from "../features/pos/store-pos";

export const Route = createFileRoute("/admin/stores/$storeId/pos")({
  staticData: { document: { title: "pos_title", description: "pos_intro" } },
  validateSearch: menuReviewSearchSchema.extend({ draftId: z.string().min(1).optional() }),
  loaderDeps: ({ search }) => ({ draftId: search.draftId }),
  loader: async ({ context, params, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(posSettingsOptions(params.storeId, deps.draftId)),
      ...(deps.draftId
        ? [context.queryClient.ensureQueryData(draftOptions(params.storeId, deps.draftId))]
        : []),
    ]);
  },
  component: Page,
});
function Page() {
  return <StorePos draftId={Route.useSearch().draftId} />;
}
