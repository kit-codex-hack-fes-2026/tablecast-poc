import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { configurationSchema } from "./model";
import {
  createDraft,
  discardDraft,
  getDraft,
  listDrafts,
  publishDraft,
  updateDraft,
  validateDraft,
} from "./service";
const versionSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();

export const configurationAdminRoutes = new Hono<ApiEnv>()
  .get("/drafts", async (c) => c.json(await listDrafts(c.get("services"), c.get("actor"))))
  .post("/drafts", async (c) => c.json(await createDraft(c.get("services"), c.get("actor"))))
  .get("/drafts/:id", async (c) =>
    c.json(await getDraft(c.get("services"), c.get("actor"), c.req.param("id"))),
  )
  .put(
    "/drafts/:id",
    validate(
      z.object({ expectedVersion: z.number().int(), configuration: configurationSchema }).strict(),
    ),
    async (c) =>
      c.json(
        await updateDraft(
          c.get("services"),
          c.get("actor"),
          c.req.param("id"),
          c.req.valid("json"),
        ),
      ),
  )
  .post("/drafts/:id/validate", validate(versionSchema), async (c) =>
    c.json(
      await validateDraft(
        c.get("services"),
        c.get("actor"),
        c.req.param("id"),
        c.req.valid("json").expectedVersion,
      ),
    ),
  )
  .post("/drafts/:id/discard", validate(versionSchema), async (c) =>
    c.json(
      await discardDraft(
        c.get("services"),
        c.get("actor"),
        c.req.param("id"),
        c.req.valid("json").expectedVersion,
      ),
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
        await publishDraft(
          c.get("services"),
          c.get("actor"),
          c.req.param("id"),
          c.req.valid("json"),
        ),
      ),
  );
