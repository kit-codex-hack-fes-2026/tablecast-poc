import { billingSearchSchema } from "../features/billing/billing-model";
import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "../features/billing/billing-page";
import { billingOptions } from "../features/billing/billing-query";
export const Route = createFileRoute("/billing/$organizationId")({
  validateSearch: billingSearchSchema,
  loaderDeps: ({ search }) => ({
    month: search.month,
    q: typeof search.usageQ === "string" ? search.usageQ : undefined,
  }),
  staticData: { document: { title: "billing_title", description: "head_billing_description" } },
  loader: async ({ context, params, deps }) => {
    const data = await context.queryClient.ensureInfiniteQueryData(
      billingOptions(params.organizationId, deps.month, deps.q),
    );
    return { ...data, document: { store: data.pages[0]?.organization.name } };
  },
  component: Page,
});
function Page() {
  const { organizationId } = Route.useParams();
  return <BillingPage key={organizationId} organizationId={organizationId} />;
}
