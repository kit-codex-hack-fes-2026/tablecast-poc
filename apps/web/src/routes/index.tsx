import { createFileRoute } from "@tanstack/react-router";
import { Kiosk } from "../features/kiosk/kiosk";
import { tableCatalogOptions, tableOptions } from "../features/kiosk/table-query";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const table = await context.queryClient.ensureQueryData(tableOptions(context.queryClient));
    if (table)
      await context.queryClient.ensureQueryData(
        tableCatalogOptions(table.storeId, table.configVersion),
      );
  },
  component: Kiosk,
});
