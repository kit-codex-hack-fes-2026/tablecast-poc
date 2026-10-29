import type { z } from "zod";
import { and, eq, inArray, lt, notExists } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type {
  posConfigurationSchema,
  PosConnection,
  posMappingsUpdateSchema,
  PosSettings,
} from "./model";
import { posCheckouts, posConnections, posOauthStates } from "../../db/pos-schema";
import { ensure } from "../../platform/errors";
import { requireManager, requireManagerRead } from "../auth/policy";
import { findStoreMembership } from "../auth/queries";
import { mapLocalized } from "../catalog/localization";
import { getCatalog } from "../catalog/queries";
import { getDraft } from "../configuration/queries";
import { updateDraft } from "../configuration/use-cases/drafts";
import {
  connectedAdapter,
  posConfigured,
  posMode,
  posStateHash,
  readPosCredentials,
  sealPosCredentials,
  squareEnvironment,
} from "./credentials";
import { posMappingSchema } from "./model";
import { findPosConnection } from "./queries";
import {
  exchangeSquareToken,
  revokeSquareToken,
  squareAuthorizationUrl,
  squareCapabilities,
} from "./square";

export function requirePosStaff(
  actor: Actor,
  admin = false,
): asserts actor is Actor & { userId: string } {
  ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
  if (admin) ensure(actor.role === "owner" || actor.role === "admin", "ADMIN_REQUIRED", 403);
}
export function publicPosConnection(
  row: typeof posConnections.$inferSelect | undefined,
): null | PosConnection {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    merchantId: row.merchantId,
    locationId: row.locationId,
    deviceId: row.deviceId,
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}
const activeStatuses = ["preparing", "pending", "review"] as const;
export function activeConnectionCheckout(services: ApiServices, connectionId: string) {
  return services.db
    .select({ id: posCheckouts.id })
    .from(posCheckouts)
    .where(
      and(
        eq(posCheckouts.connectionId, connectionId),
        inArray(posCheckouts.status, activeStatuses),
      ),
    );
}
export async function getPosSettings(
  services: ApiServices,
  actor: Actor,
  draftId?: string,
): Promise<PosSettings> {
  if (actor.kind === "mcp" || draftId) requireManagerRead(actor);
  else requirePosStaff(actor);
  const [connection, catalog] = await Promise.all([
    findPosConnection(services, actor.storeId),
    getCatalog(services, actor.storeId),
  ]);
  const draft = draftId ? await getDraft(services, actor, draftId, catalog) : null;
  const configuration = draft?.configuration ?? catalog.configuration;
  const legacy = posMappingSchema.array().parse(JSON.parse(connection?.mappingsJson ?? "[]"));
  return {
    configured: posConfigured(services.env),
    connection: publicPosConnection(connection),
    capabilities: squareCapabilities,
    mappings: configuration.pos?.mappings ?? [],
    mappingConnectionId: configuration.pos?.connectionId ?? null,
    publishedVersion: catalog.version,
    draft: draft
      ? {
          id: draft.id,
          version: draft.version,
          baseVersion: draft.baseVersion,
          status: draft.status,
        }
      : null,
    legacyMappings:
      !catalog.configuration.pos && !configuration.pos && connection && legacy.length
        ? { connectionId: connection.id, mappings: legacy }
        : null,
    products: configuration.products.map((product) => ({
      id: product.id,
      name: mapLocalized(product.text, (value) => value.displayName),
      price: product.price,
      available: product.available,
      imageKey: product.imageKey,
      imageKind: product.imageKind,
      options: product.modifiers.flatMap((group) =>
        group.options.map((option) => ({
          id: option.id,
          name: mapLocalized(option.text, (value) => value.displayName),
          price: option.priceDelta,
          imageKey: option.imageKey,
          imageKind: option.imageKind,
        })),
      ),
    })),
    devices: [],
  };
}
export async function getPosCatalog(services: ApiServices, actor: Actor, locationId?: string) {
  requireManagerRead(actor);
  const connection = await findPosConnection(services, actor.storeId);
  ensure(connection, "POS_CONNECTION_REQUIRED", 422);
  const adapter = await connectedAdapter(services, connection);
  ensure(
    adapter.capabilities.catalog && typeof adapter.catalog === "function",
    "POS_UNSUPPORTED",
    422,
  );
  return adapter.catalog(locationId ?? connection.locationId ?? undefined);
}
export async function savePosSettings(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof posConfigurationSchema>,
) {
  requireManager(actor);
  const connection = await findPosConnection(services, actor.storeId);
  ensure(connection?.status === "connected", "POS_CONNECTION_REQUIRED", 422);
  const adapter = await connectedAdapter(services, connection);
  ensure(
    adapter.capabilities.catalog && typeof adapter.catalog === "function",
    "POS_UNSUPPORTED",
    422,
  );
  const catalog = await adapter.catalog(input.locationId);
  ensure(adapter.devices, "POS_UNSUPPORTED", 422);
  const devices = await adapter.devices.list(input.locationId);
  ensure(
    devices.some((device) => device.id === input.deviceId),
    "POS_DEVICE_REQUIRED",
    422,
  );
  ensure(
    catalog.locations.some((location) => location.id === input.locationId),
    "POS_LOCATION_REQUIRED",
    422,
  );
  const result = await services.db
    .update(posConnections)
    .set({
      locationId: input.locationId,
      deviceId: input.deviceId,
      revision: connection.revision + 1,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(posConnections.id, connection.id),
        eq(posConnections.status, "connected"),
        eq(posConnections.revision, input.expectedRevision),
        notExists(activeConnectionCheckout(services, connection.id)),
      ),
    );
  ensure(result.meta.changes === 1, "POS_VERSION_CONFLICT");
  return getPosSettings(services, actor);
}
export async function savePosMappings(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof posMappingsUpdateSchema>,
) {
  requireManager(actor);
  const [connection, draft] = await Promise.all([
    findPosConnection(services, actor.storeId),
    getDraft(services, actor, input.draftId),
  ]);
  ensure(
    connection?.id === input.connectionId && connection.status === "connected",
    "POS_CONNECTION_REQUIRED",
    422,
  );
  ensure(draft.version === input.expectedVersion, "DRAFT_CONFLICT");
  ensure(draft.status === "draft" || draft.status === "ready", "DRAFT_CONFLICT");
  const locals = new Set(
    draft.configuration.products.flatMap((product) => [
      "product:" + product.id,
      ...product.modifiers.flatMap((group) => group.options.map((option) => "option:" + option.id)),
    ]),
  );
  ensure(
    new Set(input.mappings.map((mapping) => mapping.kind + ":" + mapping.localId)).size ===
      input.mappings.length &&
      input.mappings.every((mapping) => locals.has(mapping.kind + ":" + mapping.localId)),
    "POS_INVALID_INPUT",
    422,
  );
  const adapter = await connectedAdapter(services, connection);
  ensure(
    adapter.capabilities.catalog && typeof adapter.catalog === "function",
    "POS_UNSUPPORTED",
    422,
  );
  ensure(connection.locationId, "POS_LOCATION_REQUIRED", 422);
  const catalog = await adapter.catalog(connection.locationId);
  for (const mapping of input.mappings)
    ensure(
      mapping.kind === "product"
        ? catalog.items.some((item) => item.id === mapping.externalId)
        : catalog.items.some((item) =>
            item.options.some((option) => option.id === mapping.externalId),
          ),
      "POS_MAPPING_REQUIRED",
      422,
    );
  await updateDraft(services, actor, draft.id, {
    expectedVersion: input.expectedVersion,
    instructionFormatVersion: 1,
    configuration: {
      ...draft.configuration,
      pos: { provider: connection.provider, connectionId: connection.id, mappings: input.mappings },
    },
  });
  return getPosSettings(services, actor, draft.id);
}
export async function startPosOAuth(services: ApiServices, actor: Actor) {
  requirePosStaff(actor, true);
  ensure(posConfigured(services.env), "POS_NOT_CONFIGURED", 503);
  const connection = await findPosConnection(services, actor.storeId);
  ensure(connection?.status !== "disconnecting", "POS_CONNECTION_REQUIRED", 422);
  ensure(!connection || connection.mode === posMode(services.env), "POS_ENVIRONMENT_MISMATCH", 409);
  const applicationId = services.env.TABLECAST_SQUARE_APPLICATION_ID;
  ensure(applicationId, "POS_NOT_CONFIGURED", 503);
  const callback = new URL("/api/pos/square/callback", services.env.TABLECAST_PUBLIC_ORIGIN);
  ensure(callback.protocol === "https:", "POS_HTTPS_REQUIRED", 422);
  const state = crypto.randomUUID() + crypto.randomUUID();
  await services.db.batch([
    services.db.delete(posOauthStates).where(lt(posOauthStates.expiresAt, Date.now())),
    services.db.insert(posOauthStates).values({
      hash: await posStateHash(state),
      storeId: actor.storeId,
      userId: actor.userId,
      mode: posMode(services.env),
      expiresAt: Date.now() + 300_000,
    }),
  ]);
  return {
    url: squareAuthorizationUrl(applicationId, state, callback.href, {
      environment: squareEnvironment(services.env),
    }),
  };
}
export async function finishPosOAuth(
  services: ApiServices,
  userId: string,
  state: string,
  code: string,
) {
  const hash = await posStateHash(state);
  const intent = await services.db
    .select()
    .from(posOauthStates)
    .where(and(eq(posOauthStates.hash, hash), eq(posOauthStates.userId, userId)))
    .get();
  ensure(intent && intent.expiresAt > Date.now(), "POS_OAUTH_STATE", 403);
  ensure(intent.mode === posMode(services.env), "POS_ENVIRONMENT_MISMATCH", 409);
  const membership = await findStoreMembership(services, userId, intent.storeId);
  ensure(membership && ["owner", "admin"].includes(membership.role), "ADMIN_REQUIRED", 403);
  const existing = await findPosConnection(services, intent.storeId);
  ensure(existing?.status !== "disconnecting", "POS_CONNECTION_REQUIRED", 422);
  const consumed = await services.db
    .delete(posOauthStates)
    .where(and(eq(posOauthStates.hash, hash), eq(posOauthStates.userId, userId)))
    .returning();
  ensure(consumed.length === 1, "POS_OAUTH_STATE", 403);
  const applicationId = services.env.TABLECAST_SQUARE_APPLICATION_ID;
  const applicationSecret = services.env.TABLECAST_SQUARE_APPLICATION_SECRET;
  ensure(
    applicationId && applicationSecret && posConfigured(services.env),
    "POS_NOT_CONFIGURED",
    503,
  );
  const token = await exchangeSquareToken(
    {
      applicationId,
      applicationSecret,
      code,
      redirectUri: new URL("/api/pos/square/callback", services.env.TABLECAST_PUBLIC_ORIGIN).href,
    },
    { environment: squareEnvironment(services.env) },
  );
  ensure(!existing || existing.mode === posMode(services.env), "POS_ENVIRONMENT_MISMATCH", 409);
  ensure(!existing || existing.merchantId === token.merchantId, "POS_CONNECTION_CONFLICT", 409);
  const id = existing?.id ?? crypto.randomUUID();
  const credentials = await sealPosCredentials(services.env, id, {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
  });
  if (existing) {
    const updated = await services.db
      .update(posConnections)
      .set({
        credentials,
        expiresAt: token.expiresAt,
        status: "connected",
        revision: existing.revision + 1,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(posConnections.id, id),
          eq(posConnections.credentials, existing.credentials),
          eq(posConnections.status, existing.status),
          eq(posConnections.revision, existing.revision),
        ),
      );
    ensure(updated.meta.changes === 1, "POS_CONNECTION_CONFLICT");
  } else {
    const inserted = await services.db
      .insert(posConnections)
      .values({
        id,
        storeId: intent.storeId,
        provider: "square",
        mode: posMode(services.env),
        merchantId: token.merchantId,
        status: "connected",
        locationId: null,
        deviceId: "",
        credentials,
        expiresAt: token.expiresAt,
        revision: 0,
        mappingsJson: "[]",
        updatedAt: Date.now(),
      })
      .onConflictDoNothing();
    ensure(inserted.meta.changes === 1, "POS_CONNECTION_CONFLICT");
  }
  return intent.storeId;
}
export async function disconnectPos(services: ApiServices, actor: Actor) {
  requirePosStaff(actor, true);
  let connection = await findPosConnection(services, actor.storeId);
  ensure(connection, "POS_CONNECTION_REQUIRED", 422);
  if (connection.status === "disconnected") return getPosSettings(services, actor);
  ensure(connection.mode === posMode(services.env), "POS_ENVIRONMENT_MISMATCH", 409);
  if (connection.status !== "disconnecting") {
    const claimed = await services.db
      .update(posConnections)
      .set({ status: "disconnecting", revision: connection.revision + 1, updatedAt: Date.now() })
      .where(
        and(
          eq(posConnections.id, connection.id),
          eq(posConnections.status, connection.status),
          eq(posConnections.credentials, connection.credentials),
          eq(posConnections.revision, connection.revision),
          notExists(activeConnectionCheckout(services, connection.id)),
        ),
      )
      .returning();
    ensure(claimed[0], "POS_CHECKOUT_LOCKED");
    connection = claimed[0];
  }
  const applicationId = services.env.TABLECAST_SQUARE_APPLICATION_ID;
  const applicationSecret = services.env.TABLECAST_SQUARE_APPLICATION_SECRET;
  ensure(applicationId && applicationSecret, "POS_NOT_CONFIGURED", 503);
  const credentials = await readPosCredentials(services.env, connection.id, connection.credentials);
  await revokeSquareToken(applicationId, applicationSecret, credentials.accessToken, {
    environment: squareEnvironment(services.env),
  });
  const completed = await services.db
    .update(posConnections)
    .set({ status: "disconnected", credentials: "", expiresAt: 0, updatedAt: Date.now() })
    .where(
      and(
        eq(posConnections.id, connection.id),
        eq(posConnections.credentials, connection.credentials),
        eq(posConnections.status, "disconnecting"),
        eq(posConnections.revision, connection.revision),
      ),
    );
  if (completed.meta.changes !== 1) {
    const latest = await findPosConnection(services, actor.storeId);
    ensure(latest?.status === "disconnected", "POS_CONNECTION_CONFLICT");
  }
  return getPosSettings(services, actor);
}
