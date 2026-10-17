import { createFileRoute } from "@tanstack/react-router";
import { CustomerMemberships } from "../features/customer/customer-memberships";
import { customerMembershipsOptions } from "../features/customer/customer-query";
export const Route = createFileRoute("/member/")({
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(customerMembershipsOptions),
  component: CustomerMemberships,
});
