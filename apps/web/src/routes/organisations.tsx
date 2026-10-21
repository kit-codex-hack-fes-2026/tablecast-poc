import { collectionSearchSchema } from "../features/shell/collection-model";
import { createFileRoute } from "@tanstack/react-router";
import { Organisations } from "../features/account/organisations";
export const Route = createFileRoute("/organisations")({
  validateSearch: collectionSearchSchema,
  staticData: { document: { title: "stores_title", description: "head_stores_description" } },
  component: () => <Organisations />,
});
