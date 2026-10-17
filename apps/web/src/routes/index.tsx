import { createFileRoute } from "@tanstack/react-router";
import { readEvaluationEnvironment } from "../lib/evaluation-environment";
import { Kiosk } from "../features/kiosk/kiosk";
import { tableCatalogOptions, tableOptions } from "../features/kiosk/table-query";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const table = await context.queryClient.ensureQueryData(tableOptions(context.queryClient));
    if (table)
      await context.queryClient.ensureQueryData(
        tableCatalogOptions(table.storeId, table.configVersion),
      );
    return { evaluation: await readEvaluationEnvironment() };
  },
  component: IndexPage,
});

function IndexPage() {
  const { evaluation } = Route.useLoaderData();
  return <Kiosk evaluation={evaluation} />;
}
