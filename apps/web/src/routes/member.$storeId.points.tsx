import { createFileRoute } from "@tanstack/react-router";
import { CustomerPoints } from "../features/customer/customer-points";
import { customerPointsOptions } from "../features/customer/customer-points-query";
export const Route = createFileRoute("/member/$storeId/points")({
  loader: ({ context, params }) =>
    context.queryClient.ensureInfiniteQueryData(customerPointsOptions(params.storeId)),
  component: Page,
});
function Page() {
  const { storeId } = Route.useParams();
  return <CustomerPoints storeId={storeId} />;
}
