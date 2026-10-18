import { createFileRoute } from "@tanstack/react-router";
import { CustomerStore } from "../features/customer/customer-store";
import { customerVisitsOptions } from "../features/customer/customer-visit-query";
import { customerPointsOptions } from "../features/customer/customer-points-query";
import { customerCouponsOptions } from "../features/customer/customer-coupons-query";
export const Route = createFileRoute("/member/$storeId/")({
  loader: async ({ context, params }) => {
    if (!context.customerStore.membership?.active) return;
    await Promise.all([
      context.queryClient.prefetchInfiniteQuery(customerPointsOptions(params.storeId)),
      context.queryClient.prefetchInfiniteQuery(customerCouponsOptions(params.storeId)),
      context.queryClient.prefetchInfiniteQuery(customerVisitsOptions(params.storeId)),
    ]);
  },
  component: CustomerStoreRoute,
});
function CustomerStoreRoute() {
  const { storeId } = Route.useParams();
  return <CustomerStore storeId={storeId} />;
}
