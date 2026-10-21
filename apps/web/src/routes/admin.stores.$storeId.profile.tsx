import { createFileRoute } from "@tanstack/react-router";
import { StoreProfile } from "../features/store/store-profile";
export const Route = createFileRoute("/admin/stores/$storeId/profile")({
  staticData: { document: { title: "store_profile", description: "head_profile_description" } },
  component: StoreProfile,
});
