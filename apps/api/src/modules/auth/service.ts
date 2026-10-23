import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { dash } from "@better-auth/infra";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { genericOAuth, lastLoginMethod, magicLink, oneTap } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { MailEnv } from "../../emails/send";
import * as schema from "../../db/auth-schema";
import { createDatabase, type Database } from "../../db/client";
import { magicLinkEmail, verificationEmail } from "../../emails/account-content";
import { sendAccountEmail } from "../../emails/send";
import { ensure } from "../../platform/errors";
import { billingPlugin } from "../billing/stripe";
import { authNotifications } from "./notifications";
import { authOptions } from "./options";
import { isHostedEmulator, previewGoogleToken, previewOAuthFetch } from "./preview";

export const tablecastGoogleMockIssuer = "https://tablecast-google.localhost";

export const tablecastCredentialIssuer = "local:credential";

export function createAuth(
  env: AuthEnv,
  logger?: BetterAuthOptions["logger"],
  db: Database = createDatabase(env.TABLECAST_DB),
  backgroundTasks?: NonNullable<BetterAuthOptions["advanced"]>["backgroundTasks"],
) {
  ensure(
    env.TABLECAST_AUTH_SECRET && env.TABLECAST_AUTH_SECRET.length >= 32,
    "AUTH_NOT_CONFIGURED",
    503,
  );
  const criticalMailTasks: Promise<void>[] = [];
  const notifications = authNotifications(env, db, criticalMailTasks);
  const options = authOptions(
    env.TABLECAST_PUBLIC_ORIGIN,
    env.TABLECAST_AUTH_SECRET,
    notifications.organization,
  );
  const emulator = env.TABLECAST_GOOGLE_EMULATOR_URL;
  if (emulator)
    ensure(
      (env.TABLECAST_ENV === "development" &&
        (["127.0.0.1", "localhost", "tablecast-emulate"].includes(new URL(emulator).hostname) ||
          new URL(emulator).hostname.endsWith(".localhost"))) ||
        (isHostedEmulator(env) &&
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
    rateLimit: {
      ...options.rateLimit,
      enabled: env.TABLECAST_ENV === "production",
      customRules: { "/organization/invite-member": { window: 60, max: 5 } },
    },
    advanced: {
      ...options.advanced,
      backgroundTasks: dashboardApiKey ? backgroundTasks : undefined,
    },
    plugins: [
      ...billingPlugin(env, db),
      ...options.plugins,
      lastLoginMethod({ cookieName: "tablecast.last_login_method" }),
      magicLink({
        expiresIn: 300,
        storeToken: "hashed",
        rateLimit: { window: 60, max: 5 },
        sendMagicLink: async ({ email, url, metadata }) => {
          const selectedLocale = z.enum(["ja", "en"]).safeParse(metadata?.locale);
          const user = selectedLocale.success
            ? undefined
            : await db
                .select({ locale: schema.user.locale })
                .from(schema.user)
                .where(eq(schema.user.email, email))
                .get();
          await sendAccountEmail(
            env,
            email,
            magicLinkEmail(url, selectedLocale.success ? selectedLocale.data : user?.locale),
          );
        },
      }),
      ...(!emulator && env.TABLECAST_GOOGLE_CLIENT_ID && env.TABLECAST_GOOGLE_CLIENT_SECRET
        ? [oneTap({ clientId: env.TABLECAST_GOOGLE_CLIENT_ID })]
        : []),
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
                  authorizationUrl: `${env.TABLECAST_GOOGLE_AUTHORIZE_URL || emulator}/o/oauth2/v2/auth`,
                  tokenUrl: `${emulator}/oauth2/token`,
                  ...(isHostedEmulator(env)
                    ? {
                        getToken: previewGoogleToken({
                          ...env,
                          TABLECAST_ENV: env.TABLECAST_ENV ?? "",
                        }),
                      }
                    : {}),
                  // emulateのsubは再起動で変わるため、確認済みメールを開発用IDとする。
                  accountSubject: ({ profile }) => z.email().parse(profile.email).toLowerCase(),
                  getUserInfo: async (tokens) => {
                    const init = { headers: { authorization: `Bearer ${tokens.accessToken}` } };
                    const response = isHostedEmulator(env)
                      ? await previewOAuthFetch(
                          { ...env, TABLECAST_ENV: env.TABLECAST_ENV ?? "" },
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
          verificationEmail(
            url,
            z.object({ locale: z.enum(["ja", "en"]).optional() }).parse(user).locale,
          ),
        ),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          [
            "/sign-in/email",
            "/sign-up/email",
            "/request-password-reset",
            "/reset-password",
            "/change-password",
            "/set-password",
          ].includes(ctx.path)
        )
          throw new APIError("FORBIDDEN", { message: "PASSWORD_AUTH_DISABLED" });
        if (ctx.path.startsWith("/subscription/") && ctx.path !== "/subscription/success") {
          const record = z.record(z.string(), z.unknown());
          const body = record.safeParse(ctx.body);
          const query = record.safeParse(ctx.query);
          const customerType =
            (body.success ? body.data.customerType : undefined) ??
            (query.success ? query.data.customerType : undefined);
          if (customerType !== "organization")
            throw new APIError("BAD_REQUEST", { message: "ORGANIZATION_BILLING_REQUIRED" });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        await Promise.all(criticalMailTasks.splice(0));
        if (ctx.context.returned instanceof APIError) return;
        const current = ctx.context.session;
        if (current && ctx.path === "/passkey/verify-registration")
          await notifications.security(current.user.id, "passkey-added");
        if (current && ctx.path === "/passkey/delete-passkey")
          await notifications.security(current.user.id, "passkey-removed");
      }),
    },
    databaseHooks: {
      account: {
        create: {
          after: async (account) => {
            if (account.providerId === "google")
              await notifications.security(account.userId, "google-linked");
          },
        },
        delete: {
          after: async (account) => {
            if (account.providerId === "google")
              await notifications.security(account.userId, "google-unlinked");
          },
        },
      },
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

export type AuthEnv = MailEnv &
  Partial<
    Pick<
      TablecastEnv,
      | "TABLECAST_BETTER_AUTH_API_KEY"
      | "TABLECAST_EMULATE"
      | "TABLECAST_ENV"
      | "TABLECAST_GOOGLE_AUTHORIZE_URL"
      | "TABLECAST_GOOGLE_CLIENT_ID"
      | "TABLECAST_GOOGLE_CLIENT_SECRET"
      | "TABLECAST_GOOGLE_EMULATOR_URL"
    >
  > &
  Partial<
    Pick<
      TablecastEnv,
      | "TABLECAST_BILLING_ENABLED"
      | "TABLECAST_BILLING_RATES"
      | "TABLECAST_STRIPE_SECRET_KEY"
      | "TABLECAST_STRIPE_WEBHOOK_SECRET"
    >
  > &
  Pick<TablecastEnv, "TABLECAST_AUTH_SECRET" | "TABLECAST_DB" | "TABLECAST_PUBLIC_ORIGIN">;
