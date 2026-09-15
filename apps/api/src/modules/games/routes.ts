import { z } from "zod";
import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate, validateQuery } from "../../platform/validation";
import { saveGameStateSchema } from "./model";
import { getGameRun, listTableGames } from "./queries";
import { endGame, saveGameState, startGame } from "./service";

export const gamesTableRoutes = new Hono<ApiEnv>()
  .get("/", validateQuery(z.object({ after: z.string().max(60).default("") })), async (c) =>
    c.json(
      await listTableGames(c.get("services"), c.get("actor"), c.req.valid("query").after),
      200,
    ),
  )
  .post("/:gameId/start", async (c) =>
    c.json(await startGame(c.get("services"), c.get("actor"), c.req.param("gameId")), 200),
  )
  .get("/runs/:runId", async (c) =>
    c.json(await getGameRun(c.get("services"), c.get("actor"), c.req.param("runId")), 200),
  )
  .put("/runs/:runId/state", validate(saveGameStateSchema), async (c) =>
    c.json(
      await saveGameState(
        c.get("services"),
        c.get("actor"),
        c.req.param("runId"),
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .post("/runs/:runId/end", async (c) =>
    c.json(await endGame(c.get("services"), c.get("actor"), c.req.param("runId")), 200),
  );
