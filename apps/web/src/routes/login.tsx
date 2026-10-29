import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Login } from "../features/account/login";
import { memberStoreLoginId, memberVisitLoginCode } from "../features/account/login-model";
import {
  memberLoginBrandingOptions,
  memberStoreLoginBrandingOptions,
} from "../features/account/member-login-query";
import { readEvaluationEnvironment } from "../lib/evaluation-environment";

export const Route = createFileRoute("/login")({
  staticData: { document: { title: "auth_sign_in", description: "head_login_description" } },
  validateSearch: z.looseObject({
    returnStoreId: z.string().optional().catch(undefined),
    returnDraftId: z.string().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({
    code: memberVisitLoginCode(search.returnTo),
    storeId: memberStoreLoginId(search.returnTo),
  }),
  loader: async ({ deps, context }) => {
    const [evaluation, memberStore] = await Promise.all([
      readEvaluationEnvironment(),
      deps.code
        ? context.queryClient
            .fetchQuery(memberLoginBrandingOptions(deps.code))
            .catch(() => undefined)
        : deps.storeId
          ? context.queryClient
              .fetchQuery(memberStoreLoginBrandingOptions(deps.storeId))
              .catch(() => undefined)
          : undefined,
    ]);
    return { evaluation, memberStore };
  },
  component: LoginPage,
});

function LoginPage() {
  const { evaluation, memberStore } = Route.useLoaderData();
  return <Login evaluation={evaluation} memberStore={memberStore} />;
}
