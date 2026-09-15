import { and, eq, exists, isNotNull, isNull, sql } from "drizzle-orm";
import { gamePlugins, gameRuns, gameVersions, tableSessions } from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import { getSession } from "../tables/queries";
import { gameManifestSchema, type GamePackage, type GameState } from "./model";
import { getGame, getGameRun, getGameVersion, readGamePackage } from "./queries";

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
  input: { versionId: string; expectedRevision: number; approved: true },
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

export async function startGame(services: ApiServices, actor: Actor, gameId: string) {
  const session = await getSession(services, actor);
  const db = services.db;
  const current = await db
    .select({ version: gameVersions })
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
        eq(gamePlugins.id, gameId),
        isNotNull(gameVersions.published_by),
      ),
    )
    .get();
  ensure(current, "GAME_UNAVAILABLE", 409);
  const manifest = gameManifestSchema.parse(JSON.parse(current.version.manifest_json));
  ensure(
    session.guest_count >= manifest.minPlayers && session.guest_count <= manifest.maxPlayers,
    "GAME_PLAYER_COUNT",
    409,
  );
  const gamePackage = await readGamePackage(services, current.version.package_key);
  const id = crypto.randomUUID();
  const inserted = await db
    .insert(gameRuns)
    .select(
      db
        .select({
          id: sql<string>`${id}`.as("id"),
          store_id: gamePlugins.store_id,
          table_session_id: sql<string>`${session.id}`.as("table_session_id"),
          game_id: gamePlugins.id,
          version_id: sql<string>`${current.version.id}`.as("version_id"),
          state_json: sql<string>`'{}'`.as("state_json"),
          revision: sql<number>`0`.as("revision"),
          ended_at: sql<null>`NULL`.as("ended_at"),
        })
        .from(gamePlugins)
        .where(
          and(
            eq(gamePlugins.store_id, actor.storeId),
            eq(gamePlugins.id, gameId),
            eq(gamePlugins.active_version_id, current.version.id),
            exists(
              db
                .select()
                .from(tableSessions)
                .where(and(eq(tableSessions.id, session.id), eq(tableSessions.status, "open"))),
            ),
          ),
        ),
    )
    .returning({ id: gameRuns.id });
  ensure(inserted.length, "GAME_UNAVAILABLE", 409);
  return {
    id,
    versionId: current.version.id,
    package: gamePackage,
    revision: 0,
    state: {} as GameState,
    locale: session.locale,
    players: session.guest_count,
    parentOrigin: services.env.TABLECAST_PUBLIC_ORIGIN,
  };
}

export async function saveGameState(
  services: ApiServices,
  actor: Actor,
  runId: string,
  input: { expectedVersion: number; state: GameState },
) {
  const run = await getGameRun(services, actor, runId);
  ensure(run.manifest.capabilities.includes("state"), "GAME_CAPABILITY_FORBIDDEN", 403);
  const db = services.db;
  const rows = await db
    .update(gameRuns)
    .set({ state_json: JSON.stringify(input.state), revision: sql`${gameRuns.revision}+1` })
    .where(
      and(
        eq(gameRuns.id, runId),
        eq(gameRuns.store_id, actor.storeId),
        eq(gameRuns.revision, input.expectedVersion),
        isNull(gameRuns.ended_at),
        exists(
          db
            .select()
            .from(gamePlugins)
            .where(
              and(
                eq(gamePlugins.store_id, actor.storeId),
                eq(gamePlugins.id, run.gameId),
                isNotNull(gamePlugins.active_version_id),
              ),
            ),
        ),
        exists(
          db
            .select()
            .from(tableSessions)
            .where(
              and(
                eq(tableSessions.id, gameRuns.table_session_id),
                eq(tableSessions.status, "open"),
              ),
            ),
        ),
      ),
    )
    .returning({ revision: gameRuns.revision });
  ensure(rows[0], "GAME_CONFLICT", 409);
  return rows[0];
}

export async function endGame(services: ApiServices, actor: Actor, runId: string) {
  const session = await getSession(services, actor);
  await services.db
    .update(gameRuns)
    .set({ ended_at: Date.now() })
    .where(
      and(
        eq(gameRuns.id, runId),
        eq(gameRuns.store_id, actor.storeId),
        eq(gameRuns.table_session_id, session.id),
        isNull(gameRuns.ended_at),
      ),
    );
  return { ended: true };
}
