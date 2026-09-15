import { instructionResponse } from "./instruction-response";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate, validateQuery } from "../../platform/validation";
import { configurationSchema, draftChoicesQuerySchema } from "./model";
import {
  createDraft,
  discardDraft,
  getDraft,
  listDrafts,
  listDraftChoices,
  publishDraft,
  updateDraft,
  validateDraft,
} from "./service";
const versionSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();

export const configurationAdminRoutes = new Hono<ApiEnv>()
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
      instructionResponse(
        await createDraft(c.get("services"), c.get("actor")),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .get("/drafts/choices", validateQuery(draftChoicesQuerySchema), async (c) =>
    c.json(await listDraftChoices(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .get("/drafts/:id", async (c) =>
    c.json(
      instructionResponse(
        await getDraft(c.get("services"), c.get("actor"), c.req.param("id")),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .put(
    "/drafts/:id",
    validate(
      z
        .object({
          expectedVersion: z.number().int(),
          configuration: configurationSchema,
          instructionFormatVersion: z.literal(1).optional(),
        })
        .strict(),
    ),
    async (c) =>
      c.json(
        instructionResponse(
          await updateDraft(
            c.get("services"),
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("json"),
          ),
          c.req.header("X-Tablecast-Instructions"),
        ),
        200,
      ),
  )
  .post("/drafts/:id/validate", validate(versionSchema), async (c) =>
    c.json(
      instructionResponse(
        await validateDraft(
          c.get("services"),
          c.get("actor"),
          c.req.param("id"),
          c.req.valid("json").expectedVersion,
        ),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .post("/drafts/:id/discard", validate(versionSchema), async (c) =>
    c.json(
      instructionResponse(
        await discardDraft(
          c.get("services"),
          c.get("actor"),
          c.req.param("id"),
          c.req.valid("json").expectedVersion,
        ),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  )
  .post(
    "/drafts/:id/publish",
    validate(
      z
        .object({
          expectedVersion: z.number().int(),
          baseVersion: z.number().int(),
          idempotencyKey: z.string().min(8).max(100),
          approved: z.literal(true),
        })
        .strict(),
    ),
    async (c) =>
      c.json(
        instructionResponse(
          await publishDraft(
            c.get("services"),
            c.get("actor"),
            c.req.param("id"),
            c.req.valid("json"),
          ),
          c.req.header("X-Tablecast-Instructions"),
        ),
        200,
      ),
  );
