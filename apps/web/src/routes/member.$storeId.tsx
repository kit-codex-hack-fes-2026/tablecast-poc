import { createFileRoute } from "@tanstack/react-router";
import { CustomerStore } from "../features/customer/customer-store";
import { customerStoreOptions } from "../features/customer/customer-query";
export const Route = createFileRoute("/member/$storeId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(customerStoreOptions(params.storeId)),
  component: CustomerStoreRoute,
});

function CustomerStoreRoute() {
  const { storeId } = Route.useParams();
  return <CustomerStore storeId={storeId} />;
}
