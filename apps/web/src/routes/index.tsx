import { createFileRoute } from "@tanstack/react-router";
import { Kiosk } from "../features/kiosk/kiosk";
import { Landing } from "../features/kiosk/landing";
import { tableCatalogOptions, tableOptions } from "../features/kiosk/table-query";

export const Route = createFileRoute("/")({
  staticData: { document: { title: "head_guest", description: "head_guest_description" } },
  loader: async ({ context }) => {
    const table = await context.queryClient.ensureQueryData(tableOptions(context.queryClient));
    if (table)
      await context.queryClient.ensureQueryData(
        tableCatalogOptions(table.storeId, table.configVersion),
      );
    return {
      connected: table !== null,
      document: table
        ? { store: table.storeName }
        : { title: "head_landing" as const, description: "head_landing_description" as const },
    };
  },
  component: IndexPage,
});

function IndexPage() {
  const { connected } = Route.useLoaderData();
  return connected ? <Kiosk /> : <Landing />;
}
