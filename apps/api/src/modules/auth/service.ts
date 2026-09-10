import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { dash } from "@better-auth/infra";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import * as schema from "../../db/auth-schema";
import type { MailEnv } from "../../emails/send";
import { sendAccountEmail } from "../../emails/send";
import type { Database } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { authOptions } from "./options";
import { previewGoogleToken, previewOAuthFetch } from "./preview";
export const tablecastGoogleMockIssuer = "https://tablecast-google.localhost";
export function createAuth(
  env: AuthEnv,
  logger?: BetterAuthOptions["logger"],
  db: Database = drizzle(env.TABLECAST_DB),
  backgroundTasks?: NonNullable<BetterAuthOptions["advanced"]>["backgroundTasks"],
) {
  ensure(
    env.TABLECAST_AUTH_SECRET && env.TABLECAST_AUTH_SECRET.length >= 32,
    "AUTH_NOT_CONFIGURED",
    503,
  );
  const options = authOptions(
    env.TABLECAST_PUBLIC_ORIGIN,
    env.TABLECAST_AUTH_SECRET,
    async (data) => {
      await sendAccountEmail(
        env,
        data.email,
        "店舗への招待 / Restaurant invitation",
        `${data.organization.name} に招待されました。You have been invited to join this restaurant.`,
        "招待を確認 / View invitation",
        `${env.TABLECAST_PUBLIC_ORIGIN}/invitations/${data.id}`,
      );
    },
  );
  const emulator = env.TABLECAST_GOOGLE_EMULATOR_URL;
  if (emulator)
    ensure(
      (env.TABLECAST_ENV === "development" &&
        ["127.0.0.1", "localhost", "tablecast-emulate"].includes(new URL(emulator).hostname)) ||
        (env.TABLECAST_ENV === "preview" &&
          Boolean(env.TABLECAST_EMULATE) &&
          emulator === "http://tablecast-emulate"),
      "OAUTH_EMULATOR_LOCAL_ONLY",
      503,
    );
  const dashboardApiKey =
    env.TABLECAST_ENV === "production" ? env.TABLECAST_BETTER_AUTH_API_KEY : undefined;
  return betterAuth({
    ...options,
    onAPIError: { throw: true },
    advanced: {
      ...options.advanced,
      backgroundTasks: dashboardApiKey ? backgroundTasks : undefined,
    },
    plugins: [
      ...options.plugins,
      ...(dashboardApiKey
        ? [
            dash({
              apiKey: dashboardApiKey,
              activityTracking: { enabled: true },
            }),
          ]
        : []),
      ...(emulator
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "google",
                  accountIssuer: tablecastGoogleMockIssuer,
                  authorizationUrl: `${env.TABLECAST_GOOGLE_AUTHORIZE_URL || emulator}/o/oauth2/v2/auth`,
                  tokenUrl: `${emulator}/oauth2/token`,
                  ...(env.TABLECAST_ENV === "preview"
                    ? { getToken: previewGoogleToken({ ...env, TABLECAST_ENV: "preview" }) }
                    : {}),
                  // emulateのsubは再起動で変わるため、確認済みメールを開発用IDとする。
                  accountSubject: ({ profile }) => z.email().parse(profile.email).toLowerCase(),
                  getUserInfo: async (tokens) => {
                    const init = { headers: { authorization: `Bearer ${tokens.accessToken}` } };
                    const response =
                      env.TABLECAST_ENV === "preview"
                        ? await previewOAuthFetch(
                            { ...env, TABLECAST_ENV: "preview" },
                            "/oauth2/v2/userinfo",
                            init,
                          )
                        : await fetch(`${emulator}/oauth2/v2/userinfo`, init);
                    if (!response.ok) return null;
                    const profile = z
                      .object({
                        sub: z.string(),
                        email: z.email(),
                        email_verified: z.literal(true),
                        name: z.string(),
                      })
                      .parse(await response.json());
                    return { ...profile, id: profile.sub, emailVerified: true };
                  },
                  clientId: "tablecast-local-google",
                  clientSecret: "tablecast-local-google-secret",
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
    ],
    emailVerification: {
      sendOnSignUp: Boolean(env.TABLECAST_EMAIL_FROM),
      sendVerificationEmail: async ({ user, url }) =>
        sendAccountEmail(
          env,
          user.email,
          "メールアドレスの確認 / Verify your email",
          "メールアドレスを確認してください。Please verify your email address.",
          "確認 / Verify",
          url,
        ),
    },
    emailAndPassword: {
      ...options.emailAndPassword,
      sendResetPassword: async ({ user, url }) =>
        sendAccountEmail(
          env,
          user.email,
          "パスワードの再設定 / Reset password",
          "新しいパスワードを設定してください。Please choose a new password.",
          "再設定 / Reset",
          url,
        ),
    },
    logger,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    socialProviders:
      !emulator && env.TABLECAST_GOOGLE_CLIENT_ID && env.TABLECAST_GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.TABLECAST_GOOGLE_CLIENT_ID,
              clientSecret: env.TABLECAST_GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
  });
}
export async function hashDeviceToken(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type AuthEnv = Pick<
  TablecastEnv,
  "TABLECAST_DB" | "TABLECAST_AUTH_SECRET" | "TABLECAST_PUBLIC_ORIGIN"
> &
  Partial<
    Pick<
      TablecastEnv,
      | "TABLECAST_GOOGLE_CLIENT_ID"
      | "TABLECAST_GOOGLE_CLIENT_SECRET"
      | "TABLECAST_GOOGLE_EMULATOR_URL"
      | "TABLECAST_GOOGLE_AUTHORIZE_URL"
      | "TABLECAST_ENV"
      | "TABLECAST_BETTER_AUTH_API_KEY"
      | "TABLECAST_EMULATE"
    >
  > &
  MailEnv;
