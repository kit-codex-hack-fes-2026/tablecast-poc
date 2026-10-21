import { createFileRoute } from "@tanstack/react-router";
import { IntegrationSetup } from "../features/account/integration-setup";
export const Route = createFileRoute("/account_/integrations/manual")({
  staticData: {
    document: { title: "mcp_manual_install", description: "head_integrations_description" },
  },
  pendingComponent: IntegrationPage,
  component: IntegrationPage,
});

function IntegrationPage() {
  return <IntegrationSetup mode="manual" />;
}
