import { createFileRoute } from "@tanstack/react-router";
import { Organisations } from "../features/account/organisations";
import { collectionSearchSchema } from "../features/shell/collection-model";
export const Route = createFileRoute("/organisations")({
  validateSearch: collectionSearchSchema,
  staticData: { document: { title: "stores_title", description: "head_stores_description" } },
  component: () => <Organisations />,
});
