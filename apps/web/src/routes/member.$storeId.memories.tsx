import { createFileRoute } from "@tanstack/react-router";
import { CustomerMemories } from "../features/customer/customer-memories";
import { customerMemoriesOptions } from "../features/customer/customer-memory-query";
export const Route = createFileRoute("/member/$storeId/memories")({
  loader: ({ context, params }) =>
    context.queryClient.ensureInfiniteQueryData(customerMemoriesOptions(params.storeId)),
  component: Page,
});
function Page() {
  const { storeId } = Route.useParams();
  return <CustomerMemories storeId={storeId} />;
}
