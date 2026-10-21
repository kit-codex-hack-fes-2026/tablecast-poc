import { createFileRoute } from "@tanstack/react-router";
import { IntegrationSetup } from "../features/account/integration-setup";
export const Route = createFileRoute("/account_/integrations/plugins")({
  staticData: {
    document: { title: "mcp_plugin_install", description: "head_integrations_description" },
  },
  pendingComponent: IntegrationPage,
  component: IntegrationPage,
});

function IntegrationPage() {
  return <IntegrationSetup mode="plugins" />;
}
