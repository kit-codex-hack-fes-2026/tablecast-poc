import { createFileRoute } from "@tanstack/react-router";
import { SettingsDrafts } from "../features/admin/settings-drafts";
export const Route = createFileRoute("/admin/stores/$storeId/menu/changes/")({
  component: SettingsDrafts,
});
