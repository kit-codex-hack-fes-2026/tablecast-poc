import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { readEvaluationEnvironment } from "../lib/evaluation-environment";
import { Login } from "../features/account/login";

export const Route = createFileRoute("/login")({
  validateSearch: z.looseObject({
    returnStoreId: z.string().optional().catch(undefined),
    returnDraftId: z.string().optional().catch(undefined),
  }),
  loader: async () => ({ evaluation: await readEvaluationEnvironment() }),
  component: LoginPage,
});

function LoginPage() {
  const { evaluation } = Route.useLoaderData();
  return <Login evaluation={evaluation} />;
}
