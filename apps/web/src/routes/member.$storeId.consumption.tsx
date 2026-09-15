import { createFileRoute } from "@tanstack/react-router";
import { CustomerConsumption } from "../features/customer/customer-consumption";
import { customerConsumptionOptions } from "../features/customer/customer-memory-query";
export const Route = createFileRoute("/member/$storeId/consumption")({
  loader: ({ context, params }) =>
    context.queryClient.ensureInfiniteQueryData(customerConsumptionOptions(params.storeId)),
  component: Page,
});
function Page() {
  const { storeId } = Route.useParams();
  return <CustomerConsumption storeId={storeId} />;
}
