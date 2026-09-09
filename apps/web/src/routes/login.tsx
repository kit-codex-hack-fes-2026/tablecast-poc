import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Login } from "../features/account/login";

export const Route = createFileRoute("/login")({
  validateSearch: z.looseObject({
    returnStoreId: z.string().optional().catch(undefined),
    returnDraftId: z.string().optional().catch(undefined),
  }),
  component: () => <Login />,
});
