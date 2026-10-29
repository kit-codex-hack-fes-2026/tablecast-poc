import { createFileRoute } from "@tanstack/react-router";
import { customerCouponsOptions } from "../features/customer/customer-coupons-query";
import { customerVisitOptions } from "../features/customer/customer-visit-query";
import { CustomerVisit } from "../features/customer/customer-visits";
export const Route = createFileRoute("/member/$storeId/visits/$sessionId")({
  staticData: { document: { title: "head_visit", description: "head_customer_visit_description" } },
  loader: async ({ context, params }) => {
    const [visit] = await Promise.all([
      context.queryClient.ensureQueryData(customerVisitOptions(params.storeId, params.sessionId)),
      context.queryClient.prefetchInfiniteQuery(customerCouponsOptions(params.storeId)),
    ]);
    return visit;
  },
  component: CustomerVisitRoute,
});
function CustomerVisitRoute() {
  const { storeId, sessionId } = Route.useParams();
  return <CustomerVisit storeId={storeId} sessionId={sessionId} />;
}
