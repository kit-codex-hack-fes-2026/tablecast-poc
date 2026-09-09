import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { IntegrationSetup } from "../features/account/integration-setup";
export const Route = createFileRoute("/account_/integrations/plugins")({
  component: () => (
    <ClientOnly>
      <IntegrationSetup mode="plugins" />
    </ClientOnly>
  ),
});
