import { createFileRoute } from "@tanstack/react-router";
import { CreateStore } from "../features/store/create-store";
export const Route = createFileRoute("/stores/new")({
  staticData: { document: { title: "org_create", description: "head_store_create_description" } },
  component: () => <CreateStore />,
});
