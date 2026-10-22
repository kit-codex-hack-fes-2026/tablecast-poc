import { dashClient } from "@better-auth/infra/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { stripeClient } from "@better-auth/stripe/client";
import {
  lastLoginMethodClient,
  magicLinkClient,
  oneTapClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { apiFetch } from "./api-fetch";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  fetchOptions: { customFetchImpl: apiFetch },
  plugins: [
    stripeClient({ subscription: true }),
    organizationClient(),
    magicLinkClient(),
    lastLoginMethodClient({ cookieName: "tablecast.last_login_method" }),
    passkeyClient(),
    oauthProviderClient(),
    dashClient(),
  ],
});
export function authResult<T>(result: { data: null | T; error: null | { message?: string } }): T {
  if (result.error || result.data === null)
    throw new Error(result.error?.message ?? "AUTH_REQUEST_FAILED");
  return result.data;
}

export function promptGoogleOneTap(clientId: string, callbackURL: string) {
  const client = createAuthClient({
    basePath: "/api/auth",
    fetchOptions: { customFetchImpl: apiFetch },
    plugins: [oneTapClient({ clientId, autoSelect: false, promptOptions: { maxAttempts: 1 } })],
  });
  return client.oneTap({ callbackURL });
}
