import { dashClient } from "@better-auth/infra/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { apiFetch } from "./api-fetch";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  fetchOptions: { customFetchImpl: apiFetch },
  plugins: [organizationClient(), passkeyClient(), oauthProviderClient(), dashClient()],
});
export function authResult<T>(result: { data: T | null; error: { message?: string } | null }): T {
  if (result.error || result.data === null)
    throw new Error(result.error?.message ?? "AUTH_REQUEST_FAILED");
  return result.data;
}
