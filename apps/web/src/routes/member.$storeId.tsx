import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { customerStoreOptions } from "../features/customer/customer-query";
export const Route = createFileRoute("/member/$storeId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(customerStoreOptions(params.storeId)),
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  const { storeId } = Route.useParams();
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <>
      {path.replace(/\/$/, "") !== `/member/${storeId}` && (
        <Link
          to="/member/$storeId"
          params={{ storeId }}
          className="mb-5 inline-flex text-sm font-medium underline underline-offset-4"
        >
          {data.store.name}
        </Link>
      )}
      <Outlet />
    </>
  );
}
