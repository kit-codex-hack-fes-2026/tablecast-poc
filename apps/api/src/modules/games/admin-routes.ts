import { z } from "zod";
import { apiFactory } from "../../platform/http";
import { validate, validateQuery } from "../../platform/validation";
import { publishGameSchema, registerGameSchema } from "./model";
import { getGame, listGames } from "./queries";
import {
  confirmGamePreview,
  disableGame,
  previewGame,
  publishGame,
  registerGame,
  validateGame,
} from "./use-cases/publication";

export const gamesAdminRoutes = apiFactory
  .createApp()
  .get("/", validateQuery(z.object({ after: z.string().max(60).default("") })), async (c) =>
    c.json(await listGames(c.get("services"), c.get("actor"), c.req.valid("query").after), 200),
  )
  .post("/", validate(registerGameSchema), async (c) =>
    c.json(await registerGame(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .get("/:gameId", validateQuery(z.object({ before: z.uuid().optional() })), async (c) =>
    c.json(
      await getGame(
        c.get("services"),
        c.get("actor"),
        c.req.param("gameId"),
        c.req.valid("query").before,
      ),
      200,
    ),
  )
  .post("/:gameId/versions/:versionId/validate", async (c) =>
    c.json(
      await validateGame(
        c.get("services"),
        c.get("actor"),
        c.req.param("gameId"),
        c.req.param("versionId"),
      ),
      200,
    ),
  )
  .get("/:gameId/versions/:versionId/preview", async (c) =>
    c.json(
      await previewGame(
        c.get("services"),
        c.get("actor"),
        c.req.param("gameId"),
        c.req.param("versionId"),
      ),
      200,
    ),
  )
  .post("/:gameId/versions/:versionId/previewed", async (c) =>
    c.json(
      await confirmGamePreview(
        c.get("services"),
        c.get("actor"),
        c.req.param("gameId"),
        c.req.param("versionId"),
      ),
      200,
    ),
  )
  .post("/:gameId/publish", validate(publishGameSchema), async (c) =>
    c.json(
      await publishGame(
        c.get("services"),
        c.get("actor"),
        c.req.param("gameId"),
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .post(
    "/:gameId/disable",
    validate(z.object({ expectedRevision: z.number().int().nonnegative() }).strict()),
    async (c) =>
      c.json(
        await disableGame(
          c.get("services"),
          c.get("actor"),
          c.req.param("gameId"),
          c.req.valid("json").expectedRevision,
        ),
        200,
      ),
  );
