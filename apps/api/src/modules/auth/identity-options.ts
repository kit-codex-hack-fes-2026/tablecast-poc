import type { BetterAuthOptions } from "better-auth";
import { organization } from "better-auth/plugins";

// ログインとGUIのsession検証でCookie・追加field・organizationの定義を共有する。
export function identityOptions(
  origin: string,
  secret: string,
  notifications: Pick<
    NonNullable<Parameters<typeof organization>[0]>,
    "organizationHooks" | "sendInvitationEmail"
  > = {},
) {
  return {
    appName: "TableCast",
    baseURL: origin,
    basePath: "/api/auth",
    secret,
    trustedOrigins: [origin],
    rateLimit: { storage: "database" },
    emailAndPassword: { enabled: false },
    account: {
      accountLinking: { enabled: true, allowDifferentEmails: false, allowUnlinkingAll: true },
    },
    user: {
      additionalFields: {
        passkeyRegistered: { type: "boolean", required: false, defaultValue: false, input: false },
        stripeCustomerId: { type: "string", required: false, input: false, returned: false },
        locale: { type: ["ja", "en"], required: false, defaultValue: "ja" },
      },
    },
    advanced: {
      database: { joins: true },
      cookiePrefix: "tablecast",
      useSecureCookies: origin.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        schema: {
          organization: {
            additionalFields: {
              stripeCustomerId: { type: "string", required: false, input: false, returned: false },
            },
          },
        },
        ...notifications,
        requireEmailVerificationOnInvitation: true,
      }),
    ],
  } satisfies BetterAuthOptions;
}
