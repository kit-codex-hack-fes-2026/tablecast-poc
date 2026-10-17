import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CustomerJoin } from "../features/customer/customer-join";
export const Route = createFileRoute("/member/join")({
  validateSearch: z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) }),
  component: CustomerJoinRoute,
});
function CustomerJoinRoute() {
  const { code } = Route.useSearch();
  return <CustomerJoin key={code} code={code} />;
}
