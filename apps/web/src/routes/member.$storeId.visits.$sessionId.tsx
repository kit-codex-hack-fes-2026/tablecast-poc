import { createFileRoute } from "@tanstack/react-router";
import { customerVisitOptions } from "../features/customer/customer-visit-query";
import { CustomerVisit } from "../features/customer/customer-visits";
export const Route = createFileRoute("/member/$storeId/visits/$sessionId")({
  staticData: { document: { title: "head_visit", description: "head_customer_visit_description" } },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(customerVisitOptions(params.storeId, params.sessionId)),
  component: CustomerVisitRoute,
});
function CustomerVisitRoute() {
  const { storeId, sessionId } = Route.useParams();
  return <CustomerVisit storeId={storeId} sessionId={sessionId} />;
}
