import { createFileRoute } from "@tanstack/react-router";
import { CustomerMemberships } from "../features/customer/customer-memberships";
import { customerMembershipsOptions } from "../features/customer/customer-query";
export const Route = createFileRoute("/member/")({
  staticData: { document: { title: "customer_title", description: "head_customer_description" } },
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(customerMembershipsOptions),
  component: CustomerMemberships,
});
