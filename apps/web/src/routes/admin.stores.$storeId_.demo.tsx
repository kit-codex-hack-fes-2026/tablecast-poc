import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DemoPage } from "../features/store/demo";
import { demoOptions } from "../features/store/demo-query";
import { storesOptions } from "../features/store/store-query";
export const Route = createFileRoute("/admin/stores/$storeId_/demo")({
  validateSearch: z.object({
    demoId: z.uuid().optional().catch(undefined),
    device: z.enum(["browser", "ipad", "ipad-air-11", "ipad-air-13"]).optional().catch(undefined),
    portrait: z.union([z.boolean(), z.stringbool()]).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ demoId: search.demoId }),
  loader: async ({ context, params, deps }) => {
    await context.queryClient.ensureQueryData(storesOptions);
    if (deps.demoId)
      await context.queryClient.ensureQueryData(demoOptions(params.storeId, deps.demoId));
  },
  component: Page,
});
function Page() {
  const { storeId } = Route.useParams();
  const search = Route.useSearch();
  return <DemoPage storeId={storeId} {...search} />;
}
