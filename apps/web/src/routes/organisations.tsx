import { createFileRoute } from "@tanstack/react-router";
import { Organisations } from "../features/account/organisations";
export const Route = createFileRoute("/organisations")({
  component: () => <Organisations />,
});
