import { getOAuthProviderApi, oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { deviceAuthorization, jwt, organization, redeemDeviceCode } from "better-auth/plugins";
import { z } from "zod";
export function authOptions(
  origin: string,
  secret: string,
  sendInvitationEmail?: (data: {
    id: string;
    email: string;
    organization: { name: string };
  }) => Promise<void>,
) {
  const oauth = {
    // 連携取消を即時反映するため、標準のDB管理アクセストークンを使用する。
    disableJwtPlugin: true,
    loginPage: "/login",
    consentPage: "/consent",
    scopes: ["openid", "profile", "tablecast:read", "tablecast:write"],
    resources: [
      { identifier: `${origin}/mcp`, allowedScopes: ["tablecast:read", "tablecast:write"] },
    ],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    allowPublicClientPrelogin: true,
    clientRegistrationDefaultResources: [`${origin}/mcp`],
    postLogin: {
      page: "/consent",
      shouldRedirect: async ({ session }: { session: Record<string, unknown> }) =>
        !session.activeOrganizationId,
      consentReferenceId: async ({ session }: { session: Record<string, unknown> }) => {
        if (typeof session.activeOrganizationId !== "string")
          throw new APIError("FORBIDDEN", { message: "STORE_SELECTION_REQUIRED" });
        return session.activeOrganizationId;
      },
    },
    customAccessTokenClaims: async ({ referenceId }: { referenceId?: string }) => ({
      tablecastOrganizationId: referenceId,
    }),
  };
  return {
    appName: "TableCast",
    baseURL: origin,
    basePath: "/api/auth",
    secret,
    trustedOrigins: [origin],
    emailAndPassword: { enabled: true, minPasswordLength: 12, requireEmailVerification: true },
    account: {
      accountLinking: { enabled: true, allowDifferentEmails: false, allowUnlinkingAll: false },
    },
    user: {
      additionalFields: { locale: { type: ["ja", "en"], required: false, defaultValue: "ja" } },
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
        sendInvitationEmail,
        requireEmailVerificationOnInvitation: true,
      }),
      passkey({ rpID: new URL(origin).hostname, rpName: "TableCast", origin }),
      // Cookie認証で使わないJWTの生成とJWKS取得をセッション確認から外す。
      jwt({ disableSettingJwtHeader: true }),
      oauthProvider(oauth),
      deviceAuthorization({
        verificationUri: `${origin}/device`,
        validateClient: async (clientId) => clientId === "tablecast-kiosk",
      }),
      {
        id: "tablecast-authorisation",
        endpoints: {
          tablecastRedeemDevice: createAuthEndpoint(
            "/tablecast/redeem-device",
            { method: "POST", body: z.object({ deviceCode: z.string() }) },
            async (ctx) => {
              const result = await redeemDeviceCode({
                ctx,
                deviceCode: ctx.body.deviceCode,
                authorizeRedemption: async (code) => {
                  if (code.clientId !== "tablecast-kiosk") throw new APIError("FORBIDDEN");
                  return {
                    ownershipWhere: { field: "clientId", value: "tablecast-kiosk" },
                    context: {},
                  };
                },
                prepareRedemption: async () => ({}),
              });
              return { userCode: result.claimedDeviceCode.userCode, userId: result.user.id };
            },
          ),
          tablecastMcpPrincipal: createAuthEndpoint(
            "/tablecast/mcp-principal",
            { method: "POST" },
            async (ctx) => {
              const header = ctx.headers?.get("authorization");
              if (!header?.startsWith("Bearer ")) throw new APIError("UNAUTHORIZED");
              const payload = await getOAuthProviderApi(ctx, oauth).requireActiveAccessToken(
                header.slice(7),
              );
              const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
              if (
                !audience.includes(`${origin}/mcp`) ||
                payload.cnf ||
                typeof payload.sub !== "string" ||
                typeof payload.tablecastOrganizationId !== "string"
              )
                throw new APIError("FORBIDDEN");
              const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
              if (!scopes.includes("tablecast:read")) throw new APIError("FORBIDDEN");
              return {
                userId: payload.sub,
                organizationId: payload.tablecastOrganizationId,
                canWrite: scopes.includes("tablecast:write"),
              };
            },
          ),
        },
      },
    ],
  } satisfies BetterAuthOptions;
}
