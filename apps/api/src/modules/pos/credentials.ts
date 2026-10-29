import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { PosAdapter } from "./adapter";
import { posConnections } from "../../db/pos-schema";
import { DomainError, ensure } from "../../platform/errors";
import { createSquareAdapter, exchangeSquareToken } from "./square";

const credentialsSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });
export function squareEnvironment(env: TablecastEnv) {
  const environment = env.TABLECAST_SQUARE_ENVIRONMENT || "production";
  ensure(environment === "production" || environment === "sandbox", "POS_NOT_CONFIGURED", 503);
  return environment;
}
export const posMode = (env: TablecastEnv) =>
  squareEnvironment(env) === "sandbox" ? "test" : "live";
export const posConfigured = (env: TablecastEnv) =>
  Boolean(
    env.TABLECAST_SQUARE_APPLICATION_ID &&
    env.TABLECAST_SQUARE_APPLICATION_SECRET &&
    env.TABLECAST_POS_ENCRYPTION_SECRET &&
    env.TABLECAST_POS_ENCRYPTION_SECRET.length >= 32 &&
    env.TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY,
  );
async function key(env: TablecastEnv) {
  ensure(
    env.TABLECAST_POS_ENCRYPTION_SECRET && env.TABLECAST_POS_ENCRYPTION_SECRET.length >= 32,
    "POS_NOT_CONFIGURED",
    503,
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.TABLECAST_POS_ENCRYPTION_SECRET),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
export async function sealPosCredentials(
  env: TablecastEnv,
  id: string,
  value: z.infer<typeof credentialsSchema>,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
    await key(env),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return encode(iv) + "." + encode(new Uint8Array(encrypted));
}
export async function readPosCredentials(env: TablecastEnv, id: string, value: string) {
  const [iv, data] = value.split(".");
  ensure(iv && data, "POS_AUTH_REQUIRED", 401);
  const decoded = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(iv), additionalData: new TextEncoder().encode(id) },
    await key(env),
    decode(data),
  );
  return credentialsSchema.parse(JSON.parse(new TextDecoder().decode(decoded)));
}
export async function connectedAdapter(
  services: ApiServices,
  connection: typeof posConnections.$inferSelect,
): Promise<PosAdapter> {
  let current = await services.db
    .select()
    .from(posConnections)
    .where(
      and(eq(posConnections.id, connection.id), eq(posConnections.storeId, connection.storeId)),
    )
    .get();
  for (let retry = 0; retry < 3; retry++) {
    ensure(
      current && current.status !== "disconnecting" && current.status !== "disconnected",
      "POS_CONNECTION_REQUIRED",
      422,
    );
    ensure(current.mode === posMode(services.env), "POS_ENVIRONMENT_MISMATCH", 409);
    const credentials = await readPosCredentials(services.env, current.id, current.credentials);
    // 標準30日tokenを発行後7日以内に更新する。失効直前まで待たない。
    if (current.status !== "reauthorize" && current.expiresAt >= Date.now() + 23 * 86400_000)
      return createSquareAdapter(credentials.accessToken, {
        environment: squareEnvironment(services.env),
      });
    ensure(
      services.env.TABLECAST_SQUARE_APPLICATION_ID &&
        services.env.TABLECAST_SQUARE_APPLICATION_SECRET,
      "POS_NOT_CONFIGURED",
      503,
    );
    try {
      const token = await exchangeSquareToken(
        {
          applicationId: services.env.TABLECAST_SQUARE_APPLICATION_ID,
          applicationSecret: services.env.TABLECAST_SQUARE_APPLICATION_SECRET,
          refreshToken: credentials.refreshToken,
        },
        { environment: squareEnvironment(services.env) },
      );
      ensure(token.merchantId === current.merchantId, "POS_AUTH_REQUIRED", 401);
      const updated = await services.db
        .update(posConnections)
        .set({
          credentials: await sealPosCredentials(services.env, current.id, {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
          }),
          expiresAt: token.expiresAt,
          status: "connected",
        })
        .where(
          and(
            eq(posConnections.id, current.id),
            eq(posConnections.credentials, current.credentials),
            eq(posConnections.status, current.status),
            eq(posConnections.merchantId, current.merchantId),
          ),
        );
      if (updated.meta.changes === 1)
        return createSquareAdapter(token.accessToken, {
          environment: squareEnvironment(services.env),
        });
    } catch (error) {
      if (error instanceof DomainError && error.code === "POS_AUTH_REQUIRED")
        await services.db
          .update(posConnections)
          .set({ status: "reauthorize" })
          .where(
            and(
              eq(posConnections.id, current.id),
              eq(posConnections.credentials, current.credentials),
              eq(posConnections.status, current.status),
            ),
          );
      throw error;
    }
    current = await services.db
      .select()
      .from(posConnections)
      .where(eq(posConnections.id, current.id))
      .get();
  }
  throw new DomainError("POS_CONNECTION_CONFLICT", 409, "Square接続が更新されました");
}
export async function posStateHash(state: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
