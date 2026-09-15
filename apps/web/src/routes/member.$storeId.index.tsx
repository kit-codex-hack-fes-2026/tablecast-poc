import { createFileRoute } from "@tanstack/react-router";
import { CustomerStore } from "../features/customer/customer-store";
import { customerVisitsOptions } from "../features/customer/customer-visit-query";
export const Route = createFileRoute("/member/$storeId/")({
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchInfiniteQuery(customerVisitsOptions(params.storeId));
  },
  component: CustomerStoreRoute,
});
function CustomerStoreRoute() {
  const { storeId } = Route.useParams();
  return <CustomerStore storeId={storeId} />;
}
