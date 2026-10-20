import { createFileRoute } from "@tanstack/react-router";
import { IntegrationSetup } from "../features/account/integration-setup";
export const Route = createFileRoute("/account_/integrations/manual")({
  pendingComponent: IntegrationPage,
  component: IntegrationPage,
});

function IntegrationPage() {
  return <IntegrationSetup mode="manual" />;
}
