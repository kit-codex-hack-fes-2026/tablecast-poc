import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CreateStore } from "../features/store/create-store";
export const Route = createFileRoute("/stores/new")({
  component: () => (
    <ClientOnly>
      <CreateStore />
    </ClientOnly>
  ),
});
