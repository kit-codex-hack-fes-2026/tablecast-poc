import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Login } from "../features/admin/login";

export const Route = createFileRoute("/login")({
  validateSearch: z.looseObject({
    returnStoreId: z.string().optional().catch(undefined),
    returnDraftId: z.string().optional().catch(undefined),
  }),
  component: () => (
    <ClientOnly>
      <Login />
    </ClientOnly>
  ),
});
