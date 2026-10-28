import { z } from "zod";
import { apiFactory } from "../../platform/http";
import { validate, validateQuery } from "../../platform/validation";
import { withImageAssets } from "../media/queries";
import { previewConditions } from "./conditions";
import { instructionResponse } from "./instruction-response";
import {
  conditionPreviewSchema,
  configurationHistoryQuerySchema,
  configurationRestoreSchema,
  draftChoicesQuerySchema,
  draftPublishSchema,
  draftUpdateSchema,
} from "./model";
import {
  getConfigurationHistory,
  getConfigurationRelease,
  getDraft,
  listDraftChoices,
  listDrafts,
} from "./queries";
import {
  createDraft,
  discardDraft,
  restoreConfigurationRelease,
  updateDraft,
  validateDraft,
} from "./use-cases/drafts";
import { publishDraft } from "./use-cases/publish";
const versionSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();

export const configurationAdminRoutes = apiFactory
  .createApp()
  .get("/configuration/history", validateQuery(configurationHistoryQuerySchema), async (c) =>
    c.json(await getConfigurationHistory(c.var.services, c.var.actor, c.req.valid("query")), 200),
  )
  .get("/configuration/releases/:version", async (c) =>
    c.json(
      await getConfigurationRelease(c.var.services, c.var.actor, Number(c.req.param("version"))),
      200,
    ),
  )
  .post(
    "/configuration/releases/:version/restore",
    validate(configurationRestoreSchema),
    async (c) =>
      c.json(
        await withImageAssets(
          c.var.services,
          instructionResponse(
            await restoreConfigurationRelease(
              c.var.services,
              c.var.actor,
              Number(c.req.param("version")),
              c.req.valid("json"),
            ),
            c.req.header("X-Tablecast-Instructions"),
          ),
        ),
        200,
      ),
  )
  .post("/conditions/preview", validate(conditionPreviewSchema), (c) =>
    c.json(previewConditions(c.get("actor"), c.req.valid("json")), 200),
  )
  .get("/drafts", async (c) => {
    const result = await listDrafts(c.get("services"), c.get("actor"));
    return c.json(
      {
        drafts: result.drafts.map((draft) =>
          instructionResponse(draft, c.req.header("X-Tablecast-Instructions")),
        ),
      },
      200,
    );
  })
  .post("/drafts", async (c) =>
    c.json(
      await withImageAssets(
        c.var.services,
        instructionResponse(
          await createDraft(c.get("services"), c.get("actor")),
          c.req.header("X-Tablecast-Instructions"),
        ),
      ),
      200,
    ),
  )
  .get("/drafts/choices", validateQuery(draftChoicesQuerySchema), async (c) =>
    c.json(await listDraftChoices(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .get("/drafts/:id", async (c) =>
    c.json(
      await withImageAssets(
        c.var.services,
        instructionResponse(
          await getDraft(c.get("services"), c.get("actor"), c.req.param("id")),
          c.req.header("X-Tablecast-Instructions"),
        ),
      ),
      200,
    ),
  )
  .put("/drafts/:id", validate(draftUpdateSchema), async (c) =>
    c.json(
      await withImageAssets(
        c.var.services,
        instructionResponse(
          await updateDraft(
            c.get("services"),
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("json"),
          ),
          c.req.header("X-Tablecast-Instructions"),
        ),
      ),
      200,
    ),
  )
  .post("/drafts/:id/validate", validate(versionSchema), async (c) =>
    c.json(
      await withImageAssets(
        c.var.services,
        instructionResponse(
          await validateDraft(
            c.get("services"),
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("json").expectedVersion,
          ),
          c.req.header("X-Tablecast-Instructions"),
        ),
      ),
      200,
    ),
  )
  .post("/drafts/:id/discard", validate(versionSchema), async (c) =>
    c.json(
      await withImageAssets(
        c.var.services,
        instructionResponse(
          await discardDraft(
            c.get("services"),
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("json").expectedVersion,
          ),
          c.req.header("X-Tablecast-Instructions"),
        ),
      ),
      200,
    ),
  )
  .post("/drafts/:id/publish", validate(draftPublishSchema), async (c) =>
    c.json(
      await withImageAssets(
        c.var.services,
        instructionResponse(
          await publishDraft(
            c.get("services"),
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("json"),
          ),
          c.req.header("X-Tablecast-Instructions"),
        ),
      ),
      200,
    ),
  );
