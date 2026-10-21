import type { z } from "zod";
import { and, eq, exists, isNotNull, isNull, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import { gamePlugins, gameRuns, gameVersions } from "../../../db/games-schema";
import { tableSessions } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { getSession } from "../../tables/queries";
import { gameManifestSchema, type GameState, type saveGameStateSchema } from "../model";
import { getGameRun, readGamePackage } from "../queries";

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
  input: z.infer<typeof saveGameStateSchema>,
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
