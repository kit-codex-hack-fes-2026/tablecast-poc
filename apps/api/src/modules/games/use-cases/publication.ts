import { and, eq, exists, isNull, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import { gamePlugins, gameRuns, gameVersions } from "../../../db/games-schema";
import { ensure } from "../../../platform/errors";
import { requireManager } from "../../auth/policy";
import { type GamePackage } from "../model";
import { getGame, getGameVersion, readGamePackage } from "../queries";

export async function registerGame(
  services: ApiServices,
  actor: Actor,
  input: { gameId: string; package: GamePackage },
) {
  requireManager(actor);
  const id = crypto.randomUUID();
  const key = `tablecast/games/${actor.storeId}/${id}.json`;
  await services.env.TABLECAST_MEDIA.put(key, JSON.stringify(input.package), {
    httpMetadata: { contentType: "application/json" },
  });
  await services.db.batch([
    services.db
      .insert(gamePlugins)
      .values({ store_id: actor.storeId, id: input.gameId })
      .onConflictDoNothing(),
    services.db.insert(gameVersions).values({
      id,
      store_id: actor.storeId,
      game_id: input.gameId,
      manifest_json: JSON.stringify(input.package.manifest),
      package_key: key,
      created_at: Date.now(),
    }),
  ]);
  return { gameId: input.gameId, versionId: id, status: "draft" as const };
}

export async function validateGame(
  services: ApiServices,
  actor: Actor,
  gameId: string,
  versionId: string,
) {
  requireManager(actor);
  const version = await getGameVersion(services, actor, gameId, versionId);
  await readGamePackage(services, version.package_key);
  await services.db
    .update(gameVersions)
    .set({ status: "ready" })
    .where(and(eq(gameVersions.id, versionId), eq(gameVersions.store_id, actor.storeId)));
  return {
    versionId,
    valid: true,
    checks: ["package-schema", "package-size", "supported-capabilities", "bilingual-manifest"],
    requiresPreview: true,
    reviewUrl: `${services.env.TABLECAST_PUBLIC_ORIGIN}/admin/stores/${encodeURIComponent(actor.storeId)}/games`,
  };
}

export async function previewGame(
  services: ApiServices,
  actor: Actor,
  gameId: string,
  versionId: string,
) {
  requireManager(actor);
  const version = await getGameVersion(services, actor, gameId, versionId);
  ensure(version.status === "ready", "GAME_NOT_VALIDATED", 409);
  return {
    versionId,
    package: await readGamePackage(services, version.package_key),
    parentOrigin: services.env.TABLECAST_PUBLIC_ORIGIN,
  };
}

export async function confirmGamePreview(
  services: ApiServices,
  actor: Actor,
  gameId: string,
  versionId: string,
) {
  requireManager(actor);
  ensure(actor.kind === "staff" && actor.userId, "HUMAN_APPROVAL_REQUIRED", 403);
  const rows = await services.db
    .update(gameVersions)
    .set({ previewed_by: actor.userId })
    .where(
      and(
        eq(gameVersions.id, versionId),
        eq(gameVersions.game_id, gameId),
        eq(gameVersions.store_id, actor.storeId),
        eq(gameVersions.status, "ready"),
      ),
    )
    .returning({ id: gameVersions.id });
  ensure(rows.length, "GAME_NOT_VALIDATED", 409);
  return { versionId };
}

export async function publishGame(
  services: ApiServices,
  actor: Actor,
  gameId: string,
  input: { approved: true; expectedRevision: number; versionId: string },
) {
  requireManager(actor);
  ensure(actor.kind === "staff" && actor.userId, "HUMAN_APPROVAL_REQUIRED", 403);
  ensure(input.approved, "APPROVAL_REQUIRED", 422);
  const version = await getGameVersion(services, actor, gameId, input.versionId);
  ensure(version.status === "ready" && version.previewed_by, "GAME_PREVIEW_REQUIRED", 409);
  await readGamePackage(services, version.package_key);
  const db = services.db;
  const mutationId = crypto.randomUUID();
  const [changed] = await db.batch([
    db
      .update(gamePlugins)
      .set({
        active_version_id: version.id,
        revision: sql`${gamePlugins.revision}+1`,
        mutation_id: mutationId,
      })
      .where(
        and(
          eq(gamePlugins.store_id, actor.storeId),
          eq(gamePlugins.id, gameId),
          eq(gamePlugins.revision, input.expectedRevision),
        ),
      )
      .returning({ id: gamePlugins.id }),
    db
      .update(gameVersions)
      .set({ published_by: actor.userId })
      .where(
        and(
          eq(gameVersions.id, version.id),
          exists(
            db
              .select()
              .from(gamePlugins)
              .where(
                and(
                  eq(gamePlugins.store_id, actor.storeId),
                  eq(gamePlugins.id, gameId),
                  eq(gamePlugins.mutation_id, mutationId),
                ),
              ),
          ),
        ),
      ),
  ]);
  ensure(changed.length, "GAME_CONFLICT", 409);
  return getGame(services, actor, gameId);
}

export async function disableGame(
  services: ApiServices,
  actor: Actor,
  gameId: string,
  expectedRevision: number,
) {
  requireManager(actor);
  ensure(actor.kind === "staff" && actor.userId, "HUMAN_APPROVAL_REQUIRED", 403);
  const db = services.db;
  const mutationId = crypto.randomUUID();
  const [changed] = await db.batch([
    db
      .update(gamePlugins)
      .set({
        active_version_id: null,
        revision: sql`${gamePlugins.revision}+1`,
        mutation_id: mutationId,
      })
      .where(
        and(
          eq(gamePlugins.store_id, actor.storeId),
          eq(gamePlugins.id, gameId),
          eq(gamePlugins.revision, expectedRevision),
        ),
      )
      .returning({ id: gamePlugins.id }),
    db
      .update(gameRuns)
      .set({ ended_at: Date.now() })
      .where(
        and(
          eq(gameRuns.store_id, actor.storeId),
          eq(gameRuns.game_id, gameId),
          isNull(gameRuns.ended_at),
          exists(
            db
              .select()
              .from(gamePlugins)
              .where(
                and(
                  eq(gamePlugins.store_id, actor.storeId),
                  eq(gamePlugins.id, gameId),
                  eq(gamePlugins.mutation_id, mutationId),
                ),
              ),
          ),
        ),
      ),
  ]);
  ensure(changed.length, "GAME_CONFLICT", 409);
  return getGame(services, actor, gameId);
}
