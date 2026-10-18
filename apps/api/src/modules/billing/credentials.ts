import OpenAI from "openai";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { organizationAi, organizationAiKeys } from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";

export const organizationAiEnabled = (env: TablecastEnv) =>
  env.TABLECAST_ORGANIZATION_AI_ENABLED === "true";
export const organizationAiProvisioningEnabled = (env: TablecastEnv) =>
  Boolean(
    env.TABLECAST_OPENAI_ADMIN_API_KEY &&
    env.TABLECAST_OPENAI_PROJECT_ID &&
    env.TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET,
  );
export const adminOpenAI = (env: TablecastEnv) =>
  new OpenAI({ adminAPIKey: env.TABLECAST_OPENAI_ADMIN_API_KEY, maxRetries: 0, timeout: 20_000 });

async function encryptionKey(env: TablecastEnv) {
  ensure(
    env.TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET?.length >= 32,
    "AI_KEY_ENCRYPTION_NOT_CONFIGURED",
    503,
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.TABLECAST_OPENAI_KEY_ENCRYPTION_SECRET),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
export async function sealOrganizationKey(env: TablecastEnv, identity: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(identity) },
    await encryptionKey(env),
    new TextEncoder().encode(value),
  );
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
async function unsealOrganizationKey(env: TablecastEnv, identity: string, value: string) {
  const [iv, data] = value.split(".");
  ensure(iv && data, "AI_KEY_INVALID", 503);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv), additionalData: new TextEncoder().encode(identity) },
      await encryptionKey(env),
      decode(data),
    ),
  );
}
export function pendingOrganizationKey(services: ApiServices, organizationId: string) {
  return services.db
    .insert(organizationAi)
    .values({ organizationId, updatedAt: Date.now() })
    .onConflictDoNothing();
}

export async function provisionOrganizationKey(services: ApiServices, organizationId: string) {
  const { env, db } = services;
  if (!organizationAiProvisioningEnabled(env)) return;
  const lease = crypto.randomUUID(),
    now = Date.now();
  const claimed = await db
    .update(organizationAi)
    .set({ state: "provisioning", lease, leaseUntil: now + 120_000, updatedAt: now })
    .where(
      and(
        eq(organizationAi.organizationId, organizationId),
        or(
          inArray(organizationAi.state, ["pending", "failed"]),
          and(eq(organizationAi.state, "provisioning"), lt(organizationAi.leaseUntil, now)),
        ),
      ),
    )
    .returning()
    .get();
  if (!claimed) return;
  const client = adminOpenAI(env).admin.organization.projects.serviceAccounts;
  const signal = AbortSignal.timeout(60_000);
  const projectId = env.TABLECAST_OPENAI_PROJECT_ID;
  let createdId: string | undefined;
  try {
    ensure(projectId && env.TABLECAST_OPENAI_ADMIN_API_KEY, "AI_ADMIN_NOT_CONFIGURED", 503);
    await encryptionKey(env);
    const name = `tablecast-${env.TABLECAST_ENV}-${organizationId}`;
    const known = await db
      .select({ id: organizationAiKeys.serviceAccountId })
      .from(organizationAiKeys)
      .where(eq(organizationAiKeys.organizationId, organizationId));
    const knownIds = new Set(known.map((account) => account.id));
    // 応答消失で秘密値を受け取れなかった前回の資源を回収する。名前だけを冪等性保証にはしない。
    for await (const account of client.list(projectId, { limit: 100 }, { signal })) {
      if (account.name === name && !knownIds.has(account.id))
        await client.delete(account.id, { project_id: projectId }, { signal });
    }
    const created = await client.create(projectId, { name }, { signal });
    createdId = created.id;
    ensure(created.api_key, "AI_KEY_NOT_RETURNED", 503);
    const encryptedKey = await sealOrganizationKey(
      env,
      `${organizationId}:${created.api_key.id}`,
      created.api_key.value,
    );
    const result = await db.batch([
      db
        .update(organizationAi)
        .set({
          credentialId: created.api_key.id,
          serviceAccountId: created.id,
          state: "ready",
          lease: null,
          leaseUntil: 0,
          updatedAt: Date.now(),
        })
        .where(
          and(eq(organizationAi.organizationId, organizationId), eq(organizationAi.lease, lease)),
        ),
      db.insert(organizationAiKeys).select(
        db
          .select({
            id: sql<string>`${created.api_key.id}`.as("id"),
            organizationId: organizationAi.organizationId,
            projectId: sql<string>`${projectId}`.as("project_id"),
            serviceAccountId: sql<string>`${created.id}`.as("service_account_id"),
            encryptedKey: sql<string>`${encryptedKey}`.as("encrypted_key"),
            createdAt: sql<number>`${Date.now()}`.as("created_at"),
            revokedAt: sql<number | null>`NULL`.as("revoked_at"),
          })
          .from(organizationAi)
          .where(
            and(
              eq(organizationAi.organizationId, organizationId),
              eq(organizationAi.credentialId, created.api_key.id),
              sql`changes()=1`,
            ),
          ),
      ),
    ]);
    ensure(result[0].meta.changes === 1, "AI_KEY_LEASE_LOST", 409);
  } catch {
    // D1の応答消失でも、保存済みの鍵を誤って外部から削除しない。
    if (createdId) {
      try {
        const persisted = await db
          .select({ id: organizationAiKeys.id })
          .from(organizationAiKeys)
          .where(
            and(
              eq(organizationAiKeys.serviceAccountId, createdId),
              eq(organizationAiKeys.organizationId, organizationId),
            ),
          )
          .get();
        if (persisted) return;
      } catch {
        return;
      }
    }
    if (createdId) {
      try {
        await client.delete(createdId, { project_id: projectId });
      } catch {
        /* 固定名を次回の照合で回収する。秘密を含むprovider例外は記録しない。 */
      }
    }
    await db
      .update(organizationAi)
      .set({ state: "failed", updatedAt: Date.now() })
      .where(
        and(eq(organizationAi.organizationId, organizationId), eq(organizationAi.lease, lease)),
      );
  }
}

export async function organizationCredential(services: ApiServices, organizationId: string) {
  const row = await services.db
    .select({ state: organizationAi.state, key: organizationAiKeys })
    .from(organizationAi)
    .leftJoin(organizationAiKeys, eq(organizationAiKeys.id, organizationAi.credentialId))
    .where(eq(organizationAi.organizationId, organizationId))
    .get();
  ensure(row?.state === "ready" && row.key && !row.key.revokedAt, "ORGANIZATION_AI_NOT_READY", 503);
  return {
    id: row.key.id,
    apiKey: await unsealOrganizationKey(
      services.env,
      `${organizationId}:${row.key.id}`,
      row.key.encryptedKey,
    ),
  };
}
export async function sessionCredential(services: ApiServices, credentialId: string | null) {
  if (!credentialId) {
    ensure(services.env.TABLECAST_MODEL_API_KEY, "VOICE_NOT_CONFIGURED", 503);
    return services.env.TABLECAST_MODEL_API_KEY;
  }
  const row = await services.db
    .select()
    .from(organizationAiKeys)
    .where(eq(organizationAiKeys.id, credentialId))
    .get();
  ensure(row && !row.revokedAt, "ORGANIZATION_AI_KEY_UNAVAILABLE", 503);
  return unsealOrganizationKey(services.env, `${row.organizationId}:${row.id}`, row.encryptedKey);
}
