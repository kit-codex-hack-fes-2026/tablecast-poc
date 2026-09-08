import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { z } from "zod";
import { genericOAuth } from "better-auth/plugins";
import { sendAccountEmail, type MailEnv } from "./emails/send";
import { authOptions } from "./auth-options";
import * as schema from "./db/auth-schema";
import { ensure } from "./errors";

export const tablecastGoogleMockIssuer = "https://tablecast-google.localhost";

export type Actor = {
  kind: "device" | "staff" | "voice" | "mcp";
  storeId: string;
  tableSessionId?: string;
  userId?: string;
  role?: string;
  voiceSessionId?: string;
  turnId?: string;
  canWrite?: boolean;
};
export type ApiEnv = { Bindings: TablecastEnv; Variables: { actor: Actor; traceId: string } };
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
      | "TABLECAST_ENV"
    >
  > &
  MailEnv;
export function createAuth(env: AuthEnv, logger?: BetterAuthOptions["logger"]) {
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
        "組織への招待 / Organisation invitation",
        `${data.organization.name} に招待されました。You have been invited to join this organisation.`,
        "招待を確認 / View invitation",
        `${env.TABLECAST_PUBLIC_ORIGIN}/invitations/${data.id}`,
      );
    },
  );
  const emulator = env.TABLECAST_GOOGLE_EMULATOR_URL;
  if (emulator)
    ensure(
      env.TABLECAST_ENV === "development" &&
        ["127.0.0.1", "localhost", "tablecast-emulate"].includes(new URL(emulator).hostname),
      "OAUTH_EMULATOR_LOCAL_ONLY",
      503,
    );
  return betterAuth({
    ...options,
    plugins: [
      ...options.plugins,
      ...(emulator
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "google",
                  accountIssuer: tablecastGoogleMockIssuer,
                  authorizationUrl: `${emulator}/o/oauth2/v2/auth`,
                  tokenUrl: `${emulator}/oauth2/token`,
                  // emulateのsubは再起動で変わるため、確認済みメールを開発用IDとする。
                  accountSubject: ({ profile }) => z.email().parse(profile.email).toLowerCase(),
                  getUserInfo: async (tokens) => {
                    const response = await fetch(`${emulator}/oauth2/v2/userinfo`, {
                      headers: { authorization: `Bearer ${tokens.accessToken}` },
                    });
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
    database: drizzleAdapter(drizzle(env.TABLECAST_DB), { provider: "sqlite", schema }),
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
export async function deviceActor(c: Context<ApiEnv>): Promise<Actor> {
  const token = getCookie(c, "tablecast.device");
  ensure(token, "DEVICE_REQUIRED", 401);
  const row = await c.env.TABLECAST_DB.prepare(
    "SELECT d.store_id,s.id FROM devices d JOIN table_sessions s ON s.table_id=d.table_id AND s.store_id=d.store_id AND s.status='open' WHERE d.token_hash=? AND d.revoked_at IS NULL",
  )
    .bind(await hashDeviceToken(token))
    .first<{ store_id: string; id: string }>();
  ensure(row, "DEVICE_NOT_ASSIGNED", 401);
  return { kind: "device", storeId: row.store_id, tableSessionId: row.id };
}
export async function staffIdentity(c: Context<ApiEnv>) {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  ensure(session, "LOGIN_REQUIRED", 401);
  return session;
}
export async function staffActor(
  c: Context<ApiEnv>,
  storeId: string,
  admin = false,
): Promise<Actor> {
  const session = await staffIdentity(c);
  const membership = await c.env.TABLECAST_DB.prepare(
    "SELECT m.role FROM member m JOIN stores s ON s.organization_id=m.organization_id WHERE m.user_id=? AND s.id=? AND (m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM team_member tm JOIN team t ON t.id=tm.team_id WHERE tm.user_id=m.user_id AND t.id=s.team_id AND t.organization_id=s.organization_id))",
  )
    .bind(session.user.id, storeId)
    .first<{ role: string }>();
  ensure(membership, "STORE_FORBIDDEN", 403);
  if (admin) ensure(["owner", "admin"].includes(membership.role), "ADMIN_REQUIRED", 403);
  return { kind: "staff", storeId, userId: session.user.id, role: membership.role };
}
export function requireManager(actor: Actor) {
  ensure(
    (actor.kind === "staff" || actor.kind === "mcp") &&
      ["owner", "admin"].includes(actor.role ?? ""),
    "ADMIN_REQUIRED",
    403,
  );
  if (actor.kind === "mcp") ensure(actor.canWrite, "WRITE_SCOPE_REQUIRED", 403);
}
