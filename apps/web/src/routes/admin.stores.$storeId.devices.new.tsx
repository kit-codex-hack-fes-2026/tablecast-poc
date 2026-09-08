import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RegisterDevice } from "../features/store/devices";
export const Route = createFileRoute("/admin/stores/$storeId/devices/new")({
  validateSearch: z.object({ user_code: z.string().default(""), tableId: z.string().optional() }),
  component: Page,
});
function Page() {
  const { user_code, tableId } = Route.useSearch();
  return <RegisterDevice userCode={user_code} tableId={tableId} />;
}
