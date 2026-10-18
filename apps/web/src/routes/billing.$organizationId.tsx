import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "../features/billing/billing-page";
import { billingOptions } from "../features/billing/billing-query";
export const Route = createFileRoute("/billing/$organizationId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureInfiniteQueryData(billingOptions(params.organizationId)),
  component: Page,
});
function Page() {
  const { organizationId } = Route.useParams();
  return <BillingPage key={organizationId} organizationId={organizationId} />;
}
