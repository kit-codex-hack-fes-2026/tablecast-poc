import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Login } from "../features/account/login";
import { memberStoreLoginId, memberVisitLoginCode } from "../features/account/login-model";
import {
  memberLoginBrandingOptions,
  memberStoreLoginBrandingOptions,
} from "../features/account/member-login-query";

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
    const memberStore = deps.code
      ? await context.queryClient
          .fetchQuery(memberLoginBrandingOptions(deps.code))
          .catch(() => undefined)
      : deps.storeId
        ? await context.queryClient
            .fetchQuery(memberStoreLoginBrandingOptions(deps.storeId))
            .catch(() => undefined)
        : undefined;
    return { memberStore };
  },
  component: LoginPage,
});

function LoginPage() {
  const { memberStore } = Route.useLoaderData();
  return <Login memberStore={memberStore} />;
}
