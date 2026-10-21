import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DemoPage } from "../features/demo/demo";
import { DemoPending } from "../features/demo/demo-pending";
import { demoOptions } from "../features/demo/demo-query";
import { storesOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId_/demo")({
  staticData: { document: { title: "demo_title", description: "head_demo_description" } },
  validateSearch: z.object({
    demoId: z.uuid().optional().catch(undefined),
    device: z.enum(["browser", "ipad", "ipad-air-11", "ipad-air-13"]).optional().catch(undefined),
    portrait: z.union([z.boolean(), z.stringbool()]).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ demoId: search.demoId }),
  loader: async ({ context, params, deps }) => {
    const stores = await context.queryClient.ensureQueryData(storesOptions);
    if (deps.demoId)
      await context.queryClient.ensureQueryData(demoOptions(params.storeId, deps.demoId));
    return {
      document: { store: stores.stores.find((store) => store.id === params.storeId)?.name },
    };
  },
  pendingComponent: Pending,
  component: Page,
});
function Page() {
  const { storeId } = Route.useParams();
  const search = Route.useSearch();
  return <DemoPage storeId={storeId} {...search} />;
}

function Pending() {
  const search = Route.useSearch();
  return <DemoPending device={search.device} portrait={search.portrait} />;
}
