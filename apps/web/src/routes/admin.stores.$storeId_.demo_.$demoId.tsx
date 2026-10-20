import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { KioskPending } from "../components/kiosk-pending";
import { Kiosk } from "../features/kiosk/kiosk";
import {
  tableOptions,
  tableCatalogOptions,
  demoTableEndpoint,
} from "../features/kiosk/table-query";
export const Route = createFileRoute("/admin/stores/$storeId_/demo_/$demoId")({
  loader: async ({ context, params }) => {
    const endpoint = demoTableEndpoint(params.storeId, params.demoId);
    const table = await context.queryClient.ensureQueryData(
      tableOptions(context.queryClient, endpoint),
    );
    if (table)
      await context.queryClient.ensureQueryData(
        tableCatalogOptions(table.storeId, table.configVersion, endpoint),
      );
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
