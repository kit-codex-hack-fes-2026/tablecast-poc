import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { KioskPending } from "../components/kiosk-pending";
import { Kiosk } from "../features/kiosk/kiosk";
import {
  demoTableEndpoint,
  tableCatalogOptions,
  tableOptions,
} from "../features/kiosk/table-query";
export const Route = createFileRoute("/admin/stores/$storeId_/demo_/$demoId")({
  staticData: { document: { title: "demo_title", description: "head_demo_description" } },
  loader: async ({ context, params }) => {
    const endpoint = demoTableEndpoint(params.storeId, params.demoId);
    const table = await context.queryClient.ensureQueryData(
      tableOptions(context.queryClient, endpoint),
    );
    if (table)
      await context.queryClient.ensureQueryData(
        tableCatalogOptions(table.storeId, table.configVersion, endpoint),
      );
    return { document: { store: table?.storeName } };
  },
  pendingComponent: () => (
    <main className="h-dvh">
      <KioskPending />
    </main>
  ),
  component: Page,
});
function Page() {
  const { storeId, demoId } = Route.useParams();
  const endpoint = useMemo(() => demoTableEndpoint(storeId, demoId), [storeId, demoId]);
  return <Kiosk endpoint={endpoint} />;
}
