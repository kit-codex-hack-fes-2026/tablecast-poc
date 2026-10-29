import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { onboardingOptions } from "../features/store/onboarding-query";
import { StoreOnboarding } from "../features/store/store-onboarding";
export const Route = createFileRoute("/admin/stores/$storeId/onboarding")({
  staticData: { document: { title: "onboarding_title", description: "onboarding_description" } },
  validateSearch: z.object({ draftId: z.string().optional() }),
  loaderDeps: ({ search }) => ({ draftId: search.draftId }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(onboardingOptions(params.storeId, deps.draftId)),
  component: Page,
});
function Page() {
  return <StoreOnboarding draftId={Route.useSearch().draftId} />;
}
