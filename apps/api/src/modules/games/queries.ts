import { and, desc, eq, gt, lt, or, isNull, isNotNull } from "drizzle-orm";
import { gamePlugins, gameRuns, gameVersions } from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { getSession } from "../tables/queries";
import { gameManifestSchema, gamePackageSchema, gameStateSchema } from "./model";

export async function listGames(services: ApiServices, actor: Actor, after = "") {
  const rows = await services.db
    .select()
    .from(gamePlugins)
    .where(and(eq(gamePlugins.store_id, actor.storeId), gt(gamePlugins.id, after)))
    .orderBy(gamePlugins.id)
    .limit(51);
  return {
    games: rows.slice(0, 50).map((row) => ({
      id: row.id,
      activeVersionId: row.active_version_id,
      revision: row.revision,
    })),
    next: rows.length > 50 ? rows[49]?.id : null,
  };
}

export async function getGame(
  services: ApiServices,
  actor: Actor,
  gameId: string,
  before?: string,
) {
  const cursor = before ? await getGameVersion(services, actor, gameId, before) : undefined;
  const [games, versions] = await services.db.batch([
    services.db
      .select()
      .from(gamePlugins)
      .where(and(eq(gamePlugins.store_id, actor.storeId), eq(gamePlugins.id, gameId))),
    services.db
      .select()
      .from(gameVersions)
      .where(
        and(
          eq(gameVersions.store_id, actor.storeId),
          eq(gameVersions.game_id, gameId),
          cursor
            ? or(
                lt(gameVersions.created_at, cursor.created_at),
                and(eq(gameVersions.created_at, cursor.created_at), lt(gameVersions.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(gameVersions.created_at), desc(gameVersions.id))
      .limit(21),
  ]);
  const game = games[0];
  ensure(game, "GAME_NOT_FOUND", 404);
  return {
    id: game.id,
    activeVersionId: game.active_version_id,
    revision: game.revision,
    versions: versions.slice(0, 20).map((row) => ({
      id: row.id,
      manifest: gameManifestSchema.parse(JSON.parse(row.manifest_json)),
      status: row.status,
      previewed: !!row.previewed_by,
      published: !!row.published_by,
      createdAt: row.created_at,
    })),
    nextBefore: versions.length > 20 ? versions[19]?.id : null,
  };
}

export async function getGameVersion(
  services: ApiServices,
  actor: Actor,
  gameId: string,
  versionId: string,
) {
  const version = await services.db
    .select()
    .from(gameVersions)
    .where(
      and(
        eq(gameVersions.store_id, actor.storeId),
        eq(gameVersions.game_id, gameId),
        eq(gameVersions.id, versionId),
      ),
    )
    .get();
  ensure(version, "GAME_NOT_FOUND", 404);
  return version;
}

export async function readGamePackage(services: ApiServices, packageKey: string) {
  const object = await services.env.TABLECAST_MEDIA.get(packageKey);
  ensure(object, "GAME_PACKAGE_MISSING", 409);
  return gamePackageSchema.parse(await object.json());
}

export async function listTableGames(services: ApiServices, actor: Actor, after = "") {
  await getSession(services, actor);
  const rows = await services.db
    .select({
      id: gamePlugins.id,
      versionId: gameVersions.id,
      manifest: gameVersions.manifest_json,
    })
    .from(gamePlugins)
    .innerJoin(
      gameVersions,
      and(
        eq(gameVersions.id, gamePlugins.active_version_id),
        eq(gameVersions.store_id, gamePlugins.store_id),
      ),
    )
    .where(
      and(
        eq(gamePlugins.store_id, actor.storeId),
        gt(gamePlugins.id, after),
        isNotNull(gameVersions.published_by),
      ),
    )
    .orderBy(gamePlugins.id)
    .limit(51);
  return {
    games: rows.slice(0, 50).map((row) => ({
      id: row.id,
      versionId: row.versionId,
      manifest: gameManifestSchema.parse(JSON.parse(row.manifest)),
    })),
    next: rows.length > 50 ? rows[49]?.id : null,
  };
}

export async function getGameRun(services: ApiServices, actor: Actor, runId: string) {
  const session = await getSession(services, actor);
  const row = await services.db
    .select({ run: gameRuns, manifest: gameVersions.manifest_json })
    .from(gameRuns)
    .innerJoin(
      gamePlugins,
      and(eq(gamePlugins.id, gameRuns.game_id), eq(gamePlugins.store_id, gameRuns.store_id)),
    )
    .innerJoin(gameVersions, eq(gameVersions.id, gameRuns.version_id))
    .where(
      and(
        eq(gameRuns.id, runId),
        eq(gameRuns.store_id, actor.storeId),
        eq(gameRuns.table_session_id, session.id),
        isNull(gameRuns.ended_at),
        isNotNull(gamePlugins.active_version_id),
      ),
    )
    .get();
  ensure(row, "GAME_UNAVAILABLE", 409);
  return {
    id: row.run.id,
    gameId: row.run.game_id,
    versionId: row.run.version_id,
    manifest: gameManifestSchema.parse(JSON.parse(row.manifest)),
    state: gameStateSchema.parse(JSON.parse(row.run.state_json)),
    revision: row.run.revision,
  };
}
