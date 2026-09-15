import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { RouteError, RoutePending } from "../components/route-state";
import { CustomerShell } from "../features/customer/customer-shell";
import { sessionOptions } from "../lib/session-query";

export const Route = createFileRoute("/member")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionOptions);
    if (!session) throw redirect({ to: "/login", search: { returnTo: location.href } });
  },
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: () => (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  ),
});
