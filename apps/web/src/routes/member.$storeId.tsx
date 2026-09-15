import { createFileRoute, Outlet } from "@tanstack/react-router";
import { customerStoreOptions } from "../features/customer/customer-query";
export const Route = createFileRoute("/member/$storeId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(customerStoreOptions(params.storeId)),
  component: Outlet,
});
