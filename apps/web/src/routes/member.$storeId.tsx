import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { customerStoreOptions } from "../features/customer/customer-query";
import { useI18n } from "../i18n/locale";
export const Route = createFileRoute("/member/$storeId")({
  staticData: {
    document: { title: "customer_card", description: "head_customer_store_description" },
  },
  beforeLoad: async ({ context, params, location }) => {
    const customerStore = await context.queryClient.ensureQueryData(
      customerStoreOptions(params.storeId),
    );
    if (
      !customerStore.membership?.active &&
      location.pathname.replace(/\/$/, "") !== `/member/${params.storeId}`
    )
      throw redirect({ to: "/member/$storeId", params: { storeId: params.storeId } });
    return { customerStore };
  },
  loader: ({ context }) => ({
    ...context.customerStore,
    document: { store: context.customerStore.store.name },
  }),
  component: Page,
});

function Page() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { storeId } = Route.useParams();
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <>
      {path.replace(/\/$/, "") !== `/member/${storeId}` && (
        <Link
          to="/member/$storeId"
          params={{ storeId }}
          className="mb-6 flex min-h-11 items-center gap-3 pb-2 text-sm font-medium hover:text-primary"
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0">
            <span className="block wrap-anywhere">{data.store.name}</span>
            <span className="block font-normal text-muted-foreground">
              {t("customer_back_to_store")}
            </span>
          </span>
        </Link>
      )}
      <Outlet key={storeId} />
    </>
  );
}
