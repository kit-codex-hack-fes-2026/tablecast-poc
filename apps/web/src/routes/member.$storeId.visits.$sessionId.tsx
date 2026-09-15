import { createFileRoute } from "@tanstack/react-router";
import { CustomerVisit } from "../features/customer/customer-visits";
import { customerVisitOptions } from "../features/customer/customer-visit-query";
export const Route = createFileRoute("/member/$storeId/visits/$sessionId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(customerVisitOptions(params.storeId, params.sessionId)),
  component: CustomerVisitRoute,
});
function CustomerVisitRoute() {
  const { storeId, sessionId } = Route.useParams();
  return <CustomerVisit storeId={storeId} sessionId={sessionId} />;
}
