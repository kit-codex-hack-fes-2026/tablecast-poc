import { createFileRoute } from "@tanstack/react-router";
import { IntegrationSetup } from "../features/account/integration-setup";
import { readIntegrationConnection } from "../features/account/integration-query";
export const Route = createFileRoute("/account_/integrations/plugins")({
  loader: () => readIntegrationConnection(),
  component: IntegrationPage,
});

function IntegrationPage() {
  return <IntegrationSetup mode="plugins" connection={Route.useLoaderData()} />;
}
