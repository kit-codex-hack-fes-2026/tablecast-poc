import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Organisations } from "../features/account/organisations";
export const Route = createFileRoute("/organisations")({
  component: () => (
    <ClientOnly>
      <Organisations />
    </ClientOnly>
  ),
});
