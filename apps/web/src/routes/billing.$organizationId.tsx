import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "../features/billing/billing-page";
import { billingOptions } from "../features/billing/billing-query";
export const Route = createFileRoute("/billing/$organizationId")({
  staticData: { document: { title: "billing_title", description: "head_billing_description" } },
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureInfiniteQueryData(
      billingOptions(params.organizationId),
    );
    return { ...data, document: { store: data.pages[0]?.organization.name } };
  },
  component: Page,
});
function Page() {
  const { organizationId } = Route.useParams();
  return <BillingPage key={organizationId} organizationId={organizationId} />;
}
