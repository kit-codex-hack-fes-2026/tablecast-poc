import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [organizationClient({ teams: { enabled: true } }), passkeyClient()],
});
export function authResult<T>(result: { data: T | null; error: { message?: string } | null }): T {
  if (result.error || result.data === null)
    throw new Error(result.error?.message ?? "AUTH_REQUEST_FAILED");
  return result.data;
}
